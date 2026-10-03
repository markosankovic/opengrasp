const MAX_SLUG_LENGTH = 80

/** Letters that don't decompose into base letter + accent, so stripping accents alone would drop them. */
const TRANSLITERATE: Record<string, string> = { đ: 'dj', ß: 'ss', æ: 'ae', œ: 'oe', ø: 'o', ł: 'l', þ: 'th' }

/**
 * URL-friendly, dashed version of a document name: "The C++ Programming Language (4th ed.)" →
 * "the-cpp-programming-language-4th-ed". Language names keep their meaning (C++ → cpp, C# → csharp).
 */
export function slugify(text: string): string {
  const slug = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .toLowerCase()
    .replace(/[đßæœøłþ]/g, (c) => TRANSLITERATE[c]!)
    .replace(/([a-z])\+\+/g, '$1pp')
    .replace(/([a-z])#/g, '$1sharp')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (slug.length <= MAX_SLUG_LENGTH) return slug || 'document'
  const cut = slug.slice(0, MAX_SLUG_LENGTH)
  return cut.slice(0, cut.lastIndexOf('-') > 0 ? cut.lastIndexOf('-') : MAX_SLUG_LENGTH)
}

/** The name a document's slug is made from: its PDF title, or the file name without ".pdf". */
export function slugSource(doc: { title?: string; fileName: string }): string {
  return doc.title ?? doc.fileName.replace(/\.pdf$/i, '')
}
