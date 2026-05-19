import { useMemo } from 'react';
import { VisionCameraProxy, type Frame } from 'react-native-vision-camera';
import type { FaceData } from './types';

type FaceVerifyPlugin = {
  detectFaceQuality: (frame: Frame) => FaceData | null;
};

function createPlugin(): FaceVerifyPlugin {
  const plugin = VisionCameraProxy.initFrameProcessorPlugin(
    'detectFaceQuality',
    {}
  );

  if (!plugin) {
    throw new Error(
      '[FaceVerify] Frame Processor Plugin "detectFaceQuality" not found. ' +
        'Make sure the native module is linked correctly.'
    );
  }

  return {
    detectFaceQuality: (frame: Frame): FaceData | null => {
      'worklet';
      const result = plugin.call(frame);
      return result as unknown as FaceData | null;
    },
  };
}

export function useFaceVerifyPlugin(): FaceVerifyPlugin {
  return useMemo(() => createPlugin(), []);
}
