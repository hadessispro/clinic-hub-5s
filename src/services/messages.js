import { supabase } from '../supabase.js';

export function mapMessageToUI(db) {
  if (!db) return null;
  return {
    id: db.id,
    channel: db.channel,
    author: db.author_code,
    text: db.body,
    time: db.created_at,
  };
}

export function mapMessageToDB(ui) {
  return {
    channel: ui.channel,
    author_code: ui.author,
    body: ui.text,
  };
}

export async function getMessages(channelId) {
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('channel', channelId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data.map(mapMessageToUI);
  } catch (error) {
    console.error(`[Messages Service] getMessages for channel (${channelId}) error:`, error);
    throw error;
  }
}

export async function sendMessage(message) {
  try {
    const dbData = mapMessageToDB(message);
    const { data, error } = await supabase
      .from('messages')
      .insert(dbData)
      .select()
      .single();

    if (error) throw error;
    return mapMessageToUI(data);
  } catch (error) {
    console.error('[Messages Service] sendMessage error:', error);
    throw error;
  }
}

/**
 * Subscribes to real-time message inserts in a channel.
 * @param {string} channelId - The channel to subscribe to
 * @param {Function} callback - Function called when a new message arrives
 * @returns {Object} Realtime subscription object to call unsubscribe() on
 */
export function subscribeToMessages(channelId, callback) {
  return supabase
    .channel(`messages:channel:${channelId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `channel=eq.${channelId}`,
    }, (payload) => {
      callback(mapMessageToUI(payload.new));
    })
    .subscribe();
}
