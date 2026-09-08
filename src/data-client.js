import { localClient } from './local-client.js';

// Clinic Hub now has one authoritative runtime: the VPS API backed by
// PostgreSQL. There is deliberately no cloud-provider fallback here.
export const dataClient = localClient;
