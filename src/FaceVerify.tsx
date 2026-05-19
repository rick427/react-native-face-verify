import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated as RNAnimated, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import {
  Camera,
  useCameraDevice,
  useCameraFormat,
  useCameraPermission,
} from 'react-native-vision-camera';
import { Circle, Defs, G, Path, Svg } from 'react-native-svg';
import { useFaceVerify } from './useFaceVerify';
import type { FaceVerifyProps, FaceVerifyState } from './types';

// ─── Animated SVG components ──────────────────────────────────────────────────
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedG = Animated.createAnimatedComponent(G);

// ─── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_FONT = 'Baloo-Medium';
const CIRCLE_DIAMETER_RATIO = 0.82;
const STROKE_WIDTH = 3;
const K = 0.5523;
const BRACKET_SPAN_DEG = 44;
const BRACKET_STROKE = STROKE_WIDTH + 1;
const RIPPLE_EXPAND = 44;
const RIPPLE_DURATION = 1800;
const RIPPLE_STAGGER = 600;

// ─── Colour helper ────────────────────────────────────────────────────────────
/**
 *  White  – scanning, no face yet
 *  Yellow – quality building
 *  Green  – confirmed / countdown / capturing / match
 *  White  – comparing (ripple handles the visual)
 *  Red    – no_match / error
 */
function getCircleColor(state: FaceVerifyState, score: number): string {
  switch (state) {
    case 'error':
    case 'no_match':
      return '#FF3B30';
    case 'confirmed':
    case 'countdown':
    case 'capturing':
    case 'match':
      return '#4CAF50';
    case 'comparing':
      return '#FFFFFF';
    default:
      return score > 0.02 ? '#FFD60A' : '#FFFFFF';
  }
}

// ─── SVG path helpers ─────────────────────────────────────────────────────────
function circlePath(cx: number, cy: number, r: number): string {
  return [
    `M ${cx + r} ${cy}`,
    `C ${cx + r} ${cy - r * K} ${cx + r * K} ${cy - r} ${cx} ${cy - r}`,
    `C ${cx - r * K} ${cy - r} ${cx - r} ${cy - r * K} ${cx - r} ${cy}`,
    `C ${cx - r} ${cy + r * K} ${cx - r * K} ${cy + r} ${cx} ${cy + r}`,
    `C ${cx + r * K} ${cy + r} ${cx + r} ${cy + r * K} ${cx + r} ${cy}`,
    'Z',
  ].join(' ');
}

function bracketArcPath(
  cx: number,
  cy: number,
  r: number,
  centerDeg: number,
  spanDeg: number
): string {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const a1 = toRad(centerDeg - spanDeg / 2);
  const a2 = toRad(centerDeg + spanDeg / 2);
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  const x2 = cx + r * Math.cos(a2);
  const y2 = cy + r * Math.sin(a2);
  return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
}

