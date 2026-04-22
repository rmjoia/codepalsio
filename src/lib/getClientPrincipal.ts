export interface ClientPrincipal {
	userId: string;
	userDetails: string;
	identityProvider: string;
	userRoles: string[];
	claims?: Array<{ typ: string; val: string }>;
}

export function getClientPrincipal(request: Request): ClientPrincipal | null {
	const header = request.headers.get('x-ms-client-principal');
	if (!header) return null;

	try {
		const decoded = Buffer.from(header, 'base64').toString('utf-8');
		return JSON.parse(decoded) as ClientPrincipal;
	} catch {
		return null;
	}
}

export function getAvatarUrl(principal: ClientPrincipal): string {
	return principal.claims?.find((c) => c.typ === 'avatar_url')?.val ?? '';
}

export function hasRole(principal: ClientPrincipal | null, role: string): boolean {
	return !!principal?.userRoles?.includes(role);
}
