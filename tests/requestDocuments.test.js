import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectRequestDocument, MAX_REQUEST_DOCUMENT_SIZE } from '../services/requestDocuments.js';

test('request documents are type-checked by signature and given a safe display name', () => {
  const metadata = inspectRequestDocument('C:\\private\\id-copy.pdf', Buffer.from('%PDF-1.7\n'));
  assert.deepEqual(metadata, { originalName: 'id-copy.pdf', mediaType: 'application/pdf', fileSize: 9 });
  assert.throws(() => inspectRequestDocument('image.png', Buffer.from('%PDF-1.7')), /valid PDF, JPG, JPEG, or PNG/);
  assert.throws(() => inspectRequestDocument('script.exe', Buffer.from('%PDF-1.7')), /valid PDF, JPG, JPEG, or PNG/);
  assert.throws(() => inspectRequestDocument('empty.pdf', Buffer.alloc(0)), /between 1 byte and 5 MB/);
  assert.equal(MAX_REQUEST_DOCUMENT_SIZE, 5 * 1024 * 1024);
});
