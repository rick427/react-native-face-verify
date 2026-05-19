import { NativeModules } from 'react-native';

const { FaceVerifyModule: Native } = NativeModules as {
  FaceVerifyModule?: {
    checkQuality: (imagePath: string) => Promise<QualityResult>;
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
