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

  it('handles Phase 3 group and role RPC error codes (Section 5)', () => {
    expect(toFriendlyMessage(new Error('not_authenticated'))).toBe('Please sign in again.');
    expect(toFriendlyMessage({ code: 'P0001', message: 'not_a_member' })).toBe(
      "You're no longer in this group."
    );
    expect(toFriendlyMessage(new Error('not_admin'))).toBe('Only group admins can do this.');
    expect(toFriendlyMessage(new Error('invalid_name'))).toBe('Group names need 1 to 50 characters.');
    expect(toFriendlyMessage(new Error('group_limit_reached'))).toBe(
      "You've reached the limit of 50 groups."
    );
    expect(toFriendlyMessage(new Error('group_full'))).toBe('This group is full (50 members).');
    expect(toFriendlyMessage(new Error('last_admin'))).toBe(
      'A group needs at least one admin. Make someone else admin first.'
    );
    expect(toFriendlyMessage(new Error('target_not_member'))).toBe(
      'That person is no longer in this group.'
    );
    expect(toFriendlyMessage(new Error('cannot_remove_self'))).toBe('Use Leave group to leave.');
    expect(toFriendlyMessage(new Error('cannot_remove_admin'))).toBe(
      'Remove their admin role first, then remove them.'
    );
    expect(toFriendlyMessage(new Error('member_not_settled'))).toBe('They need to settle up first.');
    expect(toFriendlyMessage(new Error('group_not_settled'))).toBe(
      'Everyone needs to settle up before the group can be deleted.'
    );
    expect(toFriendlyMessage(new Error('sole_admin'))).toBe(
      "You're the only admin of a group with other members. Make someone else admin or delete the group first."
    );
    expect(toFriendlyMessage(new Error('unsettled_balances'))).toBe(
      'Settle up with your groups first, then you can delete your account.'
    );
    expect(toFriendlyMessage(new Error('invalid_role'))).toBe(
      'Something went wrong. Please try again.'
    );
  });

  it('handles Phase 3 invite and join flow statuses (Section 5)', () => {
    expect(toFriendlyMessage('already_member')).toBe("You're already in this group.");
    expect(toFriendlyMessage('invalid')).toBe('Code not found. Check it and try again.');
    expect(toFriendlyMessage('expired')).toBe(
      'This invite has expired. Ask an admin for a new one.'
    );
    expect(toFriendlyMessage('revoked')).toBe(
      'This invite was reset by an admin. Ask for the new one.'
    );
    expect(toFriendlyMessage('removed')).toBe(
      'An admin removed you from this group. Ask for a new invite.'
    );
    expect(toFriendlyMessage('too_many_groups')).toBe("You've reached the limit of 50 groups.");
    expect(toFriendlyMessage('too_many_attempts')).toBe(
      'Too many wrong codes. Try again in about 15 minutes.'
    );
  });

  it('provides a clean fallback for null or empty errors', () => {
    expect(toFriendlyMessage(null)).toBe('An unexpected error occurred. Please try again.');
    expect(toFriendlyMessage(undefined)).toBe('An unexpected error occurred. Please try again.');
  });
});
