import multer from 'multer';
import { mkdir, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { MAX_REQUEST_DOCUMENTS, MAX_REQUEST_DOCUMENT_SIZE } from '../services/requestDocuments.js';

const stagingDirectory = path.resolve(process.cwd(), '.local', 'request-upload-staging');
const extensions = new Set(['.pdf', '.jpg', '.jpeg', '.png']);
const storage = multer.diskStorage({
  destination(_req, _file, callback) {
    mkdir(stagingDirectory, { recursive: true, mode: 0o700 }).then(() => callback(null, stagingDirectory), callback);
  },
  filename(_req, file, callback) {
    const extension = path.extname(String(file.originalname || '').replace(/\\/g, '/')).toLowerCase();
    callback(null, `${randomUUID()}${extension}`);
  },
});
const parser = multer({
  storage,
  limits: { fileSize: MAX_REQUEST_DOCUMENT_SIZE, files: MAX_REQUEST_DOCUMENTS, fields: 2, fieldSize: 2000, parts: MAX_REQUEST_DOCUMENTS + 2 },
  fileFilter(_req, file, callback) {
    const extension = path.extname(String(file.originalname || '').replace(/\\/g, '/')).toLowerCase();
    if (!extensions.has(extension)) {
      const error = Object.assign(new Error('Only PDF, JPG, JPEG, or PNG documents are accepted.'), { status: 400 });
      return callback(error);
    }
    callback(null, true);
  },
});

export async function removeStagedDocuments(files = []) {
  await Promise.all(files.filter(file => file?.path).map(file => rm(file.path, { force: true })));
}

export function parseRequestDocuments(req, res, next) {
  parser.array('documents', MAX_REQUEST_DOCUMENTS)(req, res, error => {
    if (!error) return next();
    removeStagedDocuments(req.files || []).then(() => {
      if (error instanceof multer.MulterError) {
        error.status = 400;
        if (error.code === 'LIMIT_FILE_SIZE') error.message = 'Each document must be no larger than 5 MB.';
        if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') error.message = 'Upload no more than 3 documents at a time.';
      } else if (!error.status) error.status = 400;
      next(error);
    }, next);
  });
}
