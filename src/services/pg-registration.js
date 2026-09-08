import { dataClient } from '../data-client.js';

export async function registerPgAccount(input) {
  return dataClient.request('/auth/pg-register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
