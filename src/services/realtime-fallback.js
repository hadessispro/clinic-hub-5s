export function pollingSubscription(task, intervalMs = 5000) {
  let stopped = false;
  let running = false;
  const run = async () => {
    if (stopped || running || document.visibilityState === 'hidden' || !navigator.onLine) return;
    running = true;
    try { await task(); } catch (error) { console.warn('[Live refresh] Poll failed:', error); }
    finally { running = false; }
  };
  const timer = window.setInterval(run, intervalMs);
  return { unsubscribe() { stopped = true; window.clearInterval(timer); } };
}

export function idleSubscription() {
  return { unsubscribe() {} };
}
