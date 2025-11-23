import { handler } from '../dist/server/entry.mjs';

export default async function (context, req) {
	return await handler(req);
}
