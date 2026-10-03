import {
	app,
	type HttpRequest,
	type InvocationContext,
	type HttpResponseInit,
} from '@azure/functions';
import { getClientPrincipal } from './lib/principal';
import { getContainer, getCosmosConfig } from './lib/cosmos';
import { createReportRepository, type ReportRecord } from './lib/reports';
import { createAuditRepository, type AuditRepository } from './lib/audit';
import { createAdminRosterRepository, type AdminRosterRepository } from './lib/admin-roster';
import { createUserRepository, type UserRepository } from './lib/users';
import { assertNotSuspended } from './lib/suspension';
import { isAdminFor, parseAdminLogins, principalHasAdminRole } from './lib/roles';
import { trimmedString } from './lib/validation';
import type { ClientPrincipal, Profile } from './lib/types';

/**
 * Allowed resolve actions. Pin the literal union here so the server
 * rejects anything else before any Cosmos write.
 *
 * Spec 003 US3 ultimately defines dismiss/unlist/suspend/relist. S4
 * shipped dismiss + unlist; S5 adds suspend (relies on the
 * `assertNotSuspended` enforcement layer in every authenticated handler
 * — see `lib/suspension.ts`). A future slice adds relist.
 */
export const RESOLVE_ACTIONS = ['dismiss', 'unlist', 'suspend'] as const;
export type ResolveAction = (typeof RESOLVE_ACTIONS)[number];

export function isResolveAction(value: unknown): value is ResolveAction {
	return typeof value === 'string' && (RESOLVE_ACTIONS as readonly string[]).includes(value);
}

export interface ReportResolveRepos {
	reports: ReturnType<typeof createReportRepository>;
	audit: AuditRepository;
	users: UserRepository;
	roster: AdminRosterRepository;
	bootstrapLogins?: ReadonlySet<string>;
	verifyAdmin?: (principal: ClientPrincipal) => Promise<boolean>;
	/** Test seams: tests inject these to observe profile mutations without
	 *  wiring the full Cosmos container surface. If omitted, the handler
	 *  reads/writes the real `profiles` container.
	 */
	fetchProfile?: (profileId: string) => Promise<Profile | null>;
	upsertProfile?: (profile: Profile) => Promise<Profile>;
}

/**
 * POST /api/report-resolve — admin-only. Body:
 *   { reportId: string, reportedProfileId: string,
 *     action: 'dismiss'|'unlist'|'suspend', reason?: string }
 *
 * The reportedProfileId is required (and MUST match the stored
 * reportedProfileId on the report row) because Cosmos partition-key
 * reads need both id + partition. We take it from the body rather than
 * cross-partition querying — the admin UI has both at hand.
 *
 * On dismiss: report `status → 'dismissed'`, audit row written, no
 * profile change.
 *
 * On unlist: reported profile gets `profileVisibility: 'private'` AND
 * `unlistedBy: <adminId>` AND `updatedAt`. Report status becomes
 * 'resolved' with a resolution record pointing at the admin. Audit row
 * written. The profile owner's edit page detects `unlistedBy` and shows
 * a moderator-action banner; the visibility toggle is disabled until
 * an admin clears the flag.
 *
 * On suspend (S5): the reported user's UserRecord.suspended is set to
 * true. Every subsequent authenticated API call from that user is
 * blocked by `assertNotSuspended` (lib/suspension.ts) → the frontend
 * fetch wrapper redirects them to /suspended. The report row is
 * resolved + audited the same way as unlist.
 *
 * Self-protection: moderator cannot resolve a report targeting their
 * own profile (even to dismiss — gaming the system is still gaming the
 * system). Server-side guard; client-side also hides the actions.
 */
