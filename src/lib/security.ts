/**
 * Security & Input Validation Utilities
 * Diamond Casino & Resort
 */

/**
 * Strips HTML tags, trims, and prevents XSS injection vectors
 */
export function sanitizeText(input: unknown, maxLength = 250): string {
  if (typeof input !== 'string') return '';
  
  let stripped = input;
  let previous = '';
  let passes = 0;
  // Recursively strip HTML tags to defeat nested bypasses like <<script>script>
  while (stripped !== previous && passes < 10) {
    previous = stripped;
    stripped = stripped.replace(/<[^<>]*>/g, '');
    passes++;
  }
  // Remove any leftover unmatched angle brackets
  stripped = stripped.replace(/[<>]/g, '');

  stripped = stripped
    .replace(/javascript\s*:/gi, '')
    .replace(/vbscript\s*:/gi, '')
    .replace(/data\s*:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim();

  return stripped.slice(0, maxLength);
}

/**
 * Escapes characters for safe HTML display if rendered raw
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Validates RP citizen identifier (letters, digits, dashes, max 10 chars)
 */
export function isValidCitizenId(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  const clean = id.trim();
  return /^[a-zA-Z0-9_-]{1,12}$/.test(clean);
}

/**
 * Validates RP character names (alphabetic with standard RP accents and dashes)
 */
export function isValidRPName(name: string): boolean {
  if (!name || typeof name !== 'string') return false;
  const clean = name.trim();
  // Allow letters, accented letters, spaces, hyphens, and apostrophes
  return /^[a-zA-ZÀ-ÿ\s'-]{2,25}$/.test(clean);
}

/**
 * Validates phone numbers (e.g. 555-0142, 5550142)
 */
export function isValidPhoneNumber(phone: string): boolean {
  if (!phone || typeof phone !== 'string') return false;
  const clean = phone.trim();
  return /^[0-9+()-\s]{4,25}$/.test(clean);
}

/**
 * Validates Discord snowflake user IDs (17 to 20 digits)
 */
export function isValidDiscordId(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  const clean = id.trim();
  return /^\d{17,20}$/.test(clean);
}

/**
 * Clamps and sanitizes numerical input (prevents NaN, negatives, Infinity)
 */
export function sanitizeNumber(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER, fallback = 0): number {
  const num = Number(value);
  if (isNaN(num) || !isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

/**
 * Safe JSON parser with fallback to avoid catastrophic deserialization crashes
 */
export function safeJsonParse<T>(jsonStr: string | null, fallback: T): T {
  if (!jsonStr) return fallback;
  try {
    const parsed = JSON.parse(jsonStr);
    // Guard against prototype pollution
    if (parsed && typeof parsed === 'object') {
      delete (parsed as any).__proto__;
      delete (parsed as any).constructor;
      delete (parsed as any).prototype;
    }
    return parsed as T;
  } catch {
    return fallback;
  }
}
