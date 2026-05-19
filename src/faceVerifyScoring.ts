import type { FaceData, FeedbackMessage } from './types';

const FACE_SIZE_MIN = 0.2;
const FACE_SIZE_MAX = 0.8;
const SHARPNESS_THRESHOLD = 80;

/**
 * Camera buffers are often landscape even when the phone is portrait.
 * Using the shorter side as the reference dimension gives a ratio that
 * matches what the user sees on screen.
 */
function faceRatio(face: FaceData, fallbackFrameWidth: number): number {
  const fw = face.frameWidth ?? fallbackFrameWidth;
  const fh = face.frameHeight ?? 0;
  const ref = fh > 0 ? Math.min(fw, fh) : fw;
  return ref > 0 ? face.bounds.width / ref : 0;
}

export type QualityStep = {
  instruction: FeedbackMessage;
  framesRequired: number;
  check: (face: FaceData, frameWidth: number) => boolean;
};

/**
 * Sequential quality gates.
 * Each step must pass for `framesRequired` consecutive frames before
 * advancing. The progress arc fills 1/N per completed step.
 */
export const QUALITY_STEPS: readonly QualityStep[] = [
  {
    // Step 1: get face in frame — no size/pose gate so detection stabilises first.
    instruction: 'Position your face in the circle',
    framesRequired: 3,
    check: (face) => face.detected,
  },
  {
    // Step 2: correct size, looking straight, eyes open.
    instruction: 'Look straight ahead',
    framesRequired: 5,
    check: (face, fw) => {
      if (!face.detected) return false;
      const ratio = faceRatio(face, fw);
      const l = face.leftEyeOpenProbability;
      const r = face.rightEyeOpenProbability;
      return (
        ratio >= FACE_SIZE_MIN &&
        ratio <= FACE_SIZE_MAX &&
        Math.abs(face.yawAngle) < 12 &&
        Math.abs(face.pitchAngle) < 15 &&
        l >= 0 &&
        l > 0.5 &&
        r >= 0 &&
        r > 0.5
      );
    },
  },
  {
    // Step 3: enough sharpness — user must hold still to avoid motion blur.
    instruction: 'Hold still',
    framesRequired: 5,
    check: (face) => face.detected && face.sharpness >= SHARPNESS_THRESHOLD,
  },
] as const;
