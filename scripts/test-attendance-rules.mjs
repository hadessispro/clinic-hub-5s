import assert from 'node:assert/strict';
import { classifyAttendance } from '../server/attendance-rules.mjs';

const shift = { startTime: '08:00:00', endTime: '17:00:00', graceMinutes: 5 };

assert.equal(classifyAttendance({ ...shift, type: 'checkin', recordedTime: '07:30:00' }), 'valid');
assert.equal(classifyAttendance({ ...shift, type: 'checkin', recordedTime: '08:00:00' }), 'valid');
assert.equal(classifyAttendance({ ...shift, type: 'checkin', recordedTime: '08:05:00' }), 'valid');
assert.equal(classifyAttendance({ ...shift, type: 'checkin', recordedTime: '08:05:01' }), 'late');
assert.equal(classifyAttendance({ ...shift, type: 'checkout', recordedTime: '16:54:59' }), 'early_leave');
assert.equal(classifyAttendance({ ...shift, type: 'checkout', recordedTime: '16:55:00' }), 'valid');
assert.equal(classifyAttendance({ ...shift, type: 'checkout', recordedTime: '17:00:00' }), 'valid');
assert.equal(classifyAttendance({ ...shift, type: 'checkout', recordedTime: '18:00:00' }), 'valid');

console.log('attendance rules: ok');
