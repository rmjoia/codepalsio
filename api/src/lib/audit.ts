import type { Container } from '@azure/cosmos';
import { randomUUID } from 'crypto';
import { getContainer } from './cosmos';

/**
 * Enum of moderator actions. Extending this list requires:
 *   - A matching entry here (literal union keeps the writer type-safe)
 *   - Handler code that writes the row (never writes a raw action string)
 *   - A `/admin/audit` listing page if we eventually surface the log
 *
 * The current set covers spec 003 US3 (dismiss/unlist/suspend/unsuspend)
 * plus the existing admin-roster grants/revokes which already carry
 * their own audit metadata on the user record (`grantedBy`, `grantedAt`)
 * — those actions are logged here for a single uniform audit surface.
 */
export const AUDIT_ACTIONS = [
	'dismiss_report',
	'unlist_profile',
	'relist_profile',
	'suspend_user',
	'unsuspend_user',
	'grant_admin',
	'revoke_admin',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/**
 * Append-only moderator-action log. Spec 003 "Key Entities → AuditEntry".
 * Stored in the `audit` Cosmos container, partitioned by `/adminId` so
 * "all actions by moderator X" is a single-partition query.
 *
 * Append-only semantics are a HANDLER DISCIPLINE, not a Cosmos
 * guarantee: there is no delete endpoint, no update endpoint. Any PR
 * that introduces one must be rejected on constitutional-P3 grounds —
 * the audit log is the forensic record for compromised-admin scenarios
 * (spec 003 threat T9) and MUST stay immutable.
 */
export interface AuditEntry {
	id: string;
	/** SWA principal id of the moderator who took the action. Required —
	 *  the whole point of the log is "who did what". */
	adminId: string;
	action: AuditAction;
	/** The reported / affected user. Set for user-level actions
	 *  (suspend/unsuspend, grant/revoke). */
	targetUserId?: string;
	/** The affected profile. Set for profile-level actions (unlist/relist). */
	targetProfileId?: string;
	/** The report that triggered the action, when applicable. Lets the
	 *  admin UI join from a report to the action and vice versa. */
	reportId?: string;
	/** Optional moderator-provided reason. Capped at 500 chars at the
	 *  handler boundary. */
	reason?: string;
	timestamp: string;
}

/**
 * Repository abstraction mirroring UserRepository / ReportRepository.
 * The only two operations are append (write) and query-by-admin (read);
 * the no-delete / no-update shape is enforced by the TypeScript surface
 * here — adding either would require editing this file first.
 */
export interface AuditRepository {
	append(entry: Omit<AuditEntry, 'id' | 'timestamp'>): Promise<AuditEntry>;
	listByAdmin(adminId: string): Promise<AuditEntry[]>;
}

class CosmosAuditRepository implements AuditRepository {
	private readonly container: Container;
	constructor(connectionString: string, database: string) {
		this.container = getContainer(connectionString, database, 'audit');
	}

	async append(entry: Omit<AuditEntry, 'id' | 'timestamp'>): Promise<AuditEntry> {
		const row: AuditEntry = {
			...entry,
			id: `audit-${randomUUID()}`,
			timestamp: new Date().toISOString(),
		};
		const { resource } = await this.container.items.create<AuditEntry>(row);
		return (resource as AuditEntry | undefined) ?? row;
	}

	async listByAdmin(adminId: string): Promise<AuditEntry[]> {
		const { resources } = await this.container.items
			.query<AuditEntry>(
				{
					query: 'SELECT * FROM c WHERE c.adminId = @adminId ORDER BY c.timestamp DESC',
					parameters: [{ name: '@adminId', value: adminId }],
				},
				{ partitionKey: adminId }
			)
			.fetchAll();
		return resources;
	}
}

export function createAuditRepository(connectionString: string, database: string): AuditRepository {
	return new CosmosAuditRepository(connectionString, database);
}
