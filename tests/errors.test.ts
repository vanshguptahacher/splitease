import { toFriendlyMessage } from '../src/lib/errors';

describe('toFriendlyMessage', () => {
  it('handles network failure errors', () => {
    expect(toFriendlyMessage(new Error('Network request failed'))).toBe(
      'No internet connection. Please check your network and try again.'
    );
    expect(toFriendlyMessage(new Error('Failed to fetch data'))).toBe(
      'No internet connection. Please check your network and try again.'
    );
  });

  it('handles expired OTP codes', () => {
    expect(toFriendlyMessage({ code: 'otp_expired', message: 'Token has expired' })).toBe(
      'That code has expired. Please request a new one.'
    );
    expect(toFriendlyMessage(new Error('Token has expired or is invalid'))).toBe(
      'That code has expired. Please request a new one.'
    );
  });

  it('handles invalid OTP codes', () => {
    expect(toFriendlyMessage({ code: 'invalid_grant', message: 'Invalid login credentials' })).toBe(
      'That code is invalid. Please check and try again.'
    );
    expect(toFriendlyMessage(new Error('Token not found'))).toBe(
      'That code is invalid. Please check and try again.'
    );
    expect(toFriendlyMessage(new Error('Wrong code provided'))).toBe(
      'That code is invalid. Please check and try again.'
    );
  });

  it('handles rate limits', () => {
    expect(toFriendlyMessage({ status: 429, message: 'Too many requests' })).toBe(
      'Too many attempts. Please wait a few minutes before trying again.'
    );
    expect(
      toFriendlyMessage({
        code: 'over_email_send_rate_limit',
        message: 'Email rate limit exceeded',
      })
    ).toBe('Too many attempts. Please wait a few minutes before trying again.');
  });

  it('handles clock skew / date-time errors (Case C11)', () => {
    expect(toFriendlyMessage(new Error('Token issued in the future'))).toBe(
      "Check your phone's date and time."
    );
    expect(toFriendlyMessage({ code: 'bad_clock', message: 'Clock skew detected' })).toBe(
      "Check your phone's date and time."
    );
  });

  it('handles revoked session and unauthorized access (Case C3)', () => {
    expect(toFriendlyMessage({ status: 401, message: 'Unauthorized' })).toBe(
      'Please sign in again.'
    );
    expect(toFriendlyMessage({ code: 'refresh_token_not_found' })).toBe(
      'Please sign in again.'
    );
    expect(toFriendlyMessage(new Error('Session has expired'))).toBe(
      'Please sign in again.'
    );
  });

  it('handles permission denied errors', () => {
    expect(toFriendlyMessage({ code: '42501', message: 'permission denied for table profiles' })).toBe(
      'You do not have permission to perform this action.'
    );
    expect(toFriendlyMessage({ status: 403 })).toBe(
      'You do not have permission to perform this action.'
    );
  });

  it('returns custom postgres raise exception message', () => {
    expect(toFriendlyMessage({ code: 'P0001', message: 'Only admins can perform this' })).toBe(
      'Only admins can perform this'
    );
  });

  it('handles database check constraints (Cases G4, G5)', () => {
    expect(
      toFriendlyMessage({
        code: '23514',
        message: 'new row for relation "profiles" violates check constraint "profiles_name_len"',
      })
    ).toBe('Name must be between 1 and 50 characters.');

    expect(
      toFriendlyMessage({
        code: '23514',
        message: 'new row for relation "profiles" violates check constraint "profiles_upi_format"',
      })
    ).toBe('Invalid UPI ID format. Example: name@bank');

    expect(
      toFriendlyMessage({
        code: '23514',
        message: 'new row for relation "profiles" violates check constraint "profiles_avatar_path_format"',
      })
    ).toBe('Invalid avatar image path.');
  });

  it('provides a clean fallback for null or empty errors', () => {
    expect(toFriendlyMessage(null)).toBe('An unexpected error occurred. Please try again.');
    expect(toFriendlyMessage(undefined)).toBe('An unexpected error occurred. Please try again.');
  });
});
