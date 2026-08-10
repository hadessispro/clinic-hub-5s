import assert from 'node:assert/strict';
import { canUseRequestedShift } from '../server/shift-policy.mjs';

assert.equal(canUseRequestedShift({ requestedShift: 'clinic-0800', defaultShift: 'clinic-0800' }), true);
assert.equal(canUseRequestedShift({ requestedShift: 'doctor-1000', assignedShift: 'doctor-1000' }), true);
assert.equal(canUseRequestedShift({ requestedShift: 'doctor-1000', allowedShifts: ['doctor-0800', 'doctor-1000'] }), true);
assert.equal(canUseRequestedShift({ requestedShift: 'doctor-1000', defaultShift: 'clinic-0800', allowedShifts: [] }), false);

console.log('shift policy: ok');
