import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { inspectRequestDocument } from '../services/requestDocuments.js';
import { parseRequestDocuments, removeStagedDocuments } from '../middleware/requestUploads.js';

test('multipart document uploads are bounded, staged privately, and signature-checked', async t => {
  const app = express();
  app.post('/upload', parseRequestDocuments, async (req, res, next) => {
    const files = req.files || [];
    try {
      const content = await readFile(files[0].path);
      const metadata = inspectRequestDocument(files[0].originalname, content);
      await removeStagedDocuments(files);
      res.json(metadata);
    } catch (error) {
      await removeStagedDocuments(files);
      next(error);
    }
  });
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const send = async (name, content) => {
    const form = new FormData();
    form.append('documents', new Blob([content]), name);
    const response = await fetch(`${origin}/upload`, { method: 'POST', body: form });
    return { status: response.status, body: await response.json() };
  };

  const valid = await send('identity.pdf', '%PDF-1.7\n');
  assert.equal(valid.status, 200);
  assert.equal(valid.body.originalName, 'identity.pdf');
  assert.equal(valid.body.mediaType, 'application/pdf');
  assert.equal((await send('fake.pdf', 'not a pdf')).status, 400);
  assert.equal((await send('unsupported.txt', 'text')).status, 400);
  assert.equal((await send('oversized.pdf', Buffer.alloc(5 * 1024 * 1024 + 1))).status, 400);
});
