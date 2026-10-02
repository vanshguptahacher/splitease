/**
 * Converts raw errors (network, HTTP, Supabase, Postgres, RPC) into clean,
 * friendly human messages for UI presentation.
 */

export interface AppError {
  message?: string;
  code?: string;
  status?: number;
  details?: string;
}

export function toFriendlyMessage(error: unknown): string {
  if (!error) {
    return 'An unexpected error occurred. Please try again.';
  }

  // Handle standard Error instance
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();

    if (
      msg.includes('network request failed') ||
      msg.includes('network error') ||
      msg.includes('failed to fetch') ||
      msg.includes('timeout')
    ) {
      return 'No internet connection. Please check your network and try again.';
    }

    if (msg.includes('jwt') || msg.includes('token') || msg.includes('unauthorized')) {
      return 'Your session has expired. Please sign in again.';
    }

    if (msg.includes('permission denied') || msg.includes('access denied')) {
      return 'You do not have permission to perform this action.';
    }

    return error.message;
  }

  // Handle Supabase/PostgREST/Postgres error objects
  if (typeof error === 'object' && error !== null) {
    const err = error as AppError;

    // HTTP Status Codes
    if (err.status === 401) {
      return 'Your session has expired. Please sign in again.';
    }
    if (err.status === 403) {
      return 'You do not have permission to view or edit this data.';
    }
    if (err.status === 404) {
      return 'The requested item was not found.';
    }
    if (err.status && err.status >= 500) {
      return 'Server error. Our team is looking into it. Please try again shortly.';
    }

    // Postgres / PostgREST Error Codes
    if (err.code === '42501') {
      return 'You do not have permission to access this data.';
    }
    if (err.code === '23505') {
      return 'This item already exists.';
    }
    if (err.code === '23503') {
      return 'Cannot complete action because a related record is missing.';
    }
    if (err.code === 'P0001' && err.message) {
      // Postgres RAISE EXCEPTION message
      return err.message;
    }

    if (typeof err.message === 'string' && err.message.length > 0) {
      return err.message;
    }
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'Something went wrong. Please try again.';
}
