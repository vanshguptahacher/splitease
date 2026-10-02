import {
  GoogleSignin,
  isCancelledResponse,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { supabase } from '@/lib/supabase/client';
import { env } from '@/lib/env';
import { log } from '@/lib/log';

let isConfigured = false;

export function configureGoogleSignIn(): void {
  if (isConfigured) return;

  GoogleSignin.configure({
    webClientId: env.googleWebClientId,
    scopes: ['profile', 'email'],
    offlineAccess: false,
  });

  isConfigured = true;
}

export type GoogleSignInResult =
  | { success: true }
  | { cancelled: true }
  | { error: string };

/**
 * Executes Native Google Sign-In flow:
 * 1. Checks Play Services availability (Case A5)
 * 2. Launches Google account picker
 * 3. Retrieves ID token
 * 4. Calls Supabase signInWithIdToken
 * 5. Handles all outcomes explicitly (Cases A1–A9)
 */
export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  configureGoogleSignIn();

  try {
    // Check Google Play Services (Case A5)
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

    // Request native account picker
    const response = await GoogleSignin.signIn();

    // Check if user dismissed the picker (Case A3)
    if (isCancelledResponse(response)) {
      return { cancelled: true };
    }

    if (!isSuccessResponse(response) || !response.data?.idToken) {
      log.error('Google Sign-In response missing idToken');
      return { error: "Couldn't sign in. Please try again or use email." };
    }

    const { idToken } = response.data;

    // Exchange Google ID Token with Supabase (Native ID Token Auth)
    const { error: supabaseError } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });

    if (supabaseError) {
      log.error('Supabase token verification rejected Google ID token:', supabaseError);
      return {
        error: 'Could not verify your Google account. Please try again or use email.',
      };
    }

    return { success: true };
  } catch (error: unknown) {
    if (isErrorWithCode(error)) {
      switch (error.code) {
        case statusCodes.SIGN_IN_CANCELLED:
          // Dismissed account picker silently (Case A3)
          return { cancelled: true };

        case statusCodes.IN_PROGRESS:
          // Rapid tap or already running (Case A7)
          return { cancelled: true };

        case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
          // Outdated or missing Google Play Services (Case A5)
          return {
            error:
              'Google Play Services is not available. Please update it or sign in with email.',
          };

        case '7': // Network error code from Google Play Services
        case 'NETWORK_ERROR':
          return {
            error: 'No internet connection. Please check your network and try again.',
          };

        case '10': // DEVELOPER_ERROR (misconfigured SHA-1 or Web Client ID, Case A8)
        case '12500': // Sign-in failed
          log.error('Google Sign-In configuration error (Developer Error 10/12500):', error);
          return {
            error: "Couldn't sign in. Please try again or use email.",
          };

        default:
          log.error('Google Sign-In error code:', error.code, error.message);
          return {
            error: "Couldn't sign in. Please try again or use email.",
          };
      }
    }

    const errorMsg = error instanceof Error ? error.message.toLowerCase() : '';
    if (
      errorMsg.includes('network') ||
      errorMsg.includes('failed to fetch') ||
      errorMsg.includes('timeout')
    ) {
      return {
        error: 'No internet connection. Please check your network and try again.',
      };
    }

    log.error('Unexpected Google Sign-In error:', error);
    return {
      error: "Couldn't sign in. Please try again or use email.",
    };
  }
}
