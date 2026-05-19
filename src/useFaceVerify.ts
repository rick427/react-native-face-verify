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
function photoToBase64(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', `file://${path}`, true);
    xhr.responseType = 'blob';
    xhr.onload = () => {
      const blob: Blob = xhr.response;
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result.split(',')[1] ?? reader.result);
        } else {
          reject(new Error('[FaceVerify] Could not read captured photo.'));
        }
      };
      reader.onerror = () =>
        reject(new Error('[FaceVerify] Could not read captured photo.'));
      reader.readAsDataURL(blob);
    };
    xhr.onerror = () =>
      reject(new Error('[FaceVerify] Could not load photo from disk.'));
    xhr.send();
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
    let response: Response;
    try {
      response = await fetch(endpoint.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...endpoint.headers },
        body: JSON.stringify({ referenceImage, capturedImage }),
      });
    } catch (err) {
      throw new Error(
        `[FaceVerify] Could not reach endpoint "${endpoint.url}". Check the URL, internet connection, and that the server allows HTTP (not just HTTPS). Original: ${String(err)}`
      );
    }
    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `[FaceVerify] Endpoint ${response.status} at "${endpoint.url}": ${text}`
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
