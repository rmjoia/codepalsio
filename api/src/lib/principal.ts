import type { HttpRequest } from '@azure/functions';
import type { ClientPrincipal } from './types';

/**
 * Decode the Static Web Apps client principal from the
 * `x-ms-client-principal` header. Returns null for anonymous calls or
 * if the header isn't a valid base64 JSON document.
 */
export function getClientPrincipal(request: HttpRequest): ClientPrincipal | null {
	const header = request.headers.get('x-ms-client-principal');
	if (!header) return null;
	try {
		return JSON.parse(Buffer.from(header, 'base64').toString('utf-8'));
	} catch {
		return null;
	}
}
