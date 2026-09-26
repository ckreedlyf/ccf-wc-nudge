const STATUS_DEFINITIONS = Object.freeze([
  { code: '1', label: 'Need Initial Follow-up', group: 'ongoing', bottleneck: 'Need Initial Follow-up' },
  { code: '2', label: 'Waiting for Miner Confirmation', group: 'ongoing', bottleneck: 'Waiting for Miner Confirmation' },
  { code: '3a', label: 'Waiting for Guest', group: 'ongoing', bottleneck: 'Waiting for Guest' },
  { code: '3b', label: 'Endorsed to DGroup', group: 'ongoing', bottleneck: 'Endorsed' },
  { code: '4', label: 'Awaiting Attendance', group: 'ongoing', bottleneck: 'Awaiting Attendance' },
  { code: '5', label: 'Ready for Repost', group: 'repost', bottleneck: 'Ready for Repost' },
  { code: '6a', label: 'Placed with Miner', group: 'placed' },
  { code: '6b', label: "Placed with Miner's Downline", group: 'placed' },
  { code: '6c', label: 'Placed in Another DGroup', group: 'placed' },
  { code: '7', label: 'Already Has DGroup', group: 'existing' },
  { code: '8', label: 'Placement Unsuccessful', group: 'unsuccessful' },
]);

const STATUS_BY_CODE = new Map(STATUS_DEFINITIONS.map((status) => [status.code, status]));
const VALID_STATUS_CODES = new Set(STATUS_BY_CODE.keys());
const ACTIVE_CODES = new Set(STATUS_DEFINITIONS.filter((status) => status.group === 'ongoing').map((status) => status.code));
const PLACED_CODES = new Set(STATUS_DEFINITIONS.filter((status) => ['placed', 'existing'].includes(status.group)).map((status) => status.code));
const REPOST_CODES = new Set(STATUS_DEFINITIONS.filter((status) => status.group === 'repost').map((status) => status.code));

function normalizeStatus(value) {
  const match = String(value || '').trim().toLowerCase().match(/^(\d+[a-z]?)/);
  return match && VALID_STATUS_CODES.has(match[1]) ? match[1] : '';
}

module.exports = { STATUS_DEFINITIONS, STATUS_BY_CODE, VALID_STATUS_CODES, ACTIVE_CODES, PLACED_CODES, REPOST_CODES, normalizeStatus };
