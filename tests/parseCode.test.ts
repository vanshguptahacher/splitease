import {
  formatInviteCode,
  parseInviteCode,
  sanitizeCodeInput,
} from '../src/lib/invite/parseCode';

describe('parseInviteCode', () => {
  it('parses uppercase 8-character code', () => {
    expect(parseInviteCode('ABCDEFGH')).toBe('ABCDEFGH');
  });

  it('parses lowercase code (Case GI8, GJ1)', () => {
    expect(parseInviteCode('abcdefgh')).toBe('ABCDEFGH');
  });

  it('handles spaces (Case GJ8)', () => {
    expect(parseInviteCode('ABCD EFGH')).toBe('ABCDEFGH');
    expect(parseInviteCode('  ABCDEFGH  ')).toBe('ABCDEFGH');
    expect(parseInviteCode('  abcd   efgh  ')).toBe('ABCDEFGH');
  });

  it('handles dashes (Case GJ8)', () => {
    expect(parseInviteCode('ABCD-EFGH')).toBe('ABCDEFGH');
    expect(parseInviteCode('abcd-efgh')).toBe('ABCDEFGH');
    expect(parseInviteCode('  ABCD-EFGH  ')).toBe('ABCDEFGH');
  });

  it('extracts code from full share message (Case GJ8)', () => {
    const msg1 = 'Join my Goa trip group on SplitEase! Code: ABCD-EFGH or tap https://splitease.app/join/ABCD-EFGH';
    expect(parseInviteCode(msg1)).toBe('ABCDEFGH');

    const msg2 = 'Hey everyone, join our flat expenses with code 23456789 on SplitEase';
    expect(parseInviteCode(msg2)).toBe('23456789');
  });

  it('extracts code from full links (Case GJ2, GJ8)', () => {
    expect(parseInviteCode('https://splitease.app/join/ABCD-EFGH')).toBe('ABCDEFGH');
    expect(parseInviteCode('https://splitease.in/join/ABCD2345')).toBe('ABCD2345');
    expect(parseInviteCode('splitease://join/ABCD2345')).toBe('ABCD2345');
    expect(parseInviteCode('splitease://join/ABCD-EFGH')).toBe('ABCDEFGH');
  });

  it('returns null for text without a code (Case GJ7, GJ8)', () => {
    expect(parseInviteCode('text without a code')).toBeNull();
    expect(parseInviteCode('hello world')).toBeNull();
    expect(parseInviteCode('welcome to splitease')).toBeNull();
  });

  it('returns null for 7-character or 9-character tokens (Case GJ7, GJ8)', () => {
    expect(parseInviteCode('ABCDEFG')).toBeNull(); // 7 chars
    expect(parseInviteCode('ABCDEFGHI')).toBeNull(); // 9 chars
    expect(parseInviteCode('Here is an invalid code ABCDEFGHI in text')).toBeNull();
    expect(parseInviteCode('Here is a short code ABCDEFG in text')).toBeNull();
  });

  it('returns null for malformed links (Case GJ17)', () => {
    expect(parseInviteCode('splitease://join/')).toBeNull();
    expect(parseInviteCode('https://splitease.app/join/')).toBeNull();
  });

  it('returns null for empty or invalid input', () => {
    expect(parseInviteCode('')).toBeNull();
    expect(parseInviteCode('   ')).toBeNull();
    expect(parseInviteCode(null)).toBeNull();
    expect(parseInviteCode(undefined)).toBeNull();
  });
});

describe('formatInviteCode', () => {
  it('formats 8-char code with hyphen', () => {
    expect(formatInviteCode('ABCDEFGH')).toBe('ABCD-EFGH');
    expect(formatInviteCode('abcdefgh')).toBe('ABCD-EFGH');
  });

  it('formats partial codes properly', () => {
    expect(formatInviteCode('ABC')).toBe('ABC');
    expect(formatInviteCode('ABCD')).toBe('ABCD');
    expect(formatInviteCode('ABCDE')).toBe('ABCD-E');
  });
});

describe('sanitizeCodeInput', () => {
  it('uppercases and filters invalid characters', () => {
    expect(sanitizeCodeInput('abcd-efgh')).toBe('ABCD-EFGH');
    expect(sanitizeCodeInput('abcd 1234!')).toBe('ABCD1234');
  });

  it('limits to 9 characters (8 alphanumeric + 1 hyphen)', () => {
    expect(sanitizeCodeInput('ABCD-EFGH1234')).toBe('ABCD-EFGH');
  });
});
