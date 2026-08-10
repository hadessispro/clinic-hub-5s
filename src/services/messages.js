import { supabase } from '../supabase.js';
import { pollingSubscription } from './realtime-fallback.js';

export function conversationChannel(userId, contactId) {
  if (contactId === 'global') return 'global';
  return `dm:${[userId, contactId].sort().join(':')}`;
}

export function mapMessageToUI(db) {
  if (!db) return null;
  return {
    id: db.id,
    channel: db.channel,
    senderId: db.sender_id,
    recipientId: db.recipient_id,
    scope: db.message_scope || 'direct',
    author: db.author_code,
    text: db.body,
    time: db.created_at,
  };
}

export async function getMessageContacts() {
  const { data, error } = await supabase.rpc('list_message_contacts');
  if (error) throw error;
  return (data || []).map((row) => ({
    userId: row.user_id,
    employeeCode: row.employee_code || '',
    name: row.full_name,
    department: row.department || '',
    title: row.title || '',
    role: row.contact_role,
  }));
}

export async function getMessages(contactId, userId) {
  const channel = conversationChannel(userId, contactId);
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('channel', channel)
    .order('created_at', { ascending: true })
    .limit(300);
  if (error) throw error;
  return (data || []).map(mapMessageToUI);
}

export async function getRecentIncomingMessages(userId, since) {
  let query = supabase
    .from('messages')
    .select('*')
    .neq('sender_id', userId)
    .order('created_at', { ascending: true })
    .limit(200);
  if (since) query = query.gt('created_at', since);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(mapMessageToUI);
}

export async function sendMessage({ contactId, userId, author, text }) {
  const global = contactId === 'global';
  const row = {
    channel: conversationChannel(userId, contactId),
    sender_id: userId,
    recipient_id: global ? null : contactId,
    message_scope: global ? 'global' : 'direct',
    author_code: author || null,
    body: text,
  };
  const { data, error } = await supabase.from('messages').insert(row).select().single();
  if (error) throw error;
  return mapMessageToUI(data);
}

export function subscribeToMessages(contactId, userId, callback) {
  let ready = false;
  const known = new Set();
  return pollingSubscription(async () => {
    const rows = await getMessages(contactId, userId);
    if (!ready) {
      rows.forEach((row) => known.add(row.id));
      ready = true;
      return;
    }
    rows.forEach((row) => {
      if (!known.has(row.id)) { known.add(row.id); callback(row); }
    });
  }, 4000);
}

export function subscribeToIncomingMessages(userId, callback) {
  let since = new Date().toISOString();
  const known = new Set();
  return pollingSubscription(async () => {
    const rows = await getRecentIncomingMessages(userId, since);
    rows.forEach((message) => {
      if (!known.has(message.id)) { known.add(message.id); callback(message); }
    });
    if (rows.length) since = rows[rows.length - 1].time;
  }, 4000);
}
