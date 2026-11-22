import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
const magic = Buffer.from('SCIVI001');
function keyFrom(hex) { if (!/^[a-f0-9]{64}$/i.test(hex || '')) throw new Error('BACKUP_KEY must contain exactly 64 hexadecimal characters.'); return Buffer.from(hex, 'hex'); }
export function encryptArchive(data, hexKey) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(hexKey), iv);
  cipher.setAAD(magic);
  const encrypted = Buffer.concat([cipher.update(gzipSync(Buffer.from(JSON.stringify(data)))), cipher.final()]);
  return Buffer.concat([magic, iv, cipher.getAuthTag(), encrypted]);
}
export function decryptArchive(archive, hexKey) {
  if (archive.length < 37 || !archive.subarray(0, 8).equals(magic)) throw new Error('Not a SmartCivi backup archive.');
  const decipher = createDecipheriv('aes-256-gcm', keyFrom(hexKey), archive.subarray(8, 20));
  decipher.setAAD(magic); decipher.setAuthTag(archive.subarray(20, 36));
  return JSON.parse(gunzipSync(Buffer.concat([decipher.update(archive.subarray(36)), decipher.final()]), { maxOutputLength: 256 * 1024 * 1024 }).toString());
}
