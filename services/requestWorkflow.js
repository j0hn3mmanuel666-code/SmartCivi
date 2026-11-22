const timeZone = 'Asia/Manila';
const millisecondsPerDay = 86400000;

export const DEFAULT_REQUEST_OFFICE = 'Municipal Civil Registry';
export const REQUEST_OFFICES = [DEFAULT_REQUEST_OFFICE];
export const REQUEST_SLA_BUSINESS_DAYS = 5;
export const REQUEST_PAUSED_STATUS = 'waiting_for_applicant';
export const ACTIVE_REQUEST_STATUSES = ['pending', 'Pending', 'processing', 'Processing'];
export const OPEN_REQUEST_STATUSES = [...ACTIVE_REQUEST_STATUSES, REQUEST_PAUSED_STATUS];

export function routeRequestToOffice(documentType) {
  if (!['birth', 'marriage', 'death'].includes(documentType)) {
    throw new TypeError('Unsupported document type for office routing.');
  }
  return DEFAULT_REQUEST_OFFICE;
}

function manilaDate(value) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value instanceof Date ? value : new Date(value));
  const part = type => parts.find(item => item.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function dateOrdinal(value) {
  const [year, month, day] = value.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

function endOfManilaDay(value) {
  return new Date(`${value}T23:59:59+08:00`);
}

export function addBusinessDays(value, days) {
  if (!Number.isInteger(days) || days < 0) throw new RangeError('Business days must be a non-negative integer.');
  let ordinal = dateOrdinal(manilaDate(value));
  let remaining = days;
  while (remaining > 0) {
    ordinal += millisecondsPerDay;
    const weekday = new Date(ordinal).getUTCDay();
    if (weekday !== 0 && weekday !== 6) remaining--;
  }
  return endOfManilaDay(new Date(ordinal).toISOString().slice(0, 10));
}

export function requestDueAt(createdAt = new Date()) {
  return addBusinessDays(createdAt, REQUEST_SLA_BUSINESS_DAYS);
}

export function businessDaysElapsed(start, end = new Date()) {
  const first = dateOrdinal(manilaDate(start));
  const last = dateOrdinal(manilaDate(end));
  let count = 0;
  for (let day = first + millisecondsPerDay; day <= last; day += millisecondsPerDay) {
    const weekday = new Date(day).getUTCDay();
    if (weekday !== 0 && weekday !== 6) count++;
  }
  return count;
}

export function dueDateInput(value) {
  return value ? manilaDate(value) : '';
}

export function dueDateDeadline(value) {
  return new Date(`${value}T23:59:59+08:00`);
}

export function isActiveCase(request) {
  return ['pending', 'processing'].includes(String(request.status || '').toLowerCase());
}

export function isOverdueCase(request, now = new Date()) {
  return isActiveCase(request) && !request.slaPausedAt && request.dueAt && new Date(request.dueAt) < now;
}

export function isDueSoonCase(request, now = new Date()) {
  if (!isActiveCase(request) || request.slaPausedAt || !request.dueAt) return false;
  const dueAt = new Date(request.dueAt);
  return dueAt >= now && dueAt <= addBusinessDays(now, 2);
}

export function slaStatusUpdate(request, nextStatus, now = new Date()) {
  if (nextStatus === REQUEST_PAUSED_STATUS) {
    return request.slaPausedAt ? {} : { slaPausedAt: now };
  }
  if (!request.slaPausedAt) return {};
  const elapsed = businessDaysElapsed(request.slaPausedAt, now);
  return {
    slaPausedAt: null,
    ...(request.dueAt && elapsed > 0 ? { dueAt: addBusinessDays(request.dueAt, elapsed) } : {}),
  };
}

export function requestCaseDefaults(documentType, createdAt = new Date()) {
  return {
    office: routeRequestToOffice(documentType),
    dueAt: requestDueAt(createdAt),
  };
}
