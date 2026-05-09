const crypto = require('crypto');

const PREFIX = 'enc:v1:';

function getKeyBuffer() {
  const hex = process.env.FIELD_ENCRYPTION_KEY;
  if (!hex || typeof hex !== 'string') return null;
  const cleaned = hex.trim();
  if (cleaned.length !== 64) return null;
  try {
    const buf = Buffer.from(cleaned, 'hex');
    return buf.length === 32 ? buf : null;
  } catch {
    return null;
  }
}

function isEncryptionEnabled() {
  return !!getKeyBuffer();
}

/** @param {string|null|undefined} plain */
function encryptOptional(plain) {
  if (plain == null || plain === '') return plain;
  const key = getKeyBuffer();
  if (!key) return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, tag, enc]).toString('base64');
  return PREFIX + payload;
}

/** @param {string|null|undefined} stored */
function decryptOptional(stored) {
  if (stored == null || stored === '') return stored;
  const s = String(stored);
  if (!s.startsWith(PREFIX)) return stored;
  const key = getKeyBuffer();
  if (!key) return stored;
  try {
    const raw = Buffer.from(s.slice(PREFIX.length), 'base64');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const data = raw.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return stored;
  }
}

module.exports = {
  PREFIX,
  isEncryptionEnabled,
  encryptOptional,
  decryptOptional,
};
