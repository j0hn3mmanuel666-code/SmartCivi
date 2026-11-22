import { civilStatuses, date, fail, integer, text } from './platformRules.js';
export const todayPH = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
export const residentLabels = { single: 'Single', married: 'Married', widowed: 'Widowed', separated: 'Separated', annulled: 'Annulled', divorced: 'Divorced', not_recorded: 'Not recorded', male: 'Male', female: 'Female', unspecified: 'Not recorded' };
export function ageOn(birthDate, asOf = todayPH()) {
  if (!birthDate || birthDate > asOf) return null;
  const [year, month, day] = birthDate.split('-').map(Number), [reportYear, reportMonth, reportDay] = asOf.split('-').map(Number);
  return reportYear - year - (reportMonth < month || (reportMonth === month && reportDay < day) ? 1 : 0);
}
export function populationInput(query) {
  const barangay = text(query.barangay, 'Barangay', false, 100) || '';
  const q = text(query.q, 'Search', false, 100) || '';
  const sex = text(query.sex, 'Sex', false, 20) || '';
  const civilStatus = text(query.civilStatus, 'Civil status', false, 30) || '';
  const status = query.status || 'active';
  if (sex && !['male', 'female', 'unspecified'].includes(sex)) fail('Choose a valid sex.');
  if (civilStatus && !civilStatuses.includes(civilStatus)) fail('Choose a valid civil status.');
  if (!['active', 'archived', 'all'].includes(status)) fail('Choose a valid record status.');
  const ageMin = query.ageMin == null || query.ageMin === '' ? null : integer(query.ageMin, 'Minimum age');
  const ageMax = query.ageMax == null || query.ageMax === '' ? null : integer(query.ageMax, 'Maximum age');
  if (ageMin > 150 || ageMax > 150 || (ageMin != null && ageMax != null && ageMin > ageMax)) fail('Use an age range from 0 to 150, with minimum age no greater than maximum age.');
  const from = date(query.from, 'Registered from', false, false), to = date(query.to, 'Registered through', false, false);
  if (from && to && from > to) fail('The end date must be on or after the start date.');
  const asOf = date(query.asOf || todayPH(), 'Age calculation date', true, false);
  return { barangay, q, sex, civilStatus, status, ageMin, ageMax, from: from || '', to: to || '', asOf };
}
