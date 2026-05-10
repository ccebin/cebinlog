/**
 * Eski ve yeni log metinleriyle uyumlu: silme / arşiv / kanıt kaldırma.
 */
export function logContentLooksLikeDeletion(content) {
  if (!content || typeof content !== 'string') return false;
  if (content.includes('SİLDİ') || content.includes('ARŞİVLEDİ')) return true;
  return /\b(arşivledi|arşive taşıdı|profil kaydını arşiv|sistemden kaldırdı|günlük kayıtlarını tek seferde temizledi|kalıcı olarak veritabanından sildi|listeden kaldırdı|topluca|kanıt.*\bsildi|kanıt.*kaldırdı|fotoğraf.*\bsildi|dosya.*\bsildi|istihbarat notunu sildi|günlük satırını sildi|bağlantı kaydını kaldırdı)/i.test(
    content
  );
}

export function logContentLooksLikeUpload(content) {
  if (!content || typeof content !== 'string') return false;
  if (content.includes('YÜKLEDİ')) return true;
  return /\b(yükledi|medya kanıtı yükledi|yüklenen|kanıt yükledi|yeni medya kanıtı|dosya.*yükledi|yeni kanıt)/i.test(content);
}

/**
 * Üstte operatör adı ayrı gösterildiği için içerikten tekrarlayan «İsim, …» önekini kaldırır.
 * Virgül / iki nokta sonrası sızıntısını da temizler.
 */
export function stripLeadingAuthorFromLogContent(content, author) {
  if (!content || typeof content !== 'string' || !author) return content;
  const a = String(author).trim();
  if (!a) return content;
  const s = content;
  if (!s.startsWith(a)) return content;
  let rest = s.slice(a.length);
  rest = rest.replace(/^[\s,;:]+/, '').trim();
  return rest || content;
}
