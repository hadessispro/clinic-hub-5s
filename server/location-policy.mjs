const DEFAULT_PREFERRED_ACCURACY_M = 50;

export function evaluateAttendanceLocation({
  distance,
  accuracy,
  allowedRadius,
  maxAccuracy,
  preferredAccuracy = DEFAULT_PREFERRED_ACCURACY_M,
}) {
  const measuredDistance = Math.max(0, Number(distance));
  const measuredAccuracy = Math.max(0, Number(accuracy));
  const radius = Math.max(20, Number(allowedRadius));
  const accuracyLimit = Math.max(10, Number(maxAccuracy));
  const preferredLimit = Math.min(accuracyLimit, Math.max(10, Number(preferredAccuracy)));
  const accurate = Number.isFinite(measuredAccuracy)
    && measuredAccuracy > 0
    && measuredAccuracy <= accuracyLimit;

  // Indoor GPS often reports 50-100 m accuracy. Subtract only the uncertainty
  // above the normal 50 m baseline, keeping distance + accuracy no less strict
  // than the former 100 m radius / 50 m accuracy policy.
  const effectiveRadius = measuredAccuracy <= preferredLimit
    ? radius
    : Math.max(20, radius - (measuredAccuracy - preferredLimit));

  return {
    accurate,
    inside: accurate && Number.isFinite(measuredDistance) && measuredDistance <= effectiveRadius,
    effectiveRadius: Math.round(effectiveRadius),
    indoorMode: measuredAccuracy > preferredLimit,
  };
}
