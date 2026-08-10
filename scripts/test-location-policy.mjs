import assert from 'node:assert/strict';
import { evaluateAttendanceLocation } from '../server/location-policy.mjs';

assert.deepEqual(
  evaluateAttendanceLocation({ distance: 99, accuracy: 30, allowedRadius: 100, maxAccuracy: 100 }),
  { accurate: true, inside: true, effectiveRadius: 100, indoorMode: false },
);
assert.deepEqual(
  evaluateAttendanceLocation({ distance: 20, accuracy: 78, allowedRadius: 100, maxAccuracy: 100 }),
  { accurate: true, inside: true, effectiveRadius: 22, indoorMode: true },
);
assert.equal(
  evaluateAttendanceLocation({ distance: 23, accuracy: 78, allowedRadius: 100, maxAccuracy: 100 }).inside,
  false,
);
assert.equal(
  evaluateAttendanceLocation({ distance: 0, accuracy: 101, allowedRadius: 100, maxAccuracy: 100 }).accurate,
  false,
);

console.log('location policy: ok');
