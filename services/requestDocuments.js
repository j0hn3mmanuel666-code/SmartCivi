import path from 'node:path';
import { fail } from './platformRules.js';

export const MAX_REQUEST_DOCUMENT_SIZE = 5 * 1024 * 1024;
export const MAX_REQUEST_DOCUMENTS = 3;

const formats = {
  '.pdf': { mediaType: 'application/pdf', matches: content => content.subarray(0, 5).toString('ascii') === '%PDF-' },
  '.jpg': { mediaType: 'image/jpeg', matches: content => content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff },
  '.jpeg': { mediaType: 'image/jpeg', matches: content => content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff },
  '.png': { mediaType: 'image/png', matches: content => content.length >= 8 && content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
};

export function inspectRequestDocument(originalName, content) {
  if (!Buffer.isBuffer(content) || content.length === 0 || content.length > MAX_REQUEST_DOCUMENT_SIZE) {
    fail('Each document must be between 1 byte and 5 MB.');
  }
  const extension = path.extname(String(originalName || '').replace(/\\/g, '/')).toLowerCase();
  const format = formats[extension];
  if (!format || !format.matches(content)) fail('Upload a valid PDF, JPG, JPEG, or PNG document.');
  const safeName = Array.from(path.posix.basename(String(originalName || '').replace(/\\/g, '/'))
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    .trim()
  ).slice(0, 200).join('');
  if (!safeName) fail('The uploaded document must have a valid file name.');
  return { originalName: safeName, mediaType: format.mediaType, fileSize: content.length };
}
