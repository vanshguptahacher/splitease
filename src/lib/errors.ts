/**
 * Converts raw errors (network, HTTP, Supabase, Postgres, RPC) into clean,
 * friendly human messages for UI presentation.
 */

export interface AppError {
  message?: string;
  code?: string;
  status?: number;
  details?: string;
  error_description?: string;
}

export function toFriendlyMessage(
  error: unknown,
  memberNameResolver?: (userId: string) => string | undefined
): string {
  if (!error) {
    return 'An unexpected error occurred. Please try again.';
  }

  // Extract raw message string for pattern inspection
  let rawMsg = '';
  let errCode = '';
  let errStatus: number | undefined;

  if (error instanceof Error) {
    rawMsg = error.message;
  } else if (typeof error === 'object' && error !== null) {
    const err = error as AppError;
    rawMsg = err.message || err.error_description || '';
    errCode = err.code || '';
    errStatus = err.status;
  } else if (typeof error === 'string') {
    rawMsg = error;
  }

  const msg = rawMsg.toLowerCase();
  const code = errCode.toLowerCase();

  // 1. Network & Timeout
  if (
    msg.includes('network request failed') ||
    msg.includes('network error') ||
    msg.includes('failed to fetch') ||
    msg.includes('timeout') ||
    msg.includes('abort')
  ) {
    return 'No internet connection. Please check your network and try again.';
  }

  // 2. Auth: Clock Skew / Device Date-Time
  if (
    code.includes('future') ||
    code.includes('clock') ||
    msg.includes('issued in the future') ||
    msg.includes('clock skew') ||
    msg.includes('nbf')
  ) {
    return "Check your phone's date and time.";
  }

  // 3. Auth: Rate limits (HTTP 429, over_email_send_rate_limit)
  if (
    errStatus === 429 ||
    code.includes('rate_limit') ||
    msg.includes('rate limit') ||
    msg.includes('too many requests') ||
    msg.includes('over_email_send_rate_limit')
  ) {
    return 'Too many attempts. Please wait a few minutes before trying again.';
  }

  // 4. Auth: Expired OTP code
  if (
    code === 'otp_expired' ||
    msg.includes('otp expired') ||
    msg.includes('token has expired') ||
    msg.includes('token is expired')
  ) {
    return 'That code has expired. Please request a new one.';
  }

  // 5. Auth: Invalid OTP code or grant
  if (
    code === 'invalid_grant' ||
    code === 'otp_disabled' ||
    msg.includes('token has invalid format') ||
    msg.includes('invalid token') ||
    msg.includes('token not found') ||
    msg.includes('wrong code') ||
    msg.includes('invalid otp')
  ) {
    return 'That code is invalid. Please check and try again.';
  }

  // 6. Auth: Session expired / Revoked token / Unauthorized
  if (
    errStatus === 401 ||
    code === 'refresh_token_not_found' ||
    code === 'token_revoked' ||
    msg.includes('refresh_token_not_found') ||
    msg.includes('token_revoked') ||
    msg.includes('jwt') ||
    msg.includes('unauthorized') ||
    msg.includes('session has expired') ||
    msg.includes('session_not_found')
  ) {
    return 'Please sign in again.';
  }

  // 7. Google Play Services
  if (msg.includes('play services') && (msg.includes('outdated') || msg.includes('missing') || msg.includes('unavailable'))) {
    return 'Google Play Services is not available. Please update it or sign in with email.';
  }

  // 8. Postgres / PostgREST permissions
  if (errStatus === 403 || errCode === '42501' || msg.includes('permission denied') || msg.includes('access denied')) {
    return 'You do not have permission to perform this action.';
  }

  if (errStatus === 404) {
    return 'The requested item was not found.';
  }

  if (errStatus && errStatus >= 500) {
    return 'Server error. Our team is looking into it. Please try again shortly.';
  }

  if (errCode === '23505') {
    return 'This item already exists.';
  }

  if (errCode === '23503') {
    return 'Cannot complete action because a related record is missing.';
  }

  if (errCode === '23514' || msg.includes('check constraint')) {
    if (msg.includes('profiles_name_len')) {
      return 'Name must be between 1 and 50 characters.';
    }
    if (msg.includes('profiles_upi_format')) {
      return 'Invalid UPI ID format. Example: name@bank';
    }
    if (msg.includes('profiles_avatar_path_format')) {
      return 'Invalid avatar image path.';
    }
    return 'Invalid data entered. Please check your inputs.';
  }

  // 9. Phase 3: Groups, Members, Invites, and Roles Error Codes & Statuses
  const p3Key = (errCode || rawMsg).trim().toLowerCase();
  const matchesCode = (target: string) => {
    return (
      p3Key === target ||
      msg === target ||
      msg.startsWith(`${target}:`) ||
      msg.endsWith(`:${target}`) ||
      msg.includes(` ${target} `) ||
      msg.includes(`"${target}"`) ||
      msg.includes(`'${target}'`)
    );
  };

  if (matchesCode('not_authenticated')) {
    return 'Please sign in again.';
  }
  if (matchesCode('not_a_member')) {
    return "You're no longer in this group.";
  }
  if (matchesCode('not_admin')) {
    return 'Only group admins can do this.';
  }
  if (matchesCode('invalid_name')) {
    return 'Group names need 1 to 50 characters.';
  }
  if (matchesCode('group_limit_reached')) {
    return "You've reached the limit of 50 groups.";
  }
  if (matchesCode('group_full')) {
    return 'This group is full (50 members).';
  }
  if (matchesCode('last_admin')) {
    return 'A group needs at least one admin. Make someone else admin first.';
  }
  if (matchesCode('target_not_member')) {
    return 'That person is no longer in this group.';
  }
  if (matchesCode('cannot_remove_self')) {
    return 'Use Leave group to leave.';
  }
  if (matchesCode('cannot_remove_admin')) {
    return 'Remove their admin role first, then remove them.';
  }
  if (matchesCode('member_not_settled')) {
    return 'Settle up first, then you can do this.';
  }
  if (matchesCode('group_not_settled')) {
    return 'Everyone needs to settle up before the group can be deleted.';
  }
  if (matchesCode('sole_admin')) {
    return "You're the only admin of a group with other members. Make someone else admin or delete the group first.";
  }
  if (matchesCode('unsettled_balances')) {
    return 'Settle up with your groups first, then you can delete your account.';
  }
  if (matchesCode('invalid_role')) {
    return 'Something went wrong. Please try again.';
  }

  // Join and preview statuses
  if (matchesCode('already_member')) {
    return "You're already in this group.";
  }
  if (matchesCode('invalid')) {
    return 'Code not found. Check it and try again.';
  }
  if (matchesCode('expired')) {
    return 'This invite has expired. Ask an admin for a new one.';
  }
  if (matchesCode('revoked')) {
    return 'This invite was reset by an admin. Ask for the new one.';
  }
  if (matchesCode('removed')) {
    return 'An admin removed you from this group. Ask for a new invite.';
  }
  if (matchesCode('too_many_groups')) {
    return "You've reached the limit of 50 groups.";
  }
  if (matchesCode('too_many_attempts')) {
    return 'Too many wrong codes. Try again in about 15 minutes.';
  }

  // 10. Phase 4: Expense Error Codes (Section 5)
  if (matchesCode('expense_not_found')) {
    return 'This expense no longer exists.';
  }
  if (matchesCode('not_allowed')) {
    return 'Only the person who added this expense or a group admin can change it.';
  }
  if (matchesCode('expense_locked')) {
    return "This expense includes someone who left the group, so it's locked. Add a new expense to correct it.";
  }
  if (matchesCode('expense_changed')) {
    return "Someone just changed this expense. We've loaded the latest version.";
  }
  if (matchesCode('invalid_amount')) {
    return 'Enter an amount between ₹0.01 and ₹1,00,00,000.';
  }
  if (matchesCode('invalid_date')) {
    return 'Choose a valid date.';
  }
  if (matchesCode('invalid_description')) {
    return 'Keep the description under 100 characters.';
  }
  if (matchesCode('invalid_category')) {
    return 'Pick a category from the list.';
  }
  if (matchesCode('invalid_split_type')) {
    return 'Something went wrong. Please try again.';
  }
  if (matchesCode('no_participants')) {
    return 'Pick at least one person.';
  }
  if (matchesCode('too_many_participants')) {
    return 'A split can include at most 50 people.';
  }
  if (matchesCode('duplicate_participant')) {
    return 'Something went wrong. Please try again.';
  }
  if (matchesCode('invalid_split_value')) {
    return 'Check the amounts you entered for each person.';
  }
  if (matchesCode('splits_dont_add_up')) {
    return "The split doesn't add up to the total.";
  }
  if (matchesCode('payer_not_member')) {
    const detailId = getParticipantNotMemberId(error);
    if (detailId && memberNameResolver) {
      const name = memberNameResolver(detailId);
      if (name) {
        return `${name} is no longer in this group.`;
      }
    }
    return 'The person who paid is no longer in this group.';
  }
  if (matchesCode('participant_not_member')) {
    const detailId = getParticipantNotMemberId(error);
    if (detailId && memberNameResolver) {
      const name = memberNameResolver(detailId);
      if (name) {
        return `${name} is no longer in this group.`;
      }
    }
    return 'Someone in this split is no longer in this group.';
  }

  // 11. Phase 5: Settlement & Balance Error Codes (Section 5)
  if (matchesCode('settlement_not_found')) {
    return 'This payment no longer exists.';
  }
  if (matchesCode('settlement_not_allowed')) {
    return "You can't do that with this payment.";
  }
  if (matchesCode('invalid_settlement')) {
    return 'Choose two different people.';
  }
  if (matchesCode('receiver_not_member')) {
    const detailId = getParticipantNotMemberId(error);
    if (detailId && memberNameResolver) {
      const name = memberNameResolver(detailId);
      if (name) {
        return `${name} is no longer in this group.`;
      }
    }
    return 'The person receiving the payment is no longer in this group.';
  }
  if (matchesCode('invalid_method')) {
    return 'Choose how the payment was made.';
  }
  if (matchesCode('invalid_note')) {
    return 'Keep the note under 100 characters.';
  }
  if (matchesCode('duplicate_pending')) {
    return "There's already a pending payment of that amount. Wait for it to be confirmed, or cancel it first.";
  }
  if (matchesCode('too_many_pending')) {
    return 'You have too many pending payments in this group. Wait for some to be confirmed.';
  }
  if (matchesCode('invalid_transition')) {
    return "This payment was just updated. We've refreshed it.";
  }
  if (matchesCode('undo_window_passed')) {
    return "It's too late to undo this. Record a new payment to correct it.";
  }
  if (matchesCode('settlement_locked')) {
    return "Someone in this payment has left the group, so it can't be changed.";
  }

  if (errCode === 'P0001' && rawMsg) {
    return rawMsg;
  }

  if (rawMsg.length > 0) {
    return rawMsg;
  }

  return 'Something went wrong. Please try again.';
}

/**
 * Extracts participant user ID from a participant_not_member Postgres error details or message.
 */
export function getParticipantNotMemberId(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const errObj = error as { details?: unknown; message?: unknown };
  if (typeof errObj.details === 'string' && errObj.details) {
    const match = errObj.details.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    if (match) return match[0];
    return errObj.details;
  }
  if (typeof errObj.message === 'string') {
    const match = errObj.message.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    if (match) return match[0];
  }
  return null;
}
