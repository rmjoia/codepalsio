import {
	app,
	type HttpRequest,
	type InvocationContext,
	type HttpResponseInit,
} from '@azure/functions';
import { getClientPrincipal } from './lib/principal';
import { getCosmosConfig, getContainer } from './lib/cosmos';
import { createUserRepository } from './lib/users';
import { assertNotSuspended } from './lib/suspension';
import {
	createReportRepository,
	isReportReason,
	reportIdFor,
	type ReportRecord,
} from './lib/reports';
import { trimmedString } from './lib/validation';
import type { Profile } from './lib/types';

/**
 * POST /api/report — submit a moderation report against another user's
 * profile. Implements spec 003 US2 (FR-110..FR-113).
 *
 * Flow:
 *  1. Authenticated-only (SWA route gate + principal guard).
 *  2. Validate body: reason in allow-list, note ≤ 500 chars.
 *  3. Look up the reported profile. Reject if it doesn't exist, or if it
 *     belongs to the caller (self-report).
 *  4. Build a deterministic id — see `reportIdFor` — and upsert. Second
 *     submission within the same UTC day bucket refreshes the note +
 *     updatedAt; a new day gets a new row.
 *  5. Respond with a non-detailed `{ success: true }` toast — never
 *     outcome specifics (FR-113).
 *
 * Exported as a named function so unit tests can call the handler
 * directly without bringing up the Functions runtime (same pattern as
 * profile-save.ts).
 */
export async function reportSubmitHandler(
	request: HttpRequest,
	context: InvocationContext
): Promise<HttpResponseInit> {
	const principal = getClientPrincipal(request);
	if (!principal) {
		return { status: 401, jsonBody: { error: 'Not authenticated' } };
	}

	const cfg = getCosmosConfig();
	if (!cfg) {
		context.error('report-submit: missing COSMOS_DB_CONNECTION_STRING or COSMOS_DB_DATABASE_NAME');
		return { status: 500, jsonBody: { error: 'Server configuration error' } };
	}

	// Suspension gate (spec 003 FR-124b). A suspended user cannot file
	// reports — the enforcement layer stays symmetric: suspension blocks
	// writes, including meta-writes about other users.
	const suspended = await assertNotSuspended(
		principal,
		createUserRepository(cfg.connectionString, cfg.database)
	);
	if (suspended) return suspended;

	let body: Record<string, unknown>;
	try {
		const parsed = await request.json();
		if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
			return { status: 400, jsonBody: { error: 'Invalid JSON body' } };
		}
		body = parsed as Record<string, unknown>;
	} catch {
		return { status: 400, jsonBody: { error: 'Invalid JSON body' } };
	}

	// Reason — strict allow-list.
	if (!isReportReason(body.reason)) {
		return { status: 400, jsonBody: { error: 'Invalid reason' } };
	}
	const reason = body.reason;

	// Reported profile id — required, must be a string.
	const reportedProfileId =
		typeof body.reportedProfileId === 'string' ? body.reportedProfileId : '';
	if (!reportedProfileId) {
		return { status: 400, jsonBody: { error: 'reportedProfileId is required' } };
	}

	// Note — optional, capped at 500 chars. trimmedString returns undefined
	// for empty-after-trim, which is exactly what we want for optional
	// fields.
	const note = trimmedString(body.note, 500);

	// Resolve the reported profile — must exist, must not be the caller's
	// own profile (self-report rejection per spec edge cases).
	const profilesContainer = getContainer(cfg.connectionString, cfg.database, 'profiles');
	let reportedProfile: Profile | null = null;
	try {
		// Profiles are partitioned by /userId, and we only have the
		// profile id. Cross-partition query is the only path from id →
		// profile without a secondary lookup. OK at report volume (one
		// report per button-click; not a hot path).
		const { resources } = await profilesContainer.items
			.query<Profile>({
				query: 'SELECT * FROM c WHERE c.id = @id',
				parameters: [{ name: '@id', value: reportedProfileId }],
			})
			.fetchAll();
		reportedProfile = resources[0] ?? null;
	} catch (error) {
		context.error('report-submit: failed to look up reported profile', error);
		return { status: 500, jsonBody: { error: 'Failed to process report' } };
	}

	if (!reportedProfile) {
		return { status: 404, jsonBody: { error: 'Reported profile not found' } };
	}

	if (reportedProfile.userId === principal.userId) {
		// Self-report rejected per spec 003 edge cases ("You can edit/
		// delete your profile directly"). Client-side also blocks the
		// button on your own profile; this is defence in depth.
		return { status: 400, jsonBody: { error: 'You cannot report your own profile' } };
	}

	// Build the deterministic id. UTC-day bucket collapses same-day
	// resubmissions onto one row (upsert overwrites) — see FR-112 rationale
	// in lib/reports.ts.
	const now = new Date();
	const nowMs = now.getTime();
	const id = reportIdFor(principal.userId, reportedProfileId, nowMs);
	const nowIso = now.toISOString();

	const reportRepo = createReportRepository(cfg.connectionString, cfg.database);

	// Check whether a row with this id already exists; if so we preserve
	// its createdAt and set updatedAt. If not, this is a first write.
	let existing: ReportRecord | null = null;
	try {
		existing = await reportRepo.findById(id, reportedProfileId);
	} catch (error) {
		context.error('report-submit: failed to read existing report', error);
		return { status: 500, jsonBody: { error: 'Failed to process report' } };
	}

	const record: ReportRecord = {
		id,
		reporterId: principal.userId,
		reportedProfileId,
		reportedUserId: reportedProfile.userId,
		reportedUsername: reportedProfile.githubUsername,
		reason,
		note,
		createdAt: existing?.createdAt ?? nowIso,
		updatedAt: existing ? nowIso : undefined,
		// Preserve status if the row was already resolved/dismissed within
		// the same dedup window — don't let a resubmission reopen a
		// settled report. Admin's call stands.
		status: existing?.status ?? 'open',
		resolution: existing?.resolution,
	};

	try {
		await reportRepo.upsert(record);
	} catch (error) {
		context.error('report-submit: upsert failed', error);
		return { status: 500, jsonBody: { error: 'Failed to process report' } };
	}

	context.log(
		`report-submit: ${existing ? 'updated' : 'created'} report ${id} ` +
			`by reporter=${principal.userId} against profile=${reportedProfileId} reason=${reason}`
	);

	return { status: 200, jsonBody: { success: true } };
}

app.http('report-submit', {
	methods: ['POST'],
	authLevel: 'anonymous',
	handler: reportSubmitHandler,
});
