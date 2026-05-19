import { NativeModules } from 'react-native';

const { FaceVerifyModule: Native } = NativeModules as {
  FaceVerifyModule?: {
    checkQuality: (imagePath: string) => Promise<QualityResult>;
    readAsBase64: (imagePath: string) => Promise<string>;
  };
};

if (!Native) {
  console.warn(
    "[FaceVerify] Native module not found. Run 'pod install' (iOS) or rebuild (Android)."
  );
}

export type QualityResult = {
  passed: boolean;
  reason?: 'no_face' | 'blurry' | 'too_dark' | 'bad_pose';
  sharpness?: number;
  brightness?: number;
};

export function checkImageQuality(imagePath: string): Promise<QualityResult> {
  if (!Native) {
    return Promise.resolve({ passed: false, reason: 'no_face' });
  }
  return Native.checkQuality(imagePath);
}

export function readPhotoAsBase64(imagePath: string): Promise<string> {
  if (!Native) {
    return Promise.reject(
      new Error(
        "[FaceVerify] Native module not found. Run 'pod install' (iOS) or rebuild (Android)."
      )
    );
  }
  return Native.readAsBase64(imagePath);
}
