const { googleFetch } = require('./google');
const { STATUS_DEFINITIONS, STATUS_BY_CODE, ACTIVE_CODES, PLACED_CODES, REPOST_CODES, normalizeStatus } = require('./report-statuses');

const SHEET_ID = process.env.CCF_SHEET_ID || '1TI_bslfoK96fhM4PJ45TlYlmMLTCEq2svVgqXFBdfWY';
const BASE = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}`;
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function normalized(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function monthInfo(title) {
  const match = String(title || '').trim().toUpperCase().match(/^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(?:UARY|RUARY|CH|IL|E|Y|UST|TEMBER|OBER|EMBER)?\s*(\d{2}|\d{4})$/);
  if (!match) return null;
  const year = Number(match[2].length === 2 ? `20${match[2]}` : match[2]);
  const month = MONTHS.indexOf(match[1]);
  return { title, year, month, key: year * 12 + month, label: `${MONTHS[month][0]}${MONTHS[month].slice(1).toLowerCase()} ${year}` };
}

function quoteTab(title) {
  return `'${String(title).replace(/'/g, "''")}'`;
}

function availableMonths(metadata) {
  return (metadata.sheets || []).map((sheet) => monthInfo(sheet.properties?.title)).filter(Boolean).sort((a, b) => a.key - b.key);
}

function resolveMonths(months, filters, now = new Date()) {
  const eligible = months.filter((month) => month.key <= now.getFullYear() * 12 + now.getMonth());
  if (filters.period === 'custom') {
    const from = months.find((month) => month.title === filters.fromMonth);
    const to = months.find((month) => month.title === filters.toMonth);
    if (!from || !to || from.key > to.key) throw Object.assign(new Error('Select a valid custom report range.'), { status: 400 });
    return months.filter((month) => month.key >= from.key && month.key <= to.key);
  }
  if (filters.period === 'current') return eligible.filter((month) => month.key === now.getFullYear() * 12 + now.getMonth());
  if (filters.period === 'last3') return eligible.slice(-3);
  if (filters.period === 'last6') return eligible.slice(-6);
  if (filters.period === 'ytd') return eligible.filter((month) => month.year === now.getFullYear());
  throw Object.assign(new Error('Select a valid report period.'), { status: 400 });
}

function statusSet(filters) {
  if (filters.statusScope === 'all') return null;
  if (filters.statusScope === 'active') return ACTIVE_CODES;
  if (filters.statusScope === 'placed') return PLACED_CODES;
  if (filters.statusScope === 'repost') return REPOST_CODES;
  if (filters.statusScope === 'custom') {
    const requested = new Set((filters.customStatuses || []).filter((code) => STATUS_BY_CODE.has(code)));
    if (!requested.size) throw Object.assign(new Error('Select at least one status for a custom report.'), { status: 400 });
    return requested;
  }
  throw Object.assign(new Error('Select a valid status scope.'), { status: 400 });
}

function parseRows(valueRanges, months) {
  const rows = [];
  valueRanges.forEach((range, rangeIndex) => {
    const values = range.values || [];
    if (!values.length) return;
    let headerIndex = values.findIndex((row) => row.some((value) => ['imtassignment', 'placementstatus'].includes(normalized(value))));
    if (headerIndex < 0) headerIndex = 0;
    const header = values[headerIndex] || [];
    let imtIndex = header.findIndex((value) => normalized(value) === 'imtassignment');
    let statusIndex = header.findIndex((value) => normalized(value) === 'placementstatus');
    if (imtIndex < 0) imtIndex = 0;
    if (statusIndex < 0) statusIndex = 12;
    values.slice(headerIndex + 1).forEach((row) => {
      const imt = String(row[imtIndex] || '').trim().toUpperCase();
      if (!imt) return;
      rows.push({ imt, status: normalizeStatus(row[statusIndex]), month: months[rangeIndex].title, monthLabel: months[rangeIndex].label });
    });
  });
  return rows;
}

function pct(value, total) {
  return total ? Math.round((value / total) * 100) : 0;
}

