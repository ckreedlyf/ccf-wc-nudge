const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const client = fs.readFileSync(require.resolve('../index.html'), 'utf8');
const helperBlock = client.match(/\/\/ SENT_TODAY_HELPERS_START([\s\S]*?)\/\/ SENT_TODAY_HELPERS_END/);
assert.ok(helperBlock, 'Sent-today helper block must remain testable.');
const context = { Date, Intl };
vm.createContext(context);
vm.runInContext(`${helperBlock[1]}; this.sentHelpers = { isDateLastTouchToday, minerWasSentToday, queueTodayCounts };`, context);
const { isDateLastTouchToday, minerWasSentToday, queueTodayCounts } = context.sentHelpers;

const today = new Date('2026-09-29T04:00:00Z');
assert.equal(isDateLastTouchToday('09/29/2026', today), true);
assert.equal(isDateLastTouchToday('09/28/2026', today), false);
assert.equal(isDateLastTouchToday('09/01/2026', today), false);
assert.equal(isDateLastTouchToday('', today), false);
assert.equal(isDateLastTouchToday('2026-09-29T08:30:00Z', today), true);
assert.equal(isDateLastTouchToday('2026-09-28T16:30:00Z', today), true, '00:30 in Asia/Singapore is Sep 29.');
assert.equal(isDateLastTouchToday('2026-09-29T16:00:00Z', today), false, '00:00 in Asia/Singapore is Sep 30.');

const queue = [
  { seekers: [{ lastTouch: '09/29/2026' }] },
  { seekers: [{ lastTouch: '09/28/2026' }] },
  { seekers: [{ lastTouch: '' }] },
];
assert.equal(minerWasSentToday(queue[0], today), true);
assert.equal(minerWasSentToday({ seekers: [{ lastTouch: '09/29/2026' }, { lastTouch: '09/28/2026' }] }, today), false);
const counts = queueTodayCounts(queue, today);
assert.equal(counts.queue, 3);
assert.equal(counts.sent, 1);
assert.equal(counts.remaining, 2);

const fourteenPending = Array.from({ length: 14 }, () => ({ seekers: [{ lastTouch: '09/28/2026' }] }));
const noneSent = queueTodayCounts(fourteenPending, today);
assert.equal(noneSent.sent, 0);
assert.equal(noneSent.remaining, 14);
const threeSent = queueTodayCounts(fourteenPending.map((miner, index) => index < 3 ? { seekers: [{ lastTouch: '09/29/2026' }] } : miner), today);
assert.equal(threeSent.queue, 14);
assert.equal(threeSent.sent, 3);
assert.equal(threeSent.remaining, 11);
console.log('Sent-counter tests passed.');
