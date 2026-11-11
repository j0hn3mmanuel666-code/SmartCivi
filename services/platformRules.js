export const SYSTEM_TITLE = 'SmartCivi: A Smart Civil Registry and Resource Planning Platform for Local Government Units (LGUs)';
export const roles = ['user', 'staff', 'registrar', 'resource_officer', 'admin'];
const permissions = { admin: ['overview', 'registry', 'residents', 'resources', 'requests', 'reports', 'audit', 'users', 'operations'], staff: ['overview', 'requests', 'residents'], registrar: ['overview', 'registry', 'residents', 'requests', 'reports'], resource_officer: ['overview', 'resources', 'reports'] };
export const can = (role, feature) => permissions[role]?.includes(feature) || false;
export function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
export function text(value, label, required = false, max = 255) {
  if (value != null && typeof value !== 'string') fail(`${label} must be text.`);
  const result = (value || '').trim();
  if (required && !result) fail(`${label} is required.`);
  if (result.length > max) fail(`${label} must be at most ${max} characters.`);
  return result || null;
}
export function integer(value, label, min = 0) {
  if (!/^\d+$/.test(String(value ?? ''))) fail(`${label} must be a whole number.`);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > 2147483647) fail(`${label} is out of range.`);
  return number;
}
export function date(value, label, required = false, past = true) {
  if (!value && !required) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) fail(`${label} must be a valid date.`);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value || value < '1800-01-01') fail(`${label} must be a valid date.`);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
  if (past && value > today) fail(`${label} cannot be in the future.`);
  return value;
}
function choice(value, choices, label) { if (!choices.includes(value)) fail(`Select a valid ${label}.`); return value; }
export function residentInput(body) {
  const email = text(body.email, 'Email');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Enter a valid email address.');
  const residentCode = text(body.residentCode, 'Resident ID', true, 50).toUpperCase();
  if (!/^[A-Z0-9-]+$/.test(residentCode)) fail('Resident ID may contain letters, numbers and hyphens.');
  return { residentCode, firstName: text(body.firstName, 'First name', true, 100), middleName: text(body.middleName, 'Middle name', false, 100), lastName: text(body.lastName, 'Last name', true, 100), birthDate: date(body.birthDate, 'Birth date', true), sex: choice(body.sex || 'unspecified', ['female', 'male', 'unspecified'], 'sex'), barangay: text(body.barangay, 'Barangay', true, 100), address: text(body.address, 'Address'), email: email?.toLowerCase() || null, phone: text(body.phone, 'Phone', false, 40) };
}
export function recordInput(body) {
  return { residentId: integer(body.residentId, 'Resident', 1), type: choice(body.type, ['birth', 'marriage', 'death', 'other'], 'record type'), registryNumber: text(body.registryNumber, 'Registry number', true, 80).toUpperCase(), eventDate: date(body.eventDate, 'Event date', true), registeredDate: date(body.registeredDate, 'Registration date'), eventPlace: text(body.eventPlace, 'Event place', true), fatherName: text(body.fatherName, 'Father name'), motherName: text(body.motherName, 'Mother name'), spouseName: text(body.spouseName, 'Spouse name'), notes: text(body.notes, 'Notes', false, 3000) };
}
export function resourceInput(body) {
  const data = { code: text(body.code, 'Resource code', true, 50).toUpperCase(), name: text(body.name, 'Name', true), category: choice(body.category, ['personnel', 'supply', 'equipment', 'other'], 'category'), department: text(body.department, 'Department', true, 150), unit: text(body.unit, 'Unit', true, 40), quantity: integer(body.quantity, 'Quantity'), minimum: integer(body.minimum || 0, 'Minimum stock'), position: text(body.position, 'Position', false, 150), condition: choice(body.condition || 'serviceable', ['serviceable', 'maintenance', 'unserviceable'], 'condition'), notes: text(body.notes, 'Notes', false, 3000) };
  if (data.category === 'personnel' && data.quantity !== 1) fail('A personnel entry must have quantity 1.');
  return data;
}
export function stockChange(available, action, quantity, outstanding = 0) {
  const amount = integer(quantity, 'Quantity', 1);
  choice(action, ['allocate', 'return', 'replenish', 'consume'], 'movement');
  if (['allocate', 'consume'].includes(action) && amount > available) fail('Insufficient available stock.');
  if (action === 'return' && amount > outstanding) fail('Return exceeds the outstanding allocation.');
  return integer(available + (['allocate', 'consume'].includes(action) ? -amount : amount), 'Resulting stock');
}
export const csv = cells => cells.map(value => { let s = String(value ?? ''); if (/^[\s]*[=+@-]/.test(s) || /^[\t\r\n]/.test(s)) s = `'${s}`; return `"${s.replaceAll('"', '""')}"`; }).join(',');
export const requestStatuses = ['pending', 'processing', 'approved', 'rejected', 'paid', 'payment_pending', 'completed', 'released'];
export const paymentComplete = request => !!request.paidAt || request.status === 'paid';
export function requestStatus(value) { return choice(String(value || '').toLowerCase(), requestStatuses, 'request status'); }
