const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const client = fs.readFileSync(require.resolve('../index.html'), 'utf8');
const dateHelpers = client.match(/\/\/ SENT_TODAY_HELPERS_START([\s\S]*?)\/\/ SENT_TODAY_HELPERS_END/);
const validationHelpers = client.match(/\/\/ MINER_VALIDATION_HELPERS_START([\s\S]*?)\/\/ MINER_VALIDATION_HELPERS_END/);
assert.ok(dateHelpers, 'Date helper block must remain testable.');
assert.ok(validationHelpers, 'Miner validation helper block must remain testable.');

const context = { Date, Intl, Map, Set, String, Number, Array };
vm.createContext(context);
vm.runInContext(`${dateHelpers[1]}${validationHelpers[1]}; this.helpers = { groupPendingMinerUpdates, pendingTransactions, pendingUpdatesForMiner, pendingProofRequired, minerActionSheetDate, appendMinerValidationRemark, validationRemarkMarker };`, context);
const { groupPendingMinerUpdates, pendingTransactions, pendingUpdatesForMiner, pendingProofRequired, minerActionSheetDate, appendMinerValidationRemark, validationRemarkMarker } = context.helpers;

const update = {
  id: 'update-1', status: '3a', createdAt: '2026-10-03T05:47:00Z', actionAt: '2026-10-03T05:47:00Z',
  seeker: { id: '260901.1', name: 'Leah Bulusan', tab: 'SEP26', row: 42 },
  miner: { name: 'Gerry Orgasan' },
};
let grouped = groupPendingMinerUpdates([update]);
assert.equal(grouped.items.length, 1, 'A valid pending update must render once.');
assert.equal(grouped.conflicts.length, 0);

grouped = groupPendingMinerUpdates([update, { ...update, id: 'update-2', status: '3b' }]);
assert.equal(grouped.items.length, 0, 'Conflicting pending updates must not be silently selected.');
assert.equal(grouped.conflicts.length, 1);
assert.equal(grouped.conflicts[0].updates.length, 2);
assert.equal(pendingTransactions(grouped.items, grouped.conflicts).length, 2, 'Each exact unresolved transaction contributes once to the pending count.');

grouped = groupPendingMinerUpdates([{ ...update, latestNudgedAt: '2026-10-03T06:47:00Z' }]);
assert.equal(pendingTransactions(grouped.items, grouped.conflicts).length, 1, 'A nudge must not create another pending transaction.');

for (const withdrawn of [
  { ...update, state: 'withdrawn' },
  { ...update, validationStatus: 'withdrawn' },
]) {
  grouped = groupPendingMinerUpdates([withdrawn]);
  assert.equal(pendingTransactions(grouped.items, grouped.conflicts).length, 0, 'A withdrawn transaction must not remain visible or counted.');
}

const miner = { name: 'Gerry Orgasan', assignment: 'MR' };
assert.equal(pendingUpdatesForMiner(miner, [{ ...update, assignment: 'MR' }]).length, 1, 'The assigned Miner receives the pending badge.');
assert.equal(pendingUpdatesForMiner(miner, [{ ...update, assignment: 'RG' }]).length, 0, 'Another IMT assignment must not receive the pending badge.');
assert.equal(pendingUpdatesForMiner({ name: 'Another Miner', assignment: 'MR' }, [{ ...update, assignment: 'MR' }]).length, 0, 'Another Miner must not receive the pending badge.');

assert.equal(minerActionSheetDate('2026-10-03T05:47:00Z'), '10/3/2026');
assert.equal(minerActionSheetDate('invalid'), '');
for (const status of ['3a', '3b', '5', '6a', '6b', '6c', '7', '8']) assert.equal(pendingProofRequired(status), true, `${status} requires exact-update proof.`);

const firstRemark = appendMinerValidationRemark('Prior note', update, 'Confirmed');
assert.match(firstRemark, /Prior note \|\| \[Miner validation:update-1\]/);
assert.equal(appendMinerValidationRemark(firstRemark, update, 'Confirmed'), firstRemark, 'Retry must not duplicate the validation remark.');
assert.equal(validationRemarkMarker('update-1'), '[Miner validation:update-1]');

const bridge = require('../api/miner-updates')._test;
assert.equal(bridge.cleanAction('validate'), 'validate');
assert.equal(bridge.cleanAction('acknowledge'), 'acknowledge');
assert.equal(bridge.cleanAction('reject'), 'reject');
assert.equal(bridge.cleanAction('delete'), '');
assert.deepEqual(bridge.cleanIds(['one', 'one', 'two']), ['one', 'two']);

const approveStart = client.indexOf('async function approvePendingMinerUpdate');
const rejectStart = client.indexOf('async function rejectPendingMinerUpdate');
assert.ok(approveStart > -1 && rejectStart > approveStart);
const approveSource = client.slice(approveStart, rejectStart);
assert.ok(approveSource.indexOf("action: 'validate'") < approveSource.indexOf('values:batchUpdate'), 'Bridge validation must happen before Harvest write.');
assert.ok(approveSource.indexOf('values:batchUpdate') < approveSource.indexOf("action: 'acknowledge'"), 'Miner result must resolve only after Harvest write.');
assert.match(approveSource, /appendMinerValidationRemark/);
assert.match(approveSource, /freshPendingUpdate/);

const rejectEnd = client.indexOf('\n      async function saveMinerUpdates', rejectStart);
const rejectSource = client.slice(rejectStart, rejectEnd);
assert.match(rejectSource, /action: 'reject'/);
assert.doesNotMatch(rejectSource, /values:batchUpdate/, 'Reject must never write Harvest.');
assert.match(client, /latestNudgedAt/);
assert.match(client, /Multiple unresolved Miner updates were found/);
assert.match(client, /id="notificationBtn"/);
assert.match(client, /data-action="focus-miner-validation"/);
assert.match(client, /aria-haspopup="menu"/);
assert.match(client, /setAccountMenuOpen\(false\)/);

console.log('Pending-validation tests passed.');
