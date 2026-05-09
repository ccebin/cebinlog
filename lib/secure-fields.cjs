const fc = require('./field-crypto.cjs');

function decryptPerson(row) {
  if (!row) return row;
  return {
    ...row,
    bio: fc.decryptOptional(row.bio),
    real_name: fc.decryptOptional(row.real_name),
    location: fc.decryptOptional(row.location),
  };
}

function encryptPersonFields(bio, real_name, location) {
  return {
    bio: fc.encryptOptional(bio),
    real_name: fc.encryptOptional(real_name),
    location: fc.encryptOptional(location),
  };
}

function decryptLog(row) {
  if (!row) return row;
  return {
    ...row,
    content: fc.decryptOptional(row.content),
    original_content: fc.decryptOptional(row.original_content),
    history: fc.decryptOptional(row.history),
  };
}

function encryptLogFields(content, original_content, history) {
  return {
    content: fc.encryptOptional(content),
    original_content: fc.encryptOptional(original_content),
    history: fc.encryptOptional(history),
  };
}

function decryptMedia(row) {
  if (!row) return row;
  return { ...row, note: fc.decryptOptional(row.note) };
}

function decryptConnection(row) {
  if (!row) return row;
  return { ...row, note: fc.decryptOptional(row.note) };
}

function personMatchesQuery(p, qRaw) {
  const q = String(qRaw || '').toLowerCase();
  const fields = [
    p.display_name,
    p.username,
    p.id,
    p.bio,
    p.real_name,
    p.location,
  ];
  return fields.some((f) => f != null && String(f).toLowerCase().includes(q));
}

module.exports = {
  decryptPerson,
  encryptPersonFields,
  decryptLog,
  encryptLogFields,
  decryptMedia,
  decryptConnection,
  personMatchesQuery,
  isEncryptionEnabled: fc.isEncryptionEnabled,
};
