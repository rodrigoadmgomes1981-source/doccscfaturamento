import { handle } from '../server/api.js';

export const POST = (request) => handle(request, 'auth');
