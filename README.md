# @rick427/react-native-face-verify

Face verification library for React Native. Opens the front camera, runs real-time ML Kit quality checks, auto-captures when the image is sharp and well-positioned, then compares the capture against a reference image via **AWS Rekognition** or **your own backend endpoint**.

Same design language as [`@rick427/react-native-liveness`](https://github.com/rick427/react-native-liveness) — SVG circle overlay, rotating corner brackets, progress arc, countdown bubble.

---

## How it works

```
Camera opens (front)
  → Frame processor runs ML Kit quality checks at 20fps
  → Arc fills as quality builds (white → yellow → green)
  → Quality confirmed → countdown (3-2-1) → auto-capture
  → White border + ripple pulse animation (comparison in progress)
  → Green border  →  onMatch()    (same person)
  → Red border    →  onNoMatch()  (different person / no match)
```

**Quality gates (3 steps)**

| Step | Check | Frames required |
|---|---|---|
| 1 | Face detected | 3 |
| 2 | Correct size + looking straight + eyes open | 5 |
| 3 | Image sharp enough (Laplacian variance ≥ 80) | 5 |

---

## Installation

```sh
yarn add @rick427/react-native-face-verify
```

### Peer dependencies

Install these if not already present:

```sh
yarn add react-native-vision-camera \
         react-native-reanimated \
         react-native-svg \
         react-native-worklets-core
```

### iOS

```sh
cd ios && pod install
```

Add camera permission to `Info.plist`:

```xml
<key>NSCameraUsageDescription</key>
<string>Required for face verification</string>
```

### Android

Add camera permission to `AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.CAMERA" />
```

---

## Usage

### Drop-in modal (recommended)

```tsx
import { useState } from 'react';
import { FaceVerifyModal } from '@rick427/react-native-face-verify';
import type { VerifyResult } from '@rick427/react-native-face-verify';

export default function MyScreen() {
  const [showVerify, setShowVerify] = useState(false);

  const handleMatch = (result: VerifyResult) => {
    console.log('Match! Similarity:', result.similarity);
    setShowVerify(false);
  };

  const handleNoMatch = (result: VerifyResult) => {
    console.log('No match. Similarity:', result.similarity);
    setShowVerify(false);
  };

  return (
    <>
      <Button title="Verify Identity" onPress={() => setShowVerify(true)} />

      <FaceVerifyModal
        visible={showVerify}
        onClose={() => setShowVerify(false)}
        referenceImage={base64String}
        endpoint={{ url: 'https://api.example.com/compare' }}
        onMatch={handleMatch}
        onNoMatch={handleNoMatch}
      />
    </>
  );
}
```

### Inline component

```tsx
import { FaceVerify } from '@rick427/react-native-face-verify';

<FaceVerify
  style={{ flex: 1 }}
  referenceImage={base64String}
  endpoint={{ url: 'https://api.example.com/compare' }}
  onMatch={(result) => console.log(result)}
  onNoMatch={(result) => console.log(result)}
  onError={(err) => console.error(err)}
/>
```

### Hook (custom UI)

```tsx
import { useFaceVerify } from '@rick427/react-native-face-verify';

const { frameProcessor, faceVerifyState, qualityScore, countdown, feedback } =
  useFaceVerify({
    referenceImage,
    endpoint: { url: 'https://api.example.com/compare' },
    countdownFrom: 3,
    soundEnabled: true,
    cameraRef,
    onMatch,
    onNoMatch,
    onError,
  });
```

---

## Comparison paths

### Path A — Your backend (recommended)

Pass an `endpoint` object. The library POSTs both images to your server, which proxies the comparison service (AWS, Azure, DeepFace, etc). Credentials never touch the device.

```tsx
<FaceVerifyModal
  referenceImage={base64}
  endpoint={{
    url: 'https://api.yourserver.com/compare',
    headers: { Authorization: `Bearer ${token}` },
  }}
  onMatch={...}
  onNoMatch={...}
/>
```

**Expected POST body your server receives:**
```json
{ "referenceImage": "base64...", "capturedImage": "base64..." }
```

**Expected response from your server:**
```json
{ "match": true, "similarity": 98.5 }
```

---

### Path B — AWS Rekognition direct (escape hatch)

Pass `awsConfig`. The library calls `CompareFaces` directly using pure-JS AWS Signature V4 signing — no AWS SDK required.

```tsx
<FaceVerifyModal
  referenceImage={base64}
  awsConfig={{
    accessKeyId: 'AKIA...',
    secretAccessKey: '...',
    region: 'us-east-1',
    similarityThreshold: 80,
  }}
  onMatch={...}
  onNoMatch={...}
/>
```

> **Warning:** Do not ship real IAM credentials in a public app. Use this only for internal/MDM-managed applications. For public apps, use Path A and keep credentials on your server.

When `awsConfig` is provided, it takes priority over `endpoint`.

---

## API

### `FaceVerifyProps`

| Prop | Type | Default | Description |
|---|---|---|---|
| `referenceImage` | `string` | **required** | Base64-encoded reference image |
| `endpoint` | `{ url: string; headers?: Record<string, string> }` | — | Backend proxy config |
| `awsConfig` | `AwsConfig` | — | Direct Rekognition config (takes priority) |
| `onMatch` | `(result: VerifyResult) => void` | **required** | Fires when faces match |
| `onNoMatch` | `(result: VerifyResult) => void` | **required** | Fires when faces do not match |
| `onError` | `(error: Error) => void` | — | Fires on camera, network, or config errors |
| `countdownFrom` | `number` | `3` | Countdown start value before auto-capture |
| `soundEnabled` | `boolean` | `true` | Shutter sound on capture |
| `fontFamily` | `string` | `'Baloo-Medium'` | Font for all text inside the component |
| `style` | `ViewStyle` | — | Root container style (`FaceVerify` only) |

### `FaceVerifyModalProps`

All `FaceVerifyProps` (except `style`) plus:

| Prop | Type | Default | Description |
|---|---|---|---|
| `visible` | `boolean` | **required** | Controls modal visibility |
| `onClose` | `() => void` | **required** | Called on close button press or Android back |
| `animationType` | `'slide' \| 'fade' \| 'none'` | `'slide'` | Modal entrance animation |
| `closeButtonStyle` | `ViewStyle` | — | Override close button container styles |
| `closeButtonIconColor` | `string` | `'#fff'` | × icon colour |
| `closeButtonIconSize` | `number` | `18` | × icon size in dp |

### `VerifyResult`

```ts
type VerifyResult = {
  match: boolean;
  similarity: number;     // 0–100
  capturedImage: string;  // base64-encoded JPEG of the captured photo
  timestamp: number;      // Unix ms
};
```

### `AwsConfig`

```ts
type AwsConfig = {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  similarityThreshold?: number;  // default: 80
};
```

---

## State machine

| State | Border colour | Description |
|---|---|---|
| `scanning` | White → Yellow | Frame processor running, quality arc filling |
| `confirmed` | Green | All 3 quality steps passed |
| `countdown` | Green | Counting down to auto-capture |
| `capturing` | Green | Taking photo |
| `comparing` | White + ripple | Comparison request in flight |
| `match` | Green | Same person confirmed |
| `no_match` | Red | Different person or below threshold |
| `error` | Red | Camera, network, or config failure |

---

## Native modules

The library registers a Vision Camera frame processor plugin named `detectFaceQuality` on both platforms.

**iOS:** `FaceVerifyPlugin.swift` — ML Kit FaceDetector (fast mode, classification enabled) + Laplacian variance on the pixel buffer luma channel.

**Android:** `FaceVerifyPlugin.kt` — same via ML Kit + Laplacian variance on the `ImageProxy` Y plane.

The sharpness score (Laplacian variance) is computed by sampling every 8th pixel for performance. A score ≥ 80 passes the sharpness gate.

---

## License

MIT © [Richard](https://github.com/rick427)
