import { supabase } from '../supabase.js';
import { store } from '../store.js';
import { pollingSubscription } from './realtime-fallback.js';
import { dispatchNotificationPush } from './push-notifications.js';

/**
 * Fetch all notifications for the current authenticated user.
 * @returns {Promise<Array>} List of notification database rows
 */
export async function getNotifications() {
  try {
    const { user } = store.getState();
    if (!user) return [];

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('[Notifications Service] getNotifications error:', error);
    return [];
  }
}

/**
 * Mark a specific notification as read.
 * @param {string} id - The notification UUID
 * @returns {Promise<boolean>} Success status
 */
export async function markAsRead(id) {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', id);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('[Notifications Service] markAsRead error:', error);
    return false;
  }
}

/**
 * Mark all unread notifications of the current user as read.
 * @returns {Promise<boolean>} Success status
 */
export async function markAllAsRead() {
  try {
    const { user } = store.getState();
    if (!user) return false;

    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('read', false);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('[Notifications Service] markAllAsRead error:', error);
    return false;
  }
}

/**
 * Sends a notification to another user specified by their employee code.
 * Used internally when tasks or leave requests change.
 * @param {string} employeeCode - Target employee code
 * @param {string} title - Notification title
 * @param {string} body - Notification body text
 * @param {string} type - Notification category (task, leave, general, etc.)
 * @param {string} linkView - View name to redirect the user to when clicked
 * @returns {Promise<Object|null>} Inserted notification row data
 */
export async function sendNotification(employeeCode, title, body, type = 'general', linkView = '') {
  try {
    // 1. Resolve employee_code to user UUID from profiles table
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('employee_code', employeeCode)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile) {
      console.warn(`[Notifications Service] Profile not found for employee_code: ${employeeCode}`);
      return null;
    }

    // 2. Insert notification row
    const { data, error } = await supabase
      .from('notifications')
      .insert({
        user_id: profile.id,
        title,
        body,
        type,
        link_view: linkView,
        read: false
      })
      .select()
      .single();

    if (error) throw error;
    dispatchNotificationPush(data.id);
    return data;
  } catch (error) {
    console.error('[Notifications Service] sendNotification error:', error);
    return null;
  }
}

/**
 * Sets up a realtime subscription for new notifications inserted for a user.
 * @param {string} userId - Current user UUID
 * @param {Function} callback - Triggered when a new notification is inserted
 * @returns {Object} Realtime subscription object
 */
export function subscribeToNotifications(userId, callback) {
  if (!userId) return null;
  const known = new Set((store.getState().notifications || []).map((item) => item.id));
  return pollingSubscription(async () => {
    const rows = await getNotifications();
    rows.slice().reverse().forEach((row) => {
      if (!known.has(row.id)) {
        known.add(row.id);
        callback(row);
      }
    });
  }, 5000);
}
