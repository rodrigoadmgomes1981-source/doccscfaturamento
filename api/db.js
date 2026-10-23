import { handle } from '../server/api.js';

export const GET = (request) => handle(request, 'db');
export const POST = (request) => handle(request, 'db');
