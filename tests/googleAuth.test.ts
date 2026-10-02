import { signInWithGoogle } from '../src/lib/auth/google';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { supabase } from '../src/lib/supabase/client';

jest.mock('@react-native-google-signin/google-signin', () => {
  return {
    GoogleSignin: {
      configure: jest.fn(),
      hasPlayServices: jest.fn(),
      signIn: jest.fn(),
    },
    isSuccessResponse: (resp: any) => resp?.type === 'success',
    isCancelledResponse: (resp: any) => resp?.type === 'cancelled',
    isErrorWithCode: (err: any) => Boolean(err && typeof err === 'object' && 'code' in err),
    statusCodes: {
      SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
      IN_PROGRESS: 'IN_PROGRESS',
      PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
      SIGN_IN_REQUIRED: 'SIGN_IN_REQUIRED',
    },
  };
});

jest.mock('../src/lib/supabase/client', () => ({
  supabase: {
    auth: {
      signInWithIdToken: jest.fn(),
    },
  },
}));

describe('signInWithGoogle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exchanges ID token with Supabase on successful sign in (Case A1, A2)', async () => {
    (GoogleSignin.hasPlayServices as jest.Mock).mockResolvedValue(true);
    (GoogleSignin.signIn as jest.Mock).mockResolvedValue({
      type: 'success',
      data: {
        idToken: 'mock-google-id-token',
        user: { name: 'Vansh Gupta', email: 'vansh@example.com' },
      },
    });
    (supabase.auth.signInWithIdToken as jest.Mock).mockResolvedValue({
      data: { session: { user: { id: 'usr-1' } } },
      error: null,
    });

    const result = await signInWithGoogle();

    expect(result).toEqual({ success: true });
    expect(supabase.auth.signInWithIdToken).toHaveBeenCalledWith({
      provider: 'google',
      token: 'mock-google-id-token',
    });
  });

  it('returns cancelled silently when user dismisses account picker (Case A3)', async () => {
    (GoogleSignin.hasPlayServices as jest.Mock).mockResolvedValue(true);
    (GoogleSignin.signIn as jest.Mock).mockResolvedValue({
      type: 'cancelled',
    });

    const result = await signInWithGoogle();

    expect(result).toEqual({ cancelled: true });
    expect(supabase.auth.signInWithIdToken).not.toHaveBeenCalled();
  });

  it('returns friendly error when Google Play Services is missing or outdated (Case A5)', async () => {
    const playServicesError = new Error('Play services missing');
    (playServicesError as any).code = statusCodes.PLAY_SERVICES_NOT_AVAILABLE;

    (GoogleSignin.hasPlayServices as jest.Mock).mockRejectedValue(playServicesError);

    const result = await signInWithGoogle();

    expect(result).toEqual({
      error: 'Google Play Services is not available. Please update it or sign in with email.',
    });
  });

  it('returns network error message when internet is unavailable (Case A6)', async () => {
    const networkError = new Error('Network error');
    (networkError as any).code = '7'; // Google Play Services network error code

    (GoogleSignin.hasPlayServices as jest.Mock).mockRejectedValue(networkError);

    const result = await signInWithGoogle();

    expect(result).toEqual({
      error: 'No internet connection. Please check your network and try again.',
    });
  });

  it('returns generic error to user on developer config error (Case A8)', async () => {
    const configError = new Error('Developer error: 10');
    (configError as any).code = '10'; // DEVELOPER_ERROR

    (GoogleSignin.hasPlayServices as jest.Mock).mockResolvedValue(true);
    (GoogleSignin.signIn as jest.Mock).mockRejectedValue(configError);

    const result = await signInWithGoogle();

    expect(result).toEqual({
      error: "Couldn't sign in. Please try again or use email.",
    });
  });

  it('returns error when Supabase rejects Google token (Case A9)', async () => {
    (GoogleSignin.hasPlayServices as jest.Mock).mockResolvedValue(true);
    (GoogleSignin.signIn as jest.Mock).mockResolvedValue({
      type: 'success',
      data: {
        idToken: 'invalid-or-unverified-token',
      },
    });
    (supabase.auth.signInWithIdToken as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: 'Token is invalid or audience mismatch' },
    });

    const result = await signInWithGoogle();

    expect(result).toEqual({
      error: 'Could not verify your Google account. Please try again or use email.',
    });
  });
});
