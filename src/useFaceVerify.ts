import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Camera, Frame } from 'react-native-vision-camera';
import { runAtTargetFps, useFrameProcessor } from 'react-native-vision-camera';
import { Worklets } from 'react-native-worklets-core';
import { compareFacesWithRekognition } from './awsRekognition';
import { useFaceVerifyPlugin } from './FaceVerifyDetector';
import { QUALITY_STEPS } from './faceVerifyScoring';
import type {
  AwsConfig,
  EndpointConfig,
  FaceData,
  FaceVerifyState,
  FeedbackMessage,
  VerifyResult,
} from './types';

const TOTAL_STEPS = QUALITY_STEPS.length;

type Options = {
  referenceImage: string;
  awsConfig?: AwsConfig;
  endpoint?: EndpointConfig;
  countdownFrom: number;
  soundEnabled: boolean;
  cameraRef: React.RefObject<Camera | null>;
  onMatch: (result: VerifyResult) => void;
  onNoMatch: (result: VerifyResult) => void;
  onError?: (error: Error) => void;
};

type FaceVerifyCameraState = {
  faceVerifyState: FaceVerifyState;
  qualityScore: number;
  countdown: number | null;
  feedback: FeedbackMessage;
};

// ─── Base64 helper ────────────────────────────────────────────────────────────
// Reads a photo file path and returns raw base64 (no data URI prefix).
// Uses FileReader which is available in Hermes (RN 0.71+).
async function photoToBase64(path: string): Promise<string> {
  const response = await fetch(`file://${path}`);
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        // Strip the "data:image/jpeg;base64," prefix
        const base64 = reader.result.split(',')[1] ?? reader.result;
        resolve(base64);
      } else {
        reject(new Error('FileReader result was not a string'));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ─── Comparison dispatcher ────────────────────────────────────────────────────
async function runComparison(
  referenceImage: string,
  capturedImage: string,
  awsConfig?: AwsConfig,
  endpoint?: EndpointConfig
): Promise<{ match: boolean; similarity: number }> {
  if (awsConfig) {
    return compareFacesWithRekognition(awsConfig, referenceImage, capturedImage);
  }

  if (endpoint) {
    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...endpoint.headers,
      },
      body: JSON.stringify({ referenceImage, capturedImage }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`[FaceVerify] Endpoint error ${response.status}: ${text}`);
    }

    return response.json() as Promise<{ match: boolean; similarity: number }>;
  }

  throw new Error(
    '[FaceVerify] Either `awsConfig` or `endpoint` must be provided.'
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useFaceVerify(options: Options) {
  const {
    referenceImage,
    awsConfig,
    endpoint,
    countdownFrom,
    soundEnabled,
    cameraRef,
    onMatch,
    onNoMatch,
    onError,
  } = options;

  const plugin = useFaceVerifyPlugin();

  const currentStepIdx = useRef(0);
  const stepFrameCount = useRef(0);
  const stateRef = useRef<FaceVerifyState>('scanning');
  const isCaptured = useRef(false);

  const [state, setState] = useState<FaceVerifyCameraState>({
    faceVerifyState: 'scanning',
    qualityScore: 0,
    countdown: null,
    feedback: QUALITY_STEPS[0]!.instruction,
  });

  const setVerifyState = useCallback((next: FaceVerifyState) => {
    stateRef.current = next;
    setState((prev) => ({ ...prev, faceVerifyState: next }));
  }, []);

  // ── Compare ────────────────────────────────────────────────────────────────
  const compare = useCallback(
    async (capturedPath: string) => {
      setVerifyState('comparing');
      setState((prev) => ({ ...prev, feedback: 'Verifying identity...' }));

      try {
        const capturedImage = await photoToBase64(capturedPath);
        const { match, similarity } = await runComparison(
          referenceImage,
          capturedImage,
          awsConfig,
          endpoint
        );

        const result: VerifyResult = {
          match,
          similarity,
          capturedImage,
          timestamp: Date.now(),
        };

        if (match) {
          setState((prev) => ({ ...prev, feedback: 'Identity verified' }));
          setVerifyState('match');
          onMatch(result);
        } else {
          setState((prev) => ({ ...prev, feedback: 'Face not recognized' }));
          setVerifyState('no_match');
          onNoMatch(result);
        }
      } catch (err) {
        setVerifyState('error');
        setState((prev) => ({ ...prev, feedback: '' }));
        onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    },
    [referenceImage, awsConfig, endpoint, onMatch, onNoMatch, onError, setVerifyState]
  );

  // ── Capture ────────────────────────────────────────────────────────────────
  const capture = useCallback(async () => {
    if (isCaptured.current || !cameraRef.current) return;
    isCaptured.current = true;
    setVerifyState('capturing');

    try {
      const photo = await cameraRef.current.takePhoto({
        flash: 'off',
        enableShutterSound: soundEnabled,
      });
      await compare(photo.path);
    } catch (err) {
      setVerifyState('error');
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }, [cameraRef, soundEnabled, compare, setVerifyState, onError]);

  // ── Countdown ──────────────────────────────────────────────────────────────
  const startCountdown = useCallback(() => {
    setVerifyState('countdown');
    let tick = countdownFrom;
    setState((prev) => ({ ...prev, countdown: tick }));

    const interval = setInterval(() => {
      tick -= 1;
      if (tick <= 0) {
        clearInterval(interval);
        setState((prev) => ({ ...prev, countdown: null }));
        capture();
      } else {
        setState((prev) => ({ ...prev, countdown: tick }));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [capture, countdownFrom, setVerifyState]);

  // ── Per-frame quality handler (JS thread, called from worklet) ─────────────
  const handleFaceData = useCallback(
    (face: FaceData | null, width: number) => {
      const s = stateRef.current;
      if (
        s === 'confirmed' ||
        s === 'countdown' ||
        s === 'capturing' ||
        s === 'comparing' ||
        s === 'match' ||
        s === 'no_match' ||
        s === 'error'
      )
        return;

      const safeFace: FaceData = face ?? {
        detected: false,
        bounds: { x: 0, y: 0, width: 0, height: 0 },
        yawAngle: 0,
        pitchAngle: 0,
        rollAngle: 0,
        leftEyeOpenProbability: -1,
        rightEyeOpenProbability: -1,
        sharpness: 0,
      };

      if (__DEV__) {
        const ref = Math.min(
          safeFace.frameWidth ?? width,
          safeFace.frameHeight ?? width
        );
        const ratio = safeFace.detected
          ? (safeFace.bounds.width / ref).toFixed(3)
          : 'n/a';
        console.log(
          `[FaceVerify] step=${currentStepIdx.current}` +
            ` detected=${safeFace.detected}` +
            ` ratio=${ratio}` +
            ` yaw=${safeFace.yawAngle.toFixed(1)}` +
            ` sharpness=${safeFace.sharpness.toFixed(1)}`
        );
      }

      const step = QUALITY_STEPS[currentStepIdx.current]!;
      const stepMet = step.check(safeFace, width);

      if (stepMet) {
        stepFrameCount.current += 1;
      } else {
        stepFrameCount.current = Math.max(0, stepFrameCount.current - 1);
      }

      if (stepFrameCount.current >= step.framesRequired) {
        stepFrameCount.current = 0;
        const nextIdx = currentStepIdx.current + 1;

        if (nextIdx >= TOTAL_STEPS) {
          setState((prev) => ({
            ...prev,
            qualityScore: 1,
            feedback: 'Quality confirmed',
          }));
          setVerifyState('confirmed');
          startCountdown();
        } else {
          currentStepIdx.current = nextIdx;
          setState((prev) => ({
            ...prev,
            qualityScore: nextIdx / TOTAL_STEPS,
            feedback: QUALITY_STEPS[nextIdx]!.instruction,
          }));
        }
        return;
      }

      const progress =
        (currentStepIdx.current +
          stepFrameCount.current / step.framesRequired) /
        TOTAL_STEPS;
      setState((prev) => ({ ...prev, qualityScore: progress }));
    },
    [setVerifyState, startCountdown]
  );

  // ── Frame processor ────────────────────────────────────────────────────────
  const handleFaceDataJS = useMemo(
    () => Worklets.createRunOnJS(handleFaceData),
    [handleFaceData]
  );

  const frameProcessor = useFrameProcessor(
    (frame: Frame) => {
      'worklet';
      runAtTargetFps(20, () => {
        'worklet';
        const face = plugin.detectFaceQuality(frame);
        handleFaceDataJS(face, frame.width);
      });
    },
    [plugin, handleFaceDataJS]
  );

  useEffect(() => {
    return () => {
      currentStepIdx.current = 0;
      stepFrameCount.current = 0;
      isCaptured.current = false;
    };
  }, []);

  return {
    frameProcessor,
    faceVerifyState: state.faceVerifyState,
    qualityScore: state.qualityScore,
    countdown: state.countdown,
    feedback: state.feedback,
  };
}
