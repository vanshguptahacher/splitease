import {
  base64ToArrayBuffer,
  getAvatarDisplayUrl,
} from '@/lib/auth/avatar';

jest.mock('@/lib/supabase/client', () => ({
  supabase: {
    storage: {
      from: jest.fn().mockReturnValue({
        getPublicUrl: jest.fn((path: string) => ({
          data: { publicUrl: `https://test.supabase.co/storage/v1/object/public/avatars/${path}` },
        })),
        upload: jest.fn().mockResolvedValue({ error: null }),
        remove: jest.fn().mockResolvedValue({ error: null }),
      }),
    },
  },
}));

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
}));

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
}));

describe('avatar helpers', () => {
  describe('base64ToArrayBuffer', () => {
    it('decodes simple base64 string accurately', () => {
      const original = 'Hello SplitEase!';
      const b64 = btoa(original);
      const arrayBuffer = base64ToArrayBuffer(b64);
      const bytes = new Uint8Array(arrayBuffer);
      let decoded = '';
      for (let i = 0; i < bytes.length; i++) {
        decoded += String.fromCharCode(bytes[i]);
      }
      expect(decoded).toBe(original);
    });

    it('decodes binary-like data accurately', () => {
      const data = new Uint8Array([0, 1, 2, 255, 128, 64, 32, 16]);
      let binStr = '';
      for (let i = 0; i < data.length; i++) {
        binStr += String.fromCharCode(data[i]);
      }
      const b64 = btoa(binStr);
      const arrayBuffer = base64ToArrayBuffer(b64);
      const res = new Uint8Array(arrayBuffer);
      expect(res).toEqual(data);
    });
  });

  describe('getAvatarDisplayUrl', () => {
    it('returns storage publicUrl when avatarPath is present', () => {
      const url = getAvatarDisplayUrl('user-123/uuid.jpg', 'https://lh3.google.com/photo.jpg');
      expect(url).toBe('https://test.supabase.co/storage/v1/object/public/avatars/user-123/uuid.jpg');
    });

    it('falls back to avatarUrl when avatarPath is null or empty', () => {
      const googlePhoto = 'https://lh3.googleusercontent.com/photo.jpg';
      expect(getAvatarDisplayUrl(null, googlePhoto)).toBe(googlePhoto);
      expect(getAvatarDisplayUrl(undefined, googlePhoto)).toBe(googlePhoto);
    });

    it('returns null when neither is provided', () => {
      expect(getAvatarDisplayUrl(null, null)).toBeNull();
      expect(getAvatarDisplayUrl(undefined, undefined)).toBeNull();
    });
  });
});
