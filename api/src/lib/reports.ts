import type { Container } from '@azure/cosmos';
import { getContainer } from './cosmos';

/**
 * The five reason categories a user can pick when submitting a report.
 * Literal union keeps the wire payload type-safe both ways: the handler
 * rejects any string outside this set, and the admin queue (S4) renders
 * known reasons only. Changes here MUST update:
 *   - the client-side modal in src/pages/find/profile.astro
 *   - the admin queue rendering in src/pages/admin/reports.astro (S4)
 *   - the ToS clause enumeration in TERMS.md Section 10
 */
export const REPORT_REASONS = [
	'off_topic',
	'harassment',
	'impersonation',
	'spam',
	'other',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export function isReportReason(value: unknown): value is ReportReason {
	return typeof value === 'string' && (REPORT_REASONS as readonly string[]).includes(value);
}

/** Status of a report in the moderation queue lifecycle.
 *  - `open`: just submitted, awaiting a moderator decision
 *  - `resolved`: moderator took action (unlist / suspend); handled
 *  - `dismissed`: moderator reviewed and found no violation
 *
 *  `resolved` vs `dismissed` is the signal to a future "repeat offender"
 *  heuristic — dismissed reports don't count toward anything; resolved
 *  ones do. */
export const REPORT_STATUS_VALUES = ['open', 'resolved', 'dismissed'] as const;
export type ReportStatus = (typeof REPORT_STATUS_VALUES)[number];

/**
 * Persisted report. Stored in the `reports` Cosmos container, partitioned
 * by `/reportedProfileId` (makes the admin-queue "all reports for profile
 * X" read a single-partition query).
 *
 * De-duplication strategy (FR-112, "upsert within a 24h window"): the
 * `id` is deterministic — `report-<reporterId>:<reportedProfileId>:<dayBucket>`
 * where `dayBucket = Math.floor(nowMillis / 86400000)`. Two submissions
 * from the same reporter targeting the same profile within the same UTC
 * day bucket land on the same id → upsert overwrites. Across the boundary
 * they get different ids → separate rows. This is a close-enough
 * approximation of a rolling 24h window at a fraction of the RU cost
 * (deterministic id → point upsert; rolling window would need a query
 * first). The one edge case — a user reporting at 23:59 UTC and again at
 * 00:01 the next day — produces two rows, which is acceptable for the
 * brigading-prevention purpose.
 */
export interface ReportRecord {
	id: string;
	/** SWA principal id of the user who filed this report */
	reporterId: string;
	/** The reported profile's id — matches the partition key path */
	reportedProfileId: string;
	/** The reported user's SWA principal id — denormalised for the admin
	 *  queue's join with the `users` container (suspend action in S5). */
	reportedUserId: string;
	/** The reported user's GitHub login at submission time. Denormalised
	 *  so the S5 suspend path can look up the user record by `gh-<login>`
	 *  without re-fetching the profile. Optional for compatibility with
	 *  pre-S5 reports; the suspend handler falls back to the profile read
	 *  when absent. */
	reportedUsername?: string;
	reason: ReportReason;
	/** Optional free-text context from the reporter, capped at 500 chars. */
	note?: string;
	createdAt: string;
	/** Set on upsert when a report within the same dedup window is
	 *  re-submitted. Absent on first write. */
	updatedAt?: string;
	status: ReportStatus;
	/** Set when a moderator resolves/dismisses in S4. */
	resolution?: {
		adminId: string;
		action: 'dismiss' | 'unlist' | 'suspend';
		timestamp: string;
	};
}

/** 24h bucket in whole UTC days. */
export const DAY_MS = 24 * 60 * 60 * 1000;

/** Deterministic report id for the (reporter, reported, UTC-day) tuple.
 *  See ReportRecord doc comment for the dedup rationale. */
export function reportIdFor(reporterId: string, reportedProfileId: string, nowMs: number): string {
	const bucket = Math.floor(nowMs / DAY_MS);
	return `report-${reporterId}:${reportedProfileId}:${bucket}`;
}

/**
 * Repository abstraction for reports. Handlers depend on this interface,
 * not on Cosmos directly, so tests can inject an in-memory fake. Mirrors
 * the UserRepository shape in `./users.ts`.
 */
export interface ReportRepository {
	/** Upsert by the deterministic id above. If a row with the same id
	 *  exists, its `note` and `updatedAt` are refreshed, `createdAt` and
	 *  `status` are preserved. */
	upsert(record: ReportRecord): Promise<ReportRecord>;
	/** Point-read by (id, partitionKey). Returns null on 404. */
	findById(id: string, reportedProfileId: string): Promise<ReportRecord | null>;
	/** List all open reports, newest first. Cross-partition query —
	 *  bounded by the admin queue's page size at the UI layer. */
	listOpen(): Promise<ReportRecord[]>;
}

class CosmosReportRepository implements ReportRepository {
	private readonly container: Container;
	constructor(connectionString: string, database: string) {
		this.container = getContainer(connectionString, database, 'reports');
	}

	async upsert(record: ReportRecord): Promise<ReportRecord> {
		const { resource } = await this.container.items.upsert<ReportRecord>(record);
		return (resource as ReportRecord | undefined) ?? record;
	}

	async findById(id: string, reportedProfileId: string): Promise<ReportRecord | null> {
		try {
			const { resource } = await this.container.item(id, reportedProfileId).read<ReportRecord>();
			return resource ?? null;
		} catch (e: unknown) {
			if (isNotFound(e)) return null;
			throw e;
		}
	}

	async listOpen(): Promise<ReportRecord[]> {
		const { resources } = await this.container.items
			.query<ReportRecord>({
				query: "SELECT * FROM c WHERE c.status = 'open' ORDER BY c.createdAt DESC",
			})
			.fetchAll();
		return resources;
	}
}

function isNotFound(err: unknown): boolean {
	return (
		typeof err === 'object' &&
		err !== null &&
		'code' in err &&
		(err as { code: unknown }).code === 404
	);
}

export function createReportRepository(
	connectionString: string,
	database: string
): ReportRepository {
	return new CosmosReportRepository(connectionString, database);
}
