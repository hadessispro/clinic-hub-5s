export function canUseRequestedShift({ requestedShift, defaultShift, assignedShift, allowedShifts = [] }) {
  const requested = String(requestedShift || '');
  if (!requested) return false;
  return requested === String(defaultShift || '')
    || requested === String(assignedShift || '')
    || allowedShifts.some((shift) => String(shift || '') === requested);
}

