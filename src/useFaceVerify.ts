import { useCallback, useRef, useState } from 'react';
import type { Camera } from 'react-native-vision-camera';
import { compareFacesWithRekognition } from './awsRekognition';
import type {
  AwsConfig,
  EndpointConfig,
  FaceVerifyState,
  FeedbackMessage,
  VerifyResult,
} from './types';

type Options = {
  referenceImage: string;
  awsConfig?: AwsConfig;
  endpoint?: EndpointConfig;
  soundEnabled: boolean;
  cameraRef: React.RefObject<Camera | null>;
  onMatch: (result: VerifyResult) => void;
  onNoMatch: (result: VerifyResult) => void;
  onError?: (error: Error) => void;
};

// ─── Base64 helper ─────────────────────────────────────────────────────────────
async function photoToBase64(path: string): Promise<string> {
  const response = await fetch(`file://${path}`);
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result.split(',')[1] ?? reader.result);
      } else {
        reject(new Error('FileReader result was not a string'));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ─── Comparison dispatcher ─────────────────────────────────────────────────────
async function runComparison(
  referenceImage: string,
  capturedImage: string,
  awsConfig?: AwsConfig,
  endpoint?: EndpointConfig
): Promise<{ match: boolean; similarity: number }> {
  if (endpoint) {
    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...endpoint.headers },
      body: JSON.stringify({ referenceImage, capturedImage }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `[FaceVerify] Endpoint error ${response.status}: ${text}`
      );
    }
    return response.json() as Promise<{ match: boolean; similarity: number }>;
  }
  if (awsConfig) {
    return compareFacesWithRekognition(
      awsConfig,
      referenceImage,
      capturedImage
    );
  }
  throw new Error(
    '[FaceVerify] Either `awsConfig` or `endpoint` must be provided.'
  );
}

// ─── Hook ──────────────────────────────────────────────────────────────────────
export function useFaceVerify(options: Options) {
  const {
    referenceImage,
    awsConfig,
    endpoint,
    soundEnabled,
    cameraRef,
    onMatch,
    onNoMatch,
    onError,
  } = options;

  const [faceVerifyState, setFaceVerifyState] =
    useState<FaceVerifyState>('ready');
  const [feedback, setFeedback] = useState<FeedbackMessage>(
    'Position your face in the circle'
  );

  const stateRef = useRef<FaceVerifyState>('ready');
  const isCaptured = useRef(false);

  const setState = useCallback((next: FaceVerifyState) => {
    stateRef.current = next;
    setFaceVerifyState(next);
  }, []);

  // ── Capture → compare ─────────────────────────────────────────────────────────
  const capture = useCallback(async () => {
    if (isCaptured.current || !cameraRef.current) return;
    if (
      stateRef.current === 'capturing' ||
      stateRef.current === 'comparing' ||
      stateRef.current === 'match' ||
      stateRef.current === 'no_match'
    )
      return;

    isCaptured.current = true;
    setState('capturing');

    try {
      const photo = await cameraRef.current.takePhoto({
        flash: 'off',
        enableShutterSound: soundEnabled,
      });

      setState('comparing');
      setFeedback('Verifying identity...');

      const capturedImage = await photoToBase64(photo.path);
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
        setFeedback('Identity verified');
        setState('match');
        onMatch(result);
      } else {
        setFeedback('Face not recognized');
        setState('no_match');
        onNoMatch(result);
      }
    } catch (err) {
      setState('error');
      setFeedback('');
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }, [
    cameraRef,
    soundEnabled,
    referenceImage,
    awsConfig,
    endpoint,
    onMatch,
    onNoMatch,
    onError,
    setState,
  ]);

  // ── Retry after error ─────────────────────────────────────────────────────────
  const retry = useCallback(() => {
    if (stateRef.current !== 'error') return;
    isCaptured.current = false;
    setState('ready');
    setFeedback('Position your face in the circle');
  }, [setState]);

  return { faceVerifyState, feedback, capture, retry };
}
