import {
	app,
	type HttpRequest,
	type InvocationContext,
	type HttpResponseInit,
} from '@azure/functions';
import { getClientPrincipal } from './lib/principal';
import { getCosmosConfig } from './lib/cosmos';
import { createReportRepository, type ReportRecord } from './lib/reports';
import { createAdminRosterRepository, type AdminRosterRepository } from './lib/admin-roster';
import { createUserRepository, type UserRepository } from './lib/users';
import { isAdminFor, parseAdminLogins, principalHasAdminRole } from './lib/roles';
import type { ClientPrincipal } from './lib/types';

/**
 * Shape surfaced to the admin UI. Mirrors ReportRecord but adds the
 * aggregated `reportCount` — if the same (reporter, reported) pair has
 * multiple rows within the dedup window (shouldn't by design, but could
 * post-container-manual-edit) or if MULTIPLE reporters flag the same
 * profile, this is how the queue surfaces that signal. The reporter's
 * identity for the row IS visible to admins (needed to resolve the
 * report) but the aggregation is per reported-profile.
 */
export interface ReportQueueEntry extends ReportRecord {
	/** Number of open reports targeting the same reported profile. 1 for
	 *  single reports; >1 flags a brigading / spike pattern per spec 003
	 *  edge cases. The admin UI renders a visual cue for >1. */
	reportCount: number;
}

export interface ReportsListRepos {
	reports: ReturnType<typeof createReportRepository>;
	users: UserRepository;
	roster: AdminRosterRepository;
	bootstrapLogins?: ReadonlySet<string>;
	/** Test seam — bypass the roster lookup. Default: real isAdminFor. */
	verifyAdmin?: (principal: ClientPrincipal) => Promise<boolean>;
}

/**
 * GET /api/reports-list — moderation queue. Admin-only.
 *
 * Returns open reports newest-first with per-reported-profile aggregation
 * (reportCount surfaces brigading / spike patterns). Resolved and
 * dismissed reports are deliberately excluded — the "resolved history"
 * is accessible via a future endpoint, not this one.
 */
export async function reportsListHandler(
	request: HttpRequest,
	context: InvocationContext,
	overrideRepos?: ReportsListRepos
): Promise<HttpResponseInit> {
	const principal = getClientPrincipal(request);
	if (!principal) {
		return { status: 401, jsonBody: { error: 'Not authenticated' } };
	}

	let repos = overrideRepos;
	if (!repos) {
		const cfg = getCosmosConfig();
		if (!cfg) {
			context.error('reports-list: missing COSMOS_DB_CONNECTION_STRING or COSMOS_DB_DATABASE_NAME');
			return { status: 500, jsonBody: { error: 'Server configuration error' } };
		}
		repos = {
			reports: createReportRepository(cfg.connectionString, cfg.database),
			users: createUserRepository(cfg.connectionString, cfg.database),
			roster: createAdminRosterRepository(cfg.connectionString, cfg.database),
			bootstrapLogins: parseAdminLogins(process.env.ADMIN_GITHUB_LOGINS),
		};
	}

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

	let open: ReportRecord[];
	try {
		open = await repos.reports.listOpen();
	} catch (error) {
		context.error('reports-list: query failed', error);
		return { status: 500, jsonBody: { error: 'Failed to list reports' } };
	}

	// Group by reportedProfileId to surface brigading. The repository
	// already sorts by createdAt DESC, so the first row we see per profile
	// is the newest — that's the one we surface, with reportCount
	// reflecting the total.
	const byProfile = new Map<string, { newest: ReportRecord; count: number }>();
	for (const r of open) {
		const existing = byProfile.get(r.reportedProfileId);
		if (existing) {
			existing.count += 1;
		} else {
			byProfile.set(r.reportedProfileId, { newest: r, count: 1 });
		}
	}

	const reports: ReportQueueEntry[] = Array.from(byProfile.values())
		.sort((a, b) => (a.newest.createdAt < b.newest.createdAt ? 1 : -1))
		.map(({ newest, count }) => ({ ...newest, reportCount: count }));

	return { status: 200, jsonBody: { reports } };
}

app.http('reports-list', {
	methods: ['GET'],
	authLevel: 'anonymous',
	handler: reportsListHandler,
});
