import webpush from 'web-push';

function configureWebPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@nhakhoa5s.vn',
    publicKey,
    privateKey,
  );
  return true;
}

export async function dispatchPushNotifications(db, notifications = []) {
  if (!configureWebPush() || !notifications.length) return { sent: 0, skipped: notifications.length };
  let sent = 0;
  for (const notification of notifications) {
    const { data: subscriptions, error } = await db.from('push_subscriptions')
      .select('id,endpoint,p256dh,auth_key')
      .eq('user_id', notification.user_id)
      .eq('active', true);
    if (error) continue;
    let lastError = '';
    for (const subscription of subscriptions || []) {
      try {
        await webpush.sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth_key },
        }, JSON.stringify({
          id: notification.id,
          title: notification.title,
          body: notification.body || '',
          type: notification.type || 'general',
          view: notification.link_view || 'dashboard',
          url: `/?view=${encodeURIComponent(notification.link_view || 'dashboard')}`,
        }), { TTL: 300, urgency: 'high' });
        sent += 1;
      } catch (pushError) {
        lastError = String(pushError?.message || pushError).slice(0, 500);
        if ([404, 410].includes(pushError?.statusCode)) {
          await db.from('push_subscriptions').update({ active: false, updated_at: new Date().toISOString() })
            .eq('id', subscription.id);
        }
      }
    }
    await db.from('notifications').update({
      push_sent_at: sent > 0 ? new Date().toISOString() : null,
      push_attempts: Number(notification.push_attempts || 0) + 1,
      push_last_error: lastError || null,
    }).eq('id', notification.id);
  }
  return { sent, skipped: 0 };
}

export async function insertNotificationsAndPush(db, rows) {
  if (!rows?.length) return [];
  const { data, error } = await db.from('notifications').insert(rows).select('*');
  if (error) throw error;
  await dispatchPushNotifications(db, data || []);
  return data || [];
}

