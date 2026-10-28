// Vercel route /api/pair/<code> (RELAY-002/003): the page posts a deck, the headset polls.
import { handleRequest } from '../_relay.mjs';

// The code is the last path segment; the relay core validates its format.
function pathFor(request) {
  const segments = new URL(request.url).pathname.split('/');
  return `/pair/${segments[segments.length - 1]}`;
}

export const POST = (request) => handleRequest(request, pathFor(request));
export const GET = (request) => handleRequest(request, pathFor(request));
