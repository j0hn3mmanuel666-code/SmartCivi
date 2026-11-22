import { fail, text } from './platformRules.js';
import { REQUEST_SLA_BUSINESS_DAYS } from './requestWorkflow.js';

const serviceLabels = {
  birth: 'Birth certificate',
  marriage: 'Marriage certificate',
  death: 'Death certificate',
};

const draftFields = {
  gender: 20,
  birthdate: 10,
  firstName: 100,
  secondName: 100,
  middleName: 100,
  lastName: 100,
  email: 254,
  phone: 40,
  presentId: 100,
  noFatherName: 10,
  fatherName: 150,
  motherName: 150,
  birthCountry: 100,
  birthProvince: 100,
  birthMunicipality: 100,
  purposeSelect: 50,
  passportCountry: 100,
  deliveryOption: 20,
  delProvince: 100,
  delMunicipality: 100,
  delBarangay: 100,
  delStreet: 200,
  delZip: 20,
  delMobile: 40,
  delEmail: 254,
  copies: 3,
  recipientType: 20,
  authName: 150,
  authMobile: 40,
  reminder: 1000,
  fullName: 255,
  purpose: 1000,
};

export function requestServiceDetails(documentType) {
  const label = serviceLabels[documentType];
  if (!Object.prototype.hasOwnProperty.call(serviceLabels, documentType)) fail('Choose a supported certificate type.');
  return {
    documentType,
    label,
    requirements: `The official ${label.toLowerCase()} document checklist has not been configured. Confirm the current requirements with the Municipal Civil Registry before applying.`,
    fee: 'Confirm the current fee with the Municipal Civil Registry.',
    processingTime: `Target: ${REQUEST_SLA_BUSINESS_DAYS} business days after submission. Weekends are excluded; a holiday calendar is not configured.`,
  };
}

export function requestServiceCatalog() {
  return Object.keys(serviceLabels).map(requestServiceDetails);
}

export function requestDraftData(body) {
  const documentType = text(body.documentType, 'Certificate type', true, 20);
  if (!Object.prototype.hasOwnProperty.call(serviceLabels, documentType)) fail('Choose a supported certificate type.');

  const payload = { documentType };
  for (const [field, max] of Object.entries(draftFields)) {
    payload[field] = text(body[field], field, false, max) || '';
  }
  const size = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  if (size > 12000) fail('Draft data is too large to save.');
  return { documentType, payload };
}
