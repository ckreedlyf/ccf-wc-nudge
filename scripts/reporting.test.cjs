const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PassThrough } = require('node:stream');
const { aggregate, resolveMonths } = require('../api/_lib/reporting');
const { renderReportPdf } = require('../api/_lib/report-pdf');
const { _test: reportsTest } = require('../api/reports');

const months = [
  { title: 'JUL26', label: 'Jul 2026', key: 2026 * 12 + 6, year: 2026, month: 6 },
  { title: 'AUG26', label: 'Aug 2026', key: 2026 * 12 + 7, year: 2026, month: 7 },
  { title: 'SEP26', label: 'Sep 2026', key: 2026 * 12 + 8, year: 2026, month: 8 },
];
const rows = [
  { imt: 'MR', status: '1', month: 'JUL26' },
  { imt: 'MR', status: '2', month: 'AUG26' },
  { imt: 'MR', status: '6a', month: 'SEP26' },
  { imt: 'JG', status: '7', month: 'SEP26' },
  { imt: 'JG', status: '8', month: 'SEP26' },
];
const filters = { reportType: 'executive', period: 'last3', imtScope: 'all', imt: '', statusScope: 'all', customStatuses: [] };

assert.deepEqual(resolveMonths(months, filters, new Date('2026-09-27T00:00:00Z')).map((month) => month.title), ['JUL26', 'AUG26', 'SEP26']);
const report = aggregate(rows, months, filters, 'admin@example.com', new Date('2026-09-27T00:00:00Z'));
assert.equal(report.metrics.total, 5);
assert.equal(report.metrics.placed, 2);
assert.equal(report.metrics.placementRate, 40);
assert.equal(report.metrics.needsFollowUp, 2);
assert.equal(report.metrics.alreadyHasDGroup, 1);
assert.equal(report.metrics.unsuccessful, 1);
assert.equal(report.imts.find((item) => item.imt === 'MR').placed, 1);

const mr = aggregate(rows, months, { ...filters, imtScope: 'specific', imt: 'MR' }, 'admin@example.com');
assert.equal(mr.metrics.total, 3);
assert.equal(mr.metrics.placed, 1);
const placed = aggregate(rows, months, { ...filters, statusScope: 'placed' }, 'admin@example.com');
assert.equal(placed.metrics.total, 2);
assert.equal(placed.metrics.placed, 2);
assert.throws(() => reportsTest.requireAdmin({ role: 'imt' }), /not authorized/);
assert.doesNotThrow(() => reportsTest.requireAdmin({ role: 'admin' }));
const client = fs.readFileSync(require.resolve('../index.html'), 'utf8');
assert.match(client, /data-mode="reports">Reports</);
assert.match(client, /reportsPanel'\)\.hidden = !isReports \|\| !accessToken \|\| !isAdmin/);
assert.match(client, /\['users', 'reports'\]\.includes\(btn\.dataset\.mode\)/);

const serialized = JSON.stringify(report);
for (const forbidden of ['phone', 'proof', 'rowId', 'screenshot', 'remarks', 'token', 'password']) assert.equal(serialized.toLowerCase().includes(forbidden.toLowerCase()), false);

async function pdfBuffer(value) {
  const output = new PassThrough();
  const chunks = [];
  output.on('data', (chunk) => chunks.push(chunk));
  const complete = new Promise((resolve, reject) => { output.on('end', resolve); output.on('error', reject); });
  renderReportPdf(value, output);
  await complete;
  return Buffer.concat(chunks);
}

Promise.all([pdfBuffer(report), pdfBuffer({ ...report, reportType: 'detailed' })]).then(([pdf, detailedPdf]) => {
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
  assert.ok(pdf.length > 4000);
  assert.equal(detailedPdf.subarray(0, 4).toString(), '%PDF');
  assert.ok(detailedPdf.length > pdf.length);
  if (process.env.REPORT_PDF_PATH) fs.writeFileSync(process.env.REPORT_PDF_PATH, pdf);
  console.log('Reporting tests passed.');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
