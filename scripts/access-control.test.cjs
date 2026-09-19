const assert = require('node:assert/strict');
const { _test } = require('../api/sheets');
const { _test: updateTest } = require('../api/miner-updates');

const sheetId = process.env.CCF_SHEET_ID || '1TI_bslfoK96fhM4PJ45TlYlmMLTCEq2svVgqXFBdfWY';
const base = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`;

assert.equal(updateTest.cleanImt(' mr '), 'MR');
assert.equal(updateTest.cleanImt('JG<script>'), 'JGSCRIPT');
const batch = (range) => `${base}/values:batchGet?${new URLSearchParams({ ranges: range })}`;

assert.equal(_test.googleErrorMessage({ error: { message: 'The caller does not have permission' } }), 'The caller does not have permission');
assert.equal(_test.googleErrorMessage({ error: 'Session expired' }), 'Session expired');

assert.doesNotThrow(() => _test.assertReadAllowed({ role: 'imt' }, batch("'MAY26'!A:Z")));
assert.doesNotThrow(() => _test.assertReadAllowed({ role: 'imt' }, batch("'PC Contact Details'!A:Z")));
assert.throws(() => _test.assertReadAllowed({ role: 'imt' }, batch("'For confirmation'!A:AZ")), /monthly nudge tabs and PC Contact Details only/);
assert.doesNotThrow(() => _test.assertReadAllowed({ role: 'confirmation' }, batch("'For confirmation'!A:AZ")));
assert.throws(() => _test.assertReadAllowed({ role: 'confirmation' }, batch("'MAY26'!A:Z")), /cannot access/);
assert.doesNotThrow(() => _test.assertReadAllowed({ role: 'imt' }, `${base}/values/${encodeURIComponent("'Audit Log'!A1:H1")}`));

const fullRange = {
  valueRanges: [{
    range: 'MAY26!A1:Z4',
    values: [
      ['IMT Assignment', 'Guest'],
      ['MR', 'Allowed'],
      ['JT', 'Hidden'],
      ['MR', 'Allowed too'],
    ],
  }],
};
_test.blankOtherAssignments(fullRange, 'MR');
assert.deepEqual(fullRange.valueRanges[0].values[0], ['IMT Assignment', 'Guest']);
assert.deepEqual(fullRange.valueRanges[0].values[1], ['MR', 'Allowed']);
assert.deepEqual(fullRange.valueRanges[0].values[2], []);
assert.deepEqual(fullRange.valueRanges[0].values[3], ['MR', 'Allowed too']);

const singleCell = { valueRanges: [{ range: 'MAY26!A16', values: [['JT']] }] };
_test.blankOtherAssignments(singleCell, 'MR');
assert.deepEqual(singleCell.valueRanges[0].values[0], []);

console.log('Access-control tests passed.');
