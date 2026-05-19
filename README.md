# @rick427/react-native-face-verify

[![npm version](https://img.shields.io/npm/v/@rick427/react-native-face-verify?color=4CAF50&style=flat-square)](https://www.npmjs.com/package/@rick427/react-native-face-verify)
[![npm downloads](https://img.shields.io/npm/dm/@rick427/react-native-face-verify?style=flat-square)](https://www.npmjs.com/package/@rick427/react-native-face-verify)
[![license](https://img.shields.io/npm/l/@rick427/react-native-face-verify?style=flat-square)](LICENSE)
[![platforms](https://img.shields.io/badge/platforms-iOS%20%7C%20Android-lightgrey?style=flat-square)](https://github.com/rick427/react-native-face-verify)
[![vision camera](https://img.shields.io/badge/vision--camera-v4-blue?style=flat-square)](https://github.com/mrousavy/react-native-vision-camera)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)

Face verification library for React Native. Opens the front camera, auto-captures after a countdown, runs native ML Kit quality checks on the captured photo, then compares it against a reference image via **AWS Rekognition** or **your own backend endpoint**.

Same design language as [`@rick427/react-native-liveness`](https://github.com/rick427/react-native-liveness) — SVG circle overlay, rotating corner brackets, ripple pulse animation, countdown bubble.

---

## How it works

```
Camera opens (front)
  → 1.2 s stabilisation delay
  → Countdown (3 → 2 → 1)
  → Auto-capture (takePhoto)
  → Native quality check: brightness + sharpness + face detection
      ↳ Too dark  → reset, show feedback, retry countdown
      ↳ Blurry    → reset, show feedback, retry countdown
  → Convert photo to base64
  → Compare via endpoint or AWS Rekognition
  → White ripple during comparison
  → Green border  →  onMatch()    (same person)
  → Red border    →  onNoMatch()  (different person / no match)
```

**Quality checks (on captured photo)**

| Check | Threshold | Reject reason |
|---|---|---|
| Average luminance | < 40 | `too_dark` |
| Laplacian variance (sharpness) | < 60 | `blurry` |
| ML Kit face present | no face | `no_face` |
| Head pose (yaw/pitch) | > 25° | `bad_pose` |

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
         react-native-svg
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

const { faceVerifyState, feedback, countdown } = useFaceVerify({
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

### Path A — Your backend (recommended for production)

Pass an `endpoint` object. The library POSTs both images to your server, which proxies the comparison service (AWS Rekognition, Azure Face, DeepFace, etc). Your IAM credentials stay on the server and never touch the device.

```tsx
<FaceVerifyModal
  referenceImage={base64}
  endpoint={{
    url: 'https://api.yourserver.com/compare-faces',
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

When both `endpoint` and `awsConfig` are supplied, **`endpoint` always takes priority**.

---

### Path B — AWS Rekognition direct (local testing only)

> ### 🚨 WARNING — DO NOT USE IN PRODUCTION
>
> `awsConfig` embeds your AWS Access Key ID and Secret Access Key directly
> inside the app bundle. Anyone who decompiles your app can extract these
> credentials and use them to rack up charges or access your AWS account.
>
> **This path exists only for local development and testing.**
> Before you ship to the App Store or Play Store, switch to Path A and
> move your credentials to a backend server.

```tsx
<FaceVerifyModal
  referenceImage={base64}
  awsConfig={{
    accessKeyId: 'AKIA...',       // ← never commit or ship these
    secretAccessKey: '...',       // ← never commit or ship these
    region: 'us-east-1',
    similarityThreshold: 80,
  }}
  onMatch={...}
  onNoMatch={...}
/>
```

The library calls `CompareFaces` directly using pure-JS AWS Signature V4 signing — no AWS SDK required. Only used when `endpoint` is not provided.

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
| `ready` | White | Camera open, countdown running |
| `capturing` | White | Taking photo (brief flash) |
| `comparing` | White + ripple pulse | Quality check + comparison in flight |
| `match` | Green | Same person confirmed |
| `no_match` | Red | Different person or below threshold |
| `error` | Red | Camera, network, or config failure |

---

## Native modules

Quality checks run natively on the **captured photo** — not on every camera frame — so no frame processor or worklets are needed.

**iOS:** `FaceVerifyModule.swift` — computes average luma (brightness), Laplacian variance (sharpness) on the captured UIImage, then runs ML Kit FaceDetector for face presence and head-pose check.

**Android:** `FaceVerifyModule.kt` — same logic via BitmapFactory + ML Kit FaceDetector.

Both platforms resolve a promise with `{ passed: boolean, reason?: string }` which `useFaceVerify` uses to decide whether to retry the countdown or proceed with the comparison.

---

## License

```
MIT License

Copyright (c) 2026 Richard Njoku

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
