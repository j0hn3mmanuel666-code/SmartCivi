import express from 'express';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { requireFeature } from '../middleware/platformSecurity.js';
import { fail } from '../services/platformRules.js';
const router = express.Router();
const run = handler => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
const directory = new URL('../output/diagrams/', import.meta.url);
const diagrams = JSON.parse(await readFile(new URL('manifest.json', directory), 'utf8'));
router.get('/admin/diagrams', requireFeature('diagrams'), run(async (req, res) => {
  const selected = req.query.diagram || diagrams[0].file;
  const diagram = diagrams.find(entry => entry.file === selected);
  if (!diagram) fail('Diagram not found.', 404);
  res.render('systemDiagrams', { title: 'System diagrams', diagram, diagrams: diagrams.map(entry => ({ ...entry, selected: entry.file === selected })) });
}));
router.get('/admin/diagrams/asset/:file', requireFeature('diagrams'), run(async (req, res) => {
  const diagram = diagrams.find(entry => `${entry.file}.svg` === req.params.file);
  if (!diagram) fail('Diagram not found.', 404);
  const path = fileURLToPath(new URL(`svg/${diagram.file}.svg`, directory));
  if (req.query.download === '1') return res.download(path, `${diagram.file}.svg`);
  res.type('image/svg+xml').send(await readFile(path));
}));
export default router;