function aggregate(rows, months, filters, generatedBy, generatedAt = new Date()) {
  const allowedStatuses = statusSet(filters);
  const scoped = rows.filter((row) => {
    if (filters.imtScope === 'specific' && row.imt !== filters.imt) return false;
    return !allowedStatuses || allowedStatuses.has(row.status);
  });
  const count = (predicate) => scoped.filter(predicate).length;
  const total = scoped.length;
  const placed = count((row) => PLACED_CODES.has(row.status));
  const metrics = {
    total,
    placed,
    placementRate: pct(placed, total),
    needsFollowUp: count((row) => ACTIVE_CODES.has(row.status)),
    readyForRepost: count((row) => REPOST_CODES.has(row.status)),
    ongoing: count((row) => ACTIVE_CODES.has(row.status)),
    alreadyHasDGroup: count((row) => row.status === '7'),
    unsuccessful: count((row) => row.status === '8'),
  };
  const monthly = months.map((month) => {
    const selected = scoped.filter((row) => row.month === month.title);
    const monthPlaced = selected.filter((row) => PLACED_CODES.has(row.status)).length;
    return { month: month.title, label: month.label, total: selected.length, placed: monthPlaced, placementRate: pct(monthPlaced, selected.length) };
  });
  const imts = [...new Set(scoped.map((row) => row.imt))].sort().map((imt) => {
    const selected = scoped.filter((row) => row.imt === imt);
    const imtPlaced = selected.filter((row) => PLACED_CODES.has(row.status)).length;
    return { imt, total: selected.length, placed: imtPlaced, placementRate: pct(imtPlaced, selected.length) };
  }).sort((a, b) => b.placementRate - a.placementRate || b.total - a.total || a.imt.localeCompare(b.imt));
  const groups = [
    ['Ongoing', (row) => ACTIVE_CODES.has(row.status)],
    ['Placed / Connected', (row) => ['6a', '6b', '6c'].includes(row.status)],
    ['Ready for Repost', (row) => row.status === '5'],
    ['Already Has DGroup', (row) => row.status === '7'],
    ['Placement Unsuccessful', (row) => row.status === '8'],
  ];
  const statusDistribution = groups.map(([label, predicate]) => ({ label, count: count(predicate), percentage: pct(count(predicate), total) })).filter((entry) => entry.count);
  const bottlenecks = STATUS_DEFINITIONS.filter((status) => status.bottleneck).map((status) => ({ label: status.bottleneck, count: count((row) => row.status === status.code) })).filter((entry) => entry.count).sort((a, b) => b.count - a.count);
  const detailedStatuses = STATUS_DEFINITIONS.map((status) => ({ code: status.code, label: status.label, count: count((row) => row.status === status.code), percentage: pct(count((row) => row.status === status.code), total) }));
  const largest = bottlenecks[0];
  const period = months.length ? `${months[0].label} - ${months.at(-1).label}` : 'No available period';
  const scope = filters.imtScope === 'specific' ? filters.imt : 'All IMT';
  const executiveSummary = total
    ? `From ${period}, ${placed} of ${total} seekers were placed or connected, resulting in a ${metrics.placementRate}% placement rate.${largest ? ` The largest active bottleneck is ${largest.label} with ${largest.count} seeker${largest.count === 1 ? '' : 's'}.` : ''}`
    : 'No report data is available for the selected period and scope.';
  return {
    title: 'CCF Welcome Center Miner Nudge Report', reportType: filters.reportType, period, scope,
    generatedAt: generatedAt.toISOString(), generatedBy, filters: { ...filters, customStatuses: undefined },
    hasData: total > 0, metrics, monthly, imts, statusDistribution, bottlenecks, detailedStatuses, executiveSummary,
  };
}

async function fetchMetadata() {
  const response = await googleFetch(`${BASE}?fields=sheets.properties.title`);
  const result = await response.json();
  if (!response.ok) throw new Error('Unable to load available Harvest Sheet months.');
  return result;
}

async function fetchRows(months) {
  if (!months.length) return [];
  const params = new URLSearchParams();
  months.forEach((month) => params.append('ranges', `${quoteTab(month.title)}!A:Z`));
  params.set('majorDimension', 'ROWS');
  const response = await googleFetch(`${BASE}/values:batchGet?${params.toString()}`);
  const result = await response.json();
  if (!response.ok) throw new Error('Unable to load Harvest Sheet report data.');
  return parseRows(result.valueRanges || [], months);
}

async function getReportOptions() {
  const months = availableMonths(await fetchMetadata());
  const rows = await fetchRows(months);
  return {
    months: months.map(({ title, label }) => ({ value: title, label })),
    imts: [...new Set(rows.map((row) => row.imt))].sort(),
    statuses: STATUS_DEFINITIONS.map(({ code, label }) => ({ code, label })),
  };
}

async function getReport(filters, generatedBy) {
  const metadata = await fetchMetadata();
  const months = resolveMonths(availableMonths(metadata), filters);
  const rows = await fetchRows(months);
  return aggregate(rows, months, filters, generatedBy);
}

module.exports = { monthInfo, availableMonths, resolveMonths, statusSet, parseRows, aggregate, getReportOptions, getReport };