export async function reportResolveHandler(
	request: HttpRequest,
	context: InvocationContext,
	overrideRepos?: ReportResolveRepos
): Promise<HttpResponseInit> {
	const principal = getClientPrincipal(request);
	if (!principal) {
		return { status: 401, jsonBody: { error: 'Not authenticated' } };
	}

	const cfg = getCosmosConfig();
	if (!overrideRepos && !cfg) {
		context.error('report-resolve: missing COSMOS_DB_CONNECTION_STRING or COSMOS_DB_DATABASE_NAME');
		return { status: 500, jsonBody: { error: 'Server configuration error' } };
	}

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

	const reportId = typeof body.reportId === 'string' ? body.reportId : '';
	const reportedProfileId =
		typeof body.reportedProfileId === 'string' ? body.reportedProfileId : '';
	if (!reportId || !reportedProfileId) {
		return { status: 400, jsonBody: { error: 'reportId and reportedProfileId are required' } };
	}

	if (!isResolveAction(body.action)) {
		return { status: 400, jsonBody: { error: 'Invalid action' } };
	}
	const action = body.action;
	const reason = trimmedString(body.reason, 500);

	const repos: ReportResolveRepos =
		overrideRepos ??
		({
			reports: createReportRepository(cfg!.connectionString, cfg!.database),
			audit: createAuditRepository(cfg!.connectionString, cfg!.database),
			users: createUserRepository(cfg!.connectionString, cfg!.database),
			roster: createAdminRosterRepository(cfg!.connectionString, cfg!.database),
			bootstrapLogins: parseAdminLogins(process.env.ADMIN_GITHUB_LOGINS),
		} satisfies ReportResolveRepos);

	// Suspension gate (spec 003 FR-124b). A suspended admin cannot
	// moderate — suspension overrides the admin role.
	const suspendedResponse = await assertNotSuspended(principal, repos.users);
	if (suspendedResponse) return suspendedResponse;

	const isAdmin = repos.verifyAdmin
		? await repos.verifyAdmin(principal)
		: principalHasAdminRole(principal) ||
			(await isAdminFor(
				{
					swaUserId: principal.userId,
					githubUsername: principal.userDetails,
					identityProvider: principal.identityProvider,
				},
				{
					repo: repos.users,
					roster: repos.roster,
					bootstrapLogins: repos.bootstrapLogins ?? new Set(),
				}
			));
	if (!isAdmin) {
		return { status: 403, jsonBody: { error: 'Forbidden' } };
	}

	let report: ReportRecord | null;
	try {
		report = await repos.reports.findById(reportId, reportedProfileId);
	} catch (error) {
		context.error('report-resolve: findById failed', error);
		return { status: 500, jsonBody: { error: 'Failed to look up report' } };
	}
	if (!report) {
		return { status: 404, jsonBody: { error: 'Report not found' } };
	}

	if (report.status !== 'open') {
		return { status: 409, jsonBody: { error: `Report already ${report.status}` } };
	}

	// Self-protection: never let a moderator resolve a report that
	// targets their own profile — even to dismiss, since dismissing a
	// legitimate complaint is itself a moderator abuse case the audit
	// log can't catch alone. (The anti-self guard is further hardened
	// in S5 for suspension: `assertNotSuspended` + "admin can't suspend
	// themselves" check.)
	if (report.reportedUserId === principal.userId) {
		return {
			status: 403,
			jsonBody: { error: 'You cannot resolve a report against your own profile' },
		};
	}

	const timestamp = new Date().toISOString();

	// If unlisting, mutate the profile FIRST — if that fails, we don't
	// want a resolution row claiming unlist succeeded. Report-row + audit
	// writes come after.
	if (action === 'unlist') {
		const fetchProfile =
			repos.fetchProfile ?? (async (id: string) => defaultFetchProfile(id, cfg!));
		const upsertProfile =
			repos.upsertProfile ?? (async (p: Profile) => defaultUpsertProfile(p, cfg!));

		let existing: Profile | null;
		try {
			existing = await fetchProfile(reportedProfileId);
		} catch (error) {
			context.error('report-resolve: profile lookup failed', error);
			return { status: 500, jsonBody: { error: 'Failed to unlist profile' } };
		}
		if (!existing) {
			return { status: 404, jsonBody: { error: 'Reported profile no longer exists' } };
		}
		try {
			await upsertProfile({
				...existing,
				profileVisibility: 'private',
				unlistedBy: principal.userId,
				updatedAt: timestamp,
			});
		} catch (error) {
			context.error('report-resolve: unlist profile upsert failed', error);
			return { status: 500, jsonBody: { error: 'Failed to unlist profile' } };
		}
	}

	// If suspending (spec 003 US3 / FR-124b): mark the reported user's
	// UserRecord.suspended = true. Enforced on every subsequent request
	// from them via assertNotSuspended on every authenticated handler.
	// Self-protection: moderator cannot suspend themselves (checked
	// above via reportedUserId === principal.userId).
	//
	// Lookup strategy: user records are keyed by `gh-<githubUsername>`,
	// so we need the reported user's GitHub login — not their SWA userId
	// (which is the hashed principal). report-submit denormalises
	// `reportedUsername` onto the report at submission time; we fall back
	// to a profile-read for legacy reports written before S5.
	if (action === 'suspend') {
		try {
			let username = report.reportedUsername;
			if (!username) {
				const fetchProfile =
					repos.fetchProfile ?? (async (id: string) => defaultFetchProfile(id, cfg!));
				const profile = await fetchProfile(reportedProfileId);
				username = profile?.githubUsername;
			}
			if (!username) {
				context.error(
					`report-resolve: cannot resolve githubUsername for suspend ` +
						`(reportId=${report.id}, reportedUserId=${report.reportedUserId})`
				);
				return { status: 500, jsonBody: { error: 'Failed to suspend user' } };
			}
			const target = await repos.users.findByGithubUsernameAcrossShapes(username);
			// If no record exists yet (reported user has never completed
			// first login past user-record creation), we still create one
			// via upsert so the suspension flag sticks the moment they
			// return.
			const record = target ?? {
				id: `gh-${username.toLowerCase()}`,
				githubUsername: username,
				roles: [],
				updatedAt: timestamp,
				swaUserId: report.reportedUserId,
			};
			await repos.users.upsert({
				...record,
				suspended: true,
				updatedAt: timestamp,
			});
		} catch (error) {
			context.error('report-resolve: suspend user upsert failed', error);
			return { status: 500, jsonBody: { error: 'Failed to suspend user' } };
		}
	}

	// Update the report row — preserve all original fields, set status +
	// resolution. The deterministic id makes this a point upsert.
	const resolvedReport: ReportRecord = {
		...report,
		status: action === 'dismiss' ? 'dismissed' : 'resolved',
		updatedAt: timestamp,
		resolution: {
			adminId: principal.userId,
			action,
			timestamp,
		},
	};
	try {
		await repos.reports.upsert(resolvedReport);
	} catch (error) {
		context.error('report-resolve: report upsert failed', error);
		return { status: 500, jsonBody: { error: 'Failed to update report' } };
	}

	// Audit row — append-only.
	const auditAction =
		action === 'dismiss'
			? ('dismiss_report' as const)
			: action === 'unlist'
				? ('unlist_profile' as const)
				: ('suspend_user' as const);
	try {
		await repos.audit.append({
			adminId: principal.userId,
			action: auditAction,
			targetUserId: report.reportedUserId,
			targetProfileId: report.reportedProfileId,
			reportId: report.id,
			reason,
		});
	} catch (error) {
		// Audit failures don't roll back the action — the user has been
		// unlisted / the report dismissed. Log and surface a soft error.
		// The alternative (two-phase commit across containers) isn't
		// supported by Cosmos. Operator can reconstruct the audit entry
		// from logs if needed.
		context.error(
			`report-resolve: audit append failed for admin=${principal.userId} ` +
				`action=${action} report=${report.id}`,
			error
		);
	}

	context.log(
		`report-resolve: admin=${principal.userId} ${action}ed report=${report.id} ` +
			`target=${report.reportedProfileId}`
	);

	return {
		status: 200,
		jsonBody: { success: true, newStatus: resolvedReport.status },
	};
}

/** Default profile reader — one cross-partition query by id. Overridable
 *  via `repos.fetchProfile` for tests. */
async function defaultFetchProfile(
	id: string,
	cfg: { connectionString: string; database: string }
): Promise<Profile | null> {
	const profilesContainer = getContainer(cfg.connectionString, cfg.database, 'profiles');
	const { resources } = await profilesContainer.items
		.query<Profile>({
			query: 'SELECT * FROM c WHERE c.id = @id',
			parameters: [{ name: '@id', value: id }],
		})
		.fetchAll();
	return resources[0] ?? null;
}

/** Default profile writer — upsert into the `profiles` container.
 *  Overridable via `repos.upsertProfile` for tests. */
async function defaultUpsertProfile(
	profile: Profile,
	cfg: { connectionString: string; database: string }
): Promise<Profile> {
	const profilesContainer = getContainer(cfg.connectionString, cfg.database, 'profiles');
	const { resource } = await profilesContainer.items.upsert<Profile>(profile);
	return (resource as Profile | undefined) ?? profile;
}

app.http('report-resolve', {
	methods: ['POST'],
	authLevel: 'anonymous',
	handler: reportResolveHandler,
});
