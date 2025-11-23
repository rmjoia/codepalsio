interface ClientPrincipal {
	identityProvider: string;
	userId: string;
	userDetails: string;
	claims: Array<{ typ: string; val: string }>;
}

export async function getAuthStatus(): Promise<ClientPrincipal | null> {
	try {
		const response = await fetch('/.auth/me');
		if (response.ok) {
			const data = await response.json();
			return data.clientPrincipal || null;
		}
	} catch (error) {
		console.error('Error fetching auth info:', error);
	}
	return null;
}
