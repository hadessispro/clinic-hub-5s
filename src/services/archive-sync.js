import { dataClient } from '../data-client.js';

export async function triggerArchive2Months() {
  if (!navigator.onLine) {
    throw new Error('Vui lòng kết nối mạng để thực hiện xuất archive.');
  }
  const { data: result, error } = await dataClient.rpc('archive_old_records');
  if (error) throw error;
  return result;
}
