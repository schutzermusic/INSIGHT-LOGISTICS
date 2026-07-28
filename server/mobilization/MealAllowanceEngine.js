/**
 * Per-employee mobilization meal allowances.
 *
 * Eligible local calendar dates come from the employee's own confirmed
 * timeline. A date is counted at most once, regardless of how many eligible
 * segments touch it. Money is integer centavos.
 */

const ELIGIBLE_MODES = new Set([
  'bus', 'flight', 'rental_car', 'company_car', 'local_transfer', 'waiting', 'hotel_rest',
]);

export const DEFAULT_MEAL_ALLOWANCE_POLICY = Object.freeze({
  id: '00000000-0000-4000-a000-000000000022',
  version: 2,
  name: 'Diária de alimentação de mobilização',
  status: 'approved',
  leaderDailyC: 12000,
  standardDailyC: 9000,
  maxAllowancesPerLocalDay: 1,
  travelingCounts: true,
  connectionWaitingCounts: true,
  hotelAwayFromBaseCounts: true,
  timezoneBasis: 'segment_local',
  noAllowanceBelowMinutes: 360,
  fullAllowanceFromMinutes: 1080,
  partialAllowanceRatio: 0.5,
});

function localDate(ms, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone || 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(ms));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function datesTouched(segment) {
  const start = Date.parse(segment.departureAtUtc);
  const end = Date.parse(segment.arrivalAtUtc);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
  const timezone = segment.originTimezone || segment.destinationTimezone || 'UTC';
  const dates = new Set([localDate(start, timezone)]);
  // Sampling at six-hour intervals catches local date boundaries without
  // relying on UTC midnight (which would be wrong for Brazilian time zones).
  for (let cursor = start + 6 * 3600000; cursor < end; cursor += 6 * 3600000) {
    dates.add(localDate(cursor, timezone));
  }
  if (end > start) dates.add(localDate(end - 1, timezone));
  return [...dates];
}

function calendarDatesBetween(firstDate, lastDate) {
  if (!firstDate || !lastDate || firstDate > lastDate) return [];
  const dates = [];
  let cursor = Date.parse(`${firstDate}T12:00:00Z`);
  const end = Date.parse(`${lastDate}T12:00:00Z`);
  // Safety cap prevents malformed itineraries from creating an unbounded loop.
  for (let count = 0; Number.isFinite(cursor) && cursor <= end && count < 3660; count += 1) {
    dates.push(new Date(cursor).toISOString().slice(0, 10));
    cursor += 86400000;
  }
  return dates;
}

function isEligible(segment, policy) {
  if (!ELIGIBLE_MODES.has(segment.mode)) return false;
  if (segment.mode === 'waiting') return policy.connectionWaitingCounts !== false;
  if (segment.mode === 'hotel_rest') {
    return policy.hotelAwayFromBaseCounts !== false && segment.metadata?.atHomeBase !== true;
  }
  return policy.travelingCounts !== false;
}

function coverageMinutesByDate(segments) {
  const minutesByDate = new Map();
  for (const segment of segments) {
    const start = Date.parse(segment.departureAtUtc);
    const end = Date.parse(segment.arrivalAtUtc);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const timezone = segment.originTimezone || segment.destinationTimezone || 'UTC';
    for (let cursor = start; cursor < end; cursor += 60000) {
      const date = localDate(cursor, timezone);
      const minutes = minutesByDate.get(date) || new Set();
      minutes.add(Math.floor(cursor / 60000));
      minutesByDate.set(date, minutes);
    }
  }
  return minutesByDate;
}

function quantityForCoverage(minutes, policy) {
  if (minutes < policy.noAllowanceBelowMinutes) return 0;
  if (minutes < policy.fullAllowanceFromMinutes) return policy.partialAllowanceRatio;
  return Math.min(1, policy.maxAllowancesPerLocalDay || 1);
}

export function calculateMealAllowances({ itinerary, employees, policy = DEFAULT_MEAL_ALLOWANCE_POLICY }) {
  const configured = Object.fromEntries(
    Object.entries(policy || {}).filter(([, value]) => (
      value !== null &&
      value !== undefined &&
      !(typeof value === 'number' && !Number.isFinite(value))
    )),
  );
  const resolved = { ...DEFAULT_MEAL_ALLOWANCE_POLICY, ...configured };
  const byEmployee = employees.map((employee) => {
    const category = employee.allowanceCategory === 'leader' ? 'leader' : 'standard';
    const unitValueC = category === 'leader' ? resolved.leaderDailyC : resolved.standardDailyC;
    const employeeSegments = [];

    for (const segment of itinerary.segments || []) {
      const passengers = segment.passengerIds || [];
      if (passengers.length && !passengers.includes(employee.id)) continue;
      if (!isEligible(segment, resolved)) continue;
      employeeSegments.push(segment);
    }
    const coverage = coverageMinutesByDate(employeeSegments);

    // In a confirmed round trip, the collaborator remains mobilized away from
    // their base between the outbound and return timelines. Those permanence
    // dates are eligible even when the editor does not contain one hotel block
    // for every night. This affects allowances only; it never creates labor.
    const hasOutbound = employeeSegments.some((segment) => segment.direction !== 'return');
    const hasReturn = employeeSegments.some((segment) => segment.direction === 'return');
    if (
      itinerary.tripType === 'roundtrip' &&
      resolved.hotelAwayFromBaseCounts !== false &&
      hasOutbound &&
      hasReturn
    ) {
      const touched = employeeSegments.flatMap(datesTouched).sort();
      const mobilizationDates = calendarDatesBetween(touched[0], touched.at(-1));
      for (const date of mobilizationDates.slice(1, -1)) {
        coverage.set(date, { size: 1440 });
      }
    }

    const lines = [...coverage.entries()]
      .map(([eligibleDate, minutes]) => {
        const coverageMinutes = Math.min(1440, minutes.size);
        const lineQuantity = quantityForCoverage(coverageMinutes, resolved);
        return {
          eligibleDate,
          coverageMinutes,
          quantity: lineQuantity,
          allowanceType: lineQuantity === 1 ? 'full' : lineQuantity > 0 ? 'half' : 'none',
          unitValueC,
          totalC: Math.round(unitValueC * lineQuantity),
          ruleUsed: lineQuantity === 1
            ? 'dia integral fora em mobilização'
            : lineQuantity > 0
              ? 'permanência parcial fora em mobilização'
              : 'cobertura inferior ao mínimo diário',
        };
      })
      .sort((a, b) => a.eligibleDate.localeCompare(b.eligibleDate));
    const payableLines = lines.filter((line) => line.quantity > 0);
    const eligibleDates = payableLines.map((line) => line.eligibleDate);
    const quantity = payableLines.reduce((sum, line) => sum + line.quantity, 0);
    return {
      employeeId: employee.id,
      employeeName: employee.name || employee.nome || employee.id,
      category,
      eligibleDates,
      quantity,
      unitValueC,
      totalC: payableLines.reduce((sum, line) => sum + line.totalC, 0),
      policyVersionId: resolved.id,
      policyVersion: resolved.version,
      overrides: employee.allowanceOverride || null,
      overrideJustification: employee.allowanceOverrideJustification || null,
      lines,
    };
  });

  return {
    policy: resolved,
    byEmployee,
    totalC: byEmployee.reduce((sum, item) => sum + item.totalC, 0),
  };
}