// ─── CircleOverlay ────────────────────────────────────────────────────────────
function CircleOverlay({
  width,
  height,
  state,
  score,
}: {
  width: number;
  height: number;
  state: FaceVerifyState;
  score: number;
}) {
  const bracketRot = useSharedValue(0);
  const qualityProgress = useSharedValue(0);

  // Three ripple shared values — one per ring, staggered by RIPPLE_STAGGER ms
  const ripples = [
    useSharedValue(0), // eslint-disable-line react-hooks/rules-of-hooks
    useSharedValue(0), // eslint-disable-line react-hooks/rules-of-hooks
    useSharedValue(0), // eslint-disable-line react-hooks/rules-of-hooks
  ] as const;

  const cx = width / 2;
  const cy = height * 0.42;
  const r = (width * CIRCLE_DIAMETER_RATIO) / 2;
  const circumference = 2 * Math.PI * r;
  const color = getCircleColor(state, score);

  const bracketAnimProps = useAnimatedProps(
    () => ({
      rotation: bracketRot.value % 360,
      originX: cx,
      originY: cy,
    }),
    [cx, cy]
  );

  const progressAnimProps = useAnimatedProps(
    () => ({
      strokeDashoffset: circumference * (1 - qualityProgress.value),
    }),
    [circumference]
  );

  // Ripple animated props — each ring expands from r to r + RIPPLE_EXPAND
  // while opacity fades from 0.65 to 0.
  const rippleProps = ripples.map((sv) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useAnimatedProps(
      () => ({
        r: r + sv.value * RIPPLE_EXPAND,
        opacity: (1 - sv.value) * 0.65,
      }),
      [r, sv]
    )
  ) as [
    ReturnType<typeof useAnimatedProps>,
    ReturnType<typeof useAnimatedProps>,
    ReturnType<typeof useAnimatedProps>,
  ];

  // Start bracket rotation on mount
  useEffect(() => {
    bracketRot.value = withRepeat(
      withTiming(360, { duration: 6000, easing: Easing.linear }),
      -1,
      false
    );
    return () => cancelAnimation(bracketRot);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Freeze brackets once quality is confirmed
  useEffect(() => {
    if (state !== 'scanning') {
      cancelAnimation(bracketRot);
    }
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  // Drive quality arc
  useEffect(() => {
    qualityProgress.value = withTiming(score, { duration: 220 });
  }, [score]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ripple animation — starts/stops with 'comparing' state
  useEffect(() => {
    if (state === 'comparing') {
      ripples.forEach((sv, i) => {
        sv.value = 0;
        sv.value = withDelay(
          i * RIPPLE_STAGGER,
          withRepeat(
            withTiming(1, { duration: RIPPLE_DURATION, easing: Easing.out(Easing.quad) }),
            -1,
            false
          )
        );
      });
    } else {
      ripples.forEach((sv) => {
        cancelAnimation(sv);
        sv.value = withTiming(0, { duration: 150 });
      });
    }
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  if (width === 0 || height === 0) return null;

  const scrimD = `M0 0H${width}V${height}H0Z ${circlePath(cx, cy, r)}`;
  const bracketD = [45, 135, 225, 315]
    .map((deg) => bracketArcPath(cx, cy, r, deg, BRACKET_SPAN_DEG))
    .join(' ');

  return (
    <Svg style={StyleSheet.absoluteFill} width={width} height={height}>
      <Defs />

      {/* Dark scrim with transparent circle cutout */}
      <Path d={scrimD} fill="rgba(0,0,0,0.55)" fillRule="evenodd" />

      {/* Dim base ring */}
      <Circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth={1}
      />

      {/* Ripple rings — visible only during 'comparing', expand outward */}
      {(rippleProps as ReturnType<typeof useAnimatedProps>[]).map((props, i) => (
        <AnimatedCircle
          key={i}
          cx={cx}
          cy={cy}
          fill="none"
          stroke="#FFFFFF"
          strokeWidth={STROKE_WIDTH}
          animatedProps={props}
        />
      ))}

      {/* Rotating corner brackets */}
      <AnimatedG animatedProps={bracketAnimProps}>
        <Path
          d={bracketD}
          fill="none"
          stroke={color}
          strokeWidth={BRACKET_STROKE}
          strokeLinecap="round"
          opacity={0.85}
        />
      </AnimatedG>

      {/* Progress arc — starts at 12 o'clock, fills clockwise */}
      <AnimatedCircle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={STROKE_WIDTH}
        strokeDasharray={circumference}
        strokeLinecap="round"
        transform={`rotate(-90, ${cx}, ${cy})`}
        animatedProps={progressAnimProps}
      />
    </Svg>
  );
}

// ─── CountdownBubble ──────────────────────────────────────────────────────────
function CountdownBubble({
  value,
  fontFamily,
}: {
  value: number;
  fontFamily: string;
}) {
  const scale = useRef(new RNAnimated.Value(0)).current;
  const opacity = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    RNAnimated.parallel([
      RNAnimated.sequence([
        RNAnimated.spring(scale, {
          toValue: 1.2,
          stiffness: 200,
          damping: 6,
          useNativeDriver: true,
        }),
        RNAnimated.spring(scale, {
          toValue: 1.0,
          stiffness: 150,
          damping: 8,
          useNativeDriver: true,
        }),
      ]),
      RNAnimated.timing(opacity, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();

    return () => {
      RNAnimated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <RNAnimated.View
      style={[styles.countdownBubble, { opacity, transform: [{ scale }] }]}
    >
      <Text style={[styles.countdownText, { fontFamily }]}>{value}</Text>
    </RNAnimated.View>
  );
}

// ─── FaceVerify ───────────────────────────────────────────────────────────────
export function FaceVerify({
  referenceImage,
  awsConfig,
  endpoint,
  onMatch,
  onNoMatch,
  onError,
  countdownFrom = 3,
  soundEnabled = true,
  fontFamily = DEFAULT_FONT,
  style,
}: FaceVerifyProps) {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');
  const format = useCameraFormat(device, [{ fps: 60 }]);
  const fps = Math.min(format?.maxFps ?? 30, 60);
  const cameraRef = useRef<Camera>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  const { frameProcessor, faceVerifyState, qualityScore, countdown, feedback } =
    useFaceVerify({
      referenceImage,
      awsConfig,
      endpoint,
      countdownFrom,
      soundEnabled,
      cameraRef,
      onMatch,
      onNoMatch,
      onError,
    });

  const handleLayout = useCallback(
    (e: { nativeEvent: { layout: { width: number; height: number } } }) => {
      const { width, height } = e.nativeEvent.layout;
      setContainerSize({ width, height });
    },
    []
  );

  useEffect(() => {
    if (!hasPermission) {
      requestPermission().catch(() => {
        onError?.(new Error('Camera permission denied'));
      });
    }
  }, [hasPermission, requestPermission, onError]);

  if (!hasPermission) {
    return (
      <View style={[styles.root, style, styles.centered]}>
        <Text style={[styles.permissionText, { fontFamily }]}>
          Camera permission required
        </Text>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={[styles.root, style, styles.centered]}>
        <Text style={[styles.permissionText, { fontFamily }]}>
          No front camera found
        </Text>
      </View>
    );
  }

  const isCameraActive =
    faceVerifyState !== 'match' &&
    faceVerifyState !== 'no_match' &&
    faceVerifyState !== 'error';

  const showFeedback =
    faceVerifyState !== 'countdown' && feedback.length > 0;

  return (
    <View style={[styles.root, style]} onLayout={handleLayout}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={isCameraActive}
        frameProcessor={frameProcessor}
        photo
        pixelFormat="yuv"
        format={format}
        fps={fps}
      />
      <CircleOverlay
        width={containerSize.width}
        height={containerSize.height}
        state={faceVerifyState}
        score={qualityScore}
      />
      {showFeedback && (
        <View style={styles.feedbackContainer}>
          <Text style={[styles.feedbackText, { fontFamily }]}>{feedback}</Text>
        </View>
      )}
      {faceVerifyState === 'countdown' && countdown !== null && (
        <View style={styles.countdownContainer}>
          <CountdownBubble
            key={countdown}
            value={countdown}
            fontFamily={fontFamily}
          />
        </View>
      )}
      {faceVerifyState === 'capturing' && (
        <View style={styles.captureFlash} pointerEvents="none" />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  permissionText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  feedbackContainer: {
    position: 'absolute',
    bottom: '12%',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  feedbackText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  countdownContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  countdownBubble: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 2,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  countdownText: {
    color: '#fff',
    fontSize: 52,
    lineHeight: 60,
  },
  captureFlash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fff',
    opacity: 0.4,
  },
});

