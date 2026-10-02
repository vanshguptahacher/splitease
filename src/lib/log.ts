/**
 * Logger utility that prints only in development mode and
 * automatically sanitizes personal/sensitive data (emails, UPI IDs, JWTs, keys).
 */

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const UPI_REGEX = /[a-zA-Z0-9.\-_]{2,40}@[a-zA-Z]{2,40}/g;
const JWT_REGEX = /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g;

function sanitize(item: unknown): unknown {
  if (typeof item === 'string') {
    return item
      .replace(JWT_REGEX, '[TOKEN_REDACTED]')
      .replace(EMAIL_REGEX, '[EMAIL_REDACTED]')
      .replace(UPI_REGEX, '[UPI_REDACTED]');
  }

  if (item !== null && typeof item === 'object') {
    if (Array.isArray(item)) {
      return item.map(sanitize);
    }
    const sanitizedObj: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(item as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('password') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('token') ||
        lowerKey.includes('key') ||
        lowerKey.includes('apikey')
      ) {
        sanitizedObj[key] = '[REDACTED]';
      } else {
        sanitizedObj[key] = sanitize(value);
      }
    }
    return sanitizedObj;
  }

  return item;
}

export const log = {
  info: (...args: unknown[]) => {
    if (__DEV__) {
      const sanitized = args.map(sanitize);
      console.log('[INFO]', ...sanitized);
    }
  },

  warn: (...args: unknown[]) => {
    if (__DEV__) {
      const sanitized = args.map(sanitize);
      console.warn('[WARN]', ...sanitized);
    }
  },

  error: (...args: unknown[]) => {
    if (__DEV__) {
      const sanitized = args.map(sanitize);
      console.error('[ERROR]', ...sanitized);
    }
  },

  debug: (...args: unknown[]) => {
    if (__DEV__) {
      const sanitized = args.map(sanitize);
      console.debug('[DEBUG]', ...sanitized);
    }
  },
};
