// Vercel route /api/pair/<code> (RELAY-002/003): the page posts a deck, the headset polls.
import { codeFromPath } from '../../lib/http.mjs';
import { handleRequest } from '../_relay.mjs';

const pathFor = (request) => `/pair/${codeFromPath(new URL(request.url).pathname)}`;

export const POST = (request) => handleRequest(request, pathFor(request));
export const GET = (request) => handleRequest(request, pathFor(request));
