import type { ModalProps, ViewStyle } from 'react-native';

export type FaceData = {
  detected: boolean;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  frameWidth?: number;
  frameHeight?: number;
  yawAngle: number;
  pitchAngle: number;
  rollAngle: number;
  leftEyeOpenProbability: number;
  rightEyeOpenProbability: number;
  /** Laplacian variance of the frame — higher = sharper image. */
  sharpness: number;
};

export type FaceVerifyState =
  | 'scanning'
  | 'confirmed'
  | 'countdown'
  | 'capturing'
  | 'comparing'
  | 'match'
  | 'no_match'
  | 'error';

export type FeedbackMessage =
  | 'Position your face in the circle'
  | 'Look straight ahead'
  | 'Hold still'
  | 'Quality confirmed'
  | 'Verifying identity...'
  | 'Identity verified'
  | 'Face not recognized'
  | '';

export type VerifyResult = {
  match: boolean;
  /** Similarity score 0–100 returned by the comparison service. */
  similarity: number;
  /** Base64-encoded JPEG of the captured photo. */
  capturedImage: string;
  timestamp: number;
};

export type AwsConfig = {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  /** Minimum similarity threshold 0–100. Defaults to 80. */
  similarityThreshold?: number;
};

export type EndpointConfig = {
  url: string;
  headers?: Record<string, string>;
};

export type FaceVerifyProps = {
  /** Base64-encoded reference image to compare against. */
  referenceImage: string;

  /**
   * When provided, calls AWS Rekognition CompareFaces directly.
   * Takes priority over `endpoint` if both are supplied.
   *
   * WARNING: Do not ship real IAM credentials in a public app.
   * Use this only for internal / MDM-managed applications.
   */
  awsConfig?: AwsConfig;

  /**
   * When provided (and `awsConfig` is absent), POSTs both images to
   * your backend which proxies the comparison service.
   *
   * Expected POST body: `{ referenceImage: string, capturedImage: string }`
   * Expected response:  `{ match: boolean, similarity: number }`
   */
  endpoint?: EndpointConfig;

  /** Called when the captured face matches the reference image. */
  onMatch: (result: VerifyResult) => void;

  /** Called when the faces do not match or the service returns no match. */
  onNoMatch: (result: VerifyResult) => void;

  /** Called on any unrecoverable error (camera, network, config). */
  onError?: (error: Error) => void;

  /** Countdown start value before auto-capture. Defaults to 3. */
  countdownFrom?: number;

  /** Whether to play a shutter sound on capture. Defaults to true. */
  soundEnabled?: boolean;

  /**
   * Font family applied to all text inside the component.
   * Defaults to 'Baloo-Medium'. Set to undefined to use the system font.
   */
  fontFamily?: string;

  /** Style applied to the root container. */
  style?: ViewStyle;
};

export type FaceVerifyModalProps = Omit<FaceVerifyProps, 'style'> & {
  /** Controls modal visibility. */
  visible: boolean;

  /** Called when the close button is pressed or the Android back button fires. */
  onClose: () => void;

  /** Modal entrance/exit animation. Defaults to 'slide'. */
  animationType?: ModalProps['animationType'];

  /** Override styles on the close button container. */
  closeButtonStyle?: ViewStyle;

  /** Colour of the × icon inside the close button. Defaults to '#fff'. */
  closeButtonIconColor?: string;

  /** Size of the × icon in dp. Defaults to 18. */
  closeButtonIconSize?: number;
};
