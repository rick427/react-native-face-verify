import type { ModalProps, ViewStyle } from 'react-native';

export type FaceVerifyState =
  | 'ready' // camera open, instructions shown, countdown running
  | 'capturing' // taking photo
  | 'comparing' // quality check + comparison call (same visual: ripple)
  | 'match' // same person confirmed
  | 'no_match' // different person or below threshold
  | 'error'; // camera or network failure

export type FeedbackMessage =
  | 'Position your face in the circle'
  | 'Hold still...'
  | 'Verifying identity...'
  | 'Identity verified'
  | 'Face not recognized'
  | 'Image unclear, trying again...'
  | 'Too dark — move to better lighting'
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
   * Calls AWS Rekognition CompareFaces directly from the device.
   * Only used when `endpoint` is not supplied.
   *
   * ⚠️  FOR LOCAL TESTING ONLY — never ship real IAM credentials in a
   * production app. Use `endpoint` instead and keep credentials on your server.
   */
  awsConfig?: AwsConfig;

  /**
   * POSTs both images to your backend which proxies the comparison service.
   * Takes priority over `awsConfig` when both are supplied.
   *
   * Expected POST body: `{ referenceImage: string, capturedImage: string }`
   * Expected response:  `{ match: boolean, similarity: number }`
   */
  endpoint?: EndpointConfig;

  /** Called when the captured face matches the reference image. */
  onMatch: (result: VerifyResult) => void;

  /** Called when the faces do not match or the service returns no match. */
  onNoMatch: (result: VerifyResult) => void;

  /** Called on any unrecoverable error (camera or network). */
  onError?: (error: Error) => void;

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
