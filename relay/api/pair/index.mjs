// Vercel route /api/pair (RELAY-001): the headset requests a pairing code.
import { handleRequest } from '../_relay.mjs';

export const POST = (request) => handleRequest(request, '/pair');
export const GET = (request) => handleRequest(request, '/pair');
