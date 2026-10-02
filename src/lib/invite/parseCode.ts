/**
 * Utilities for parsing, cleaning, and formatting 8-character invite codes.
 * Satisfies Cases GJ1, GJ8, GJ17.
 */

/**
 * Cleans input and extracts a valid 8-character invite code.
 * Supports typed codes, hyphenated codes (ABCD-EFGH), links (splitease://join/..., https://.../join/...),
 * and full share messages.
 *
 * Returns the normalized 8-character uppercase code, or null if no valid code is found.
 */
export function parseInviteCode(input: string | null | undefined): string | null {
  if (!input || typeof input !== 'string') return null;

  const raw = input.trim();
  if (!raw) return null;

  // 1. Direct match: If the raw input stripped of spaces and dashes is exactly 8 alphanumeric characters
  // and does not contain spaces separating multiple distinct non-code words
  const strippedDirect = raw.replace(/[\s-]+/g, '');
  if (/^[A-Za-z0-9]{8}$/.test(strippedDirect)) {
    // If there were spaces, ensure it's either a 4-4 split or just surrounding spaces
    const tokens = raw.trim().split(/\s+/);
    if (tokens.length === 1 || (tokens.length === 2 && tokens[0].length === 4 && tokens[1].length === 4)) {
      return strippedDirect.toUpperCase();
    }
  }

  // 2. URL extraction: look for /join/ followed by a code segment
  // e.g. splitease://join/ABCD-EFGH or https://splitease.app/join/ABCD2345
  const urlMatch = raw.match(/\/join\/([A-Za-z0-9_-]+)/i);
  if (urlMatch && urlMatch[1]) {
    const candidate = urlMatch[1].replace(/[\s_-]+/g, '');
    if (/^[A-Za-z0-9]{8}$/.test(candidate)) {
      return candidate.toUpperCase();
    }
  }

  // 3. Explicit "code: <token>" or "code <token>" in message
  const codePrefixMatch = raw.match(/\bcode[:\s]+([A-Za-z0-9]{4}-?[A-Za-z0-9]{4})\b/i);
  if (codePrefixMatch && codePrefixMatch[1]) {
    const candidate = codePrefixMatch[1].replace(/[-]/g, '');
    if (/^[A-Za-z0-9]{8}$/.test(candidate)) {
      return candidate.toUpperCase();
    }
  }

  // 4. Hyphenated 4-4 token inside text: ABCD-EFGH
  const hyphenMatch = raw.match(/\b([A-Za-z0-9]{4})-([A-Za-z0-9]{4})\b/);
  if (hyphenMatch && hyphenMatch[1] && hyphenMatch[2]) {
    return (hyphenMatch[1] + hyphenMatch[2]).toUpperCase();
  }

  // 5. Standalone 8-character alphanumeric token in text
  // e.g. "Use 23456789 to join"
  const standaloneMatches = Array.from(raw.matchAll(/(?:^|[^A-Za-z0-9])([A-Za-z0-9]{8})(?:$|[^A-Za-z0-9])/g));
  if (standaloneMatches.length > 0 && standaloneMatches[0][1]) {
    return standaloneMatches[0][1].toUpperCase();
  }

  return null;
}

/**
 * Formats an 8-character invite code into ABCD-EFGH for readable display.
 */
export function formatInviteCode(code: string): string {
  const clean = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (clean.length <= 4) return clean;
  return `${clean.slice(0, 4)}-${clean.slice(4, 8)}`;
}

/**
 * Cleans user keystrokes for the code input field:
 * Uppercases, strips spaces, keeps at most 9 chars (8 chars + optional hyphen).
 */
export function sanitizeCodeInput(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 9);
}
