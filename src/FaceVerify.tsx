import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
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
const CIRCLE_DIAMETER_RATIO = 0.88;
const STROKE_WIDTH = 3;
const K = 0.5523;
const BRACKET_SPAN_DEG = 44;
const BRACKET_STROKE = STROKE_WIDTH + 1;
const RIPPLE_EXPAND = 44;
const RIPPLE_DURATION = 1800;
const RIPPLE_STAGGER = 600;
const ERROR_DISMISS_MS = 5000;

// ─── Colour helper ────────────────────────────────────────────────────────────
function getCircleColor(state: FaceVerifyState): string {
  switch (state) {
    case 'match':
      return '#4CAF50';
    case 'no_match':
    case 'error':
      return '#FF3B30';
    default:
      return '#FFFFFF';
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
  return (
    `M ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)} ` +
    `A ${r} ${r} 0 0 1 ${cx + r * Math.cos(a2)} ${cy + r * Math.sin(a2)}`
  );
}

// ─── ErrorCard ────────────────────────────────────────────────────────────────
function ErrorCard({
  message,
  cardTop,
  onDismiss,
  fontFamily,
}: {
  message: string;
  cardTop: number;
  onDismiss: () => void;
  fontFamily: string;
}) {
  const opacity = useSharedValue(0);
  const ty = useSharedValue(20);
  const progress = useSharedValue(1);
  const trackWidth = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 280 });
    ty.value = withTiming(0, {
      duration: 280,
      easing: Easing.out(Easing.quad),
    });
    progress.value = withTiming(0, {
      duration: ERROR_DISMISS_MS,
      easing: Easing.linear,
    });
    const t = setTimeout(onDismiss, ERROR_DISMISS_MS);
    return () => {
      clearTimeout(t);
      cancelAnimation(progress);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cardStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: ty.value }],
  }));

  const barStyle = useAnimatedStyle(() => ({
    width: progress.value * trackWidth.value,
  }));

  const displayMsg = message
    .replace(/^\[FaceVerify\]\s*/, '')
    .replace(/\. Original:.*$/, '');

  return (
    <Animated.View style={[styles.errorCard, { top: cardTop }, cardStyle]}>
      <View style={styles.errorCardHeader}>
        <View style={styles.errorCardTitleRow}>
          <View style={styles.errorDot} />
          <Text style={[styles.errorCardTitle, { fontFamily }]}>
            Verification failed
          </Text>
        </View>
        <TouchableOpacity
          onPress={onDismiss}
          hitSlop={{ top: 10, bottom: 10, left: 12, right: 8 }}
        >
          <Text style={styles.errorCardX}>✕</Text>
        </TouchableOpacity>
      </View>
      <Text style={[styles.errorCardMsg, { fontFamily }]} numberOfLines={2}>
        {displayMsg}
      </Text>
      <View
        style={styles.errorTrack}
        onLayout={(e) => {
          trackWidth.value = e.nativeEvent.layout.width;
        }}
      >
        <Animated.View style={[styles.errorBar, barStyle]} />
      </View>
    </Animated.View>
  );
}

// ─── CircleOverlay ────────────────────────────────────────────────────────────
function CircleOverlay({
  width,
  height,
  state,
}: {
  width: number;
  height: number;
  state: FaceVerifyState;
}) {
  const bracketRot = useSharedValue(0);
  const ripple1 = useSharedValue(0);
  const ripple2 = useSharedValue(0);
  const ripple3 = useSharedValue(0);

  const cx = width / 2;
  const cy = height * 0.42;
  const r = (width * CIRCLE_DIAMETER_RATIO) / 2;
  const color = getCircleColor(state);

  const bracketAnimProps = useAnimatedProps(
    () => ({ rotation: bracketRot.value % 360, originX: cx, originY: cy }),
    [cx, cy]
  );

  const makeRippleProps = (sv: typeof ripple1) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useAnimatedProps(
      () => ({
        r: r + sv.value * RIPPLE_EXPAND,
        opacity: (1 - sv.value) * 0.65,
      }),
      [r, sv]
    );

  const rp1 = makeRippleProps(ripple1);
  const rp2 = makeRippleProps(ripple2);
  const rp3 = makeRippleProps(ripple3);

  useEffect(() => {
    bracketRot.value = withRepeat(
      withTiming(360, { duration: 6000, easing: Easing.linear }),
      -1,
      false
    );
    return () => cancelAnimation(bracketRot);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (state === 'match' || state === 'no_match' || state === 'error') {
      cancelAnimation(bracketRot);
    }
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ripples play during 'capturing' AND 'comparing' so loading feels instant
  useEffect(() => {
    const ripples = [ripple1, ripple2, ripple3];
    if (state === 'capturing' || state === 'comparing') {
      ripples.forEach((sv, i) => {
        sv.value = 0;
        sv.value = withDelay(
          i * RIPPLE_STAGGER,
          withRepeat(
            withTiming(1, {
              duration: RIPPLE_DURATION,
              easing: Easing.out(Easing.quad),
            }),
            -1,
            false
          )
        );
      });
    } else {
      ripples.forEach((sv) => {
        cancelAnimation(sv);
        sv.value = 0;
      });
    }
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  if (width === 0 || height === 0) return null;

  const scrimD = `M0 0H${width}V${height}H0Z ${circlePath(cx, cy, r)}`;
  const bracketD = [45, 135, 225, 315]
    .map((deg) => bracketArcPath(cx, cy, r, deg, BRACKET_SPAN_DEG))
    .join(' ');

  const showRipples = state === 'capturing' || state === 'comparing';

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

      {/* Ripple rings — visible during capturing + comparing */}
      {showRipples && (
        <>
          <AnimatedCircle
            cx={cx}
            cy={cy}
            fill="none"
            stroke="#FFFFFF"
            strokeWidth={STROKE_WIDTH}
            animatedProps={rp1}
          />
          <AnimatedCircle
            cx={cx}
            cy={cy}
            fill="none"
            stroke="#FFFFFF"
            strokeWidth={STROKE_WIDTH}
            animatedProps={rp2}
          />
          <AnimatedCircle
            cx={cx}
            cy={cy}
            fill="none"
            stroke="#FFFFFF"
            strokeWidth={STROKE_WIDTH}
            animatedProps={rp3}
          />
        </>
      )}

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

      {/* Static circle border — colour signals state */}
      <Circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={STROKE_WIDTH}
      />
    </Svg>
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
  soundEnabled = true,
  fontFamily = DEFAULT_FONT,
  style,
}: FaceVerifyProps) {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');
  const format = useCameraFormat(device, [{ fps: 60 }]);
  const fps = Math.min(format?.maxFps ?? 30, 60);
  const cameraRef = useState(() => ({ current: null as Camera | null }))[0];
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [showErrorCard, setShowErrorCard] = useState(false);

  const { faceVerifyState, feedback, errorMessage, capture, retry } =
    useFaceVerify({
      referenceImage,
      awsConfig,
      endpoint,
      soundEnabled,
      cameraRef: cameraRef as React.RefObject<Camera | null>,
      onMatch,
      onNoMatch,
      onError,
    });

  // Show error card whenever we enter the error state
  useEffect(() => {
    if (faceVerifyState === 'error') setShowErrorCard(true);
    else setShowErrorCard(false);
  }, [faceVerifyState]);

  const handleLayout = useCallback(
    (e: { nativeEvent: { layout: { width: number; height: number } } }) => {
      const { width, height } = e.nativeEvent.layout;
      setContainerSize({ width, height });
    },
    []
  );

  const handleRetry = useCallback(() => {
    setShowErrorCard(false);
    retry();
  }, [retry]);

  useEffect(() => {
    if (!hasPermission) {
      requestPermission().catch(() =>
        onError?.(new Error('Camera permission denied'))
      );
    }
  }, [hasPermission, requestPermission, onError]);

  // Position the error card just below the oval
  const errorCardTop =
    containerSize.height > 0
      ? containerSize.height * 0.42 +
        (containerSize.width * CIRCLE_DIAMETER_RATIO) / 2 +
        20
      : 0;

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

  return (
    <View style={[styles.root, style]} onLayout={handleLayout}>
      <Camera
        ref={(ref) => {
          (cameraRef as React.MutableRefObject<Camera | null>).current = ref;
        }}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={isCameraActive}
        photo
        pixelFormat="yuv"
        format={format}
        fps={fps}
      />
      <CircleOverlay
        width={containerSize.width}
        height={containerSize.height}
        state={faceVerifyState}
      />

      {/* Feedback text */}
      {faceVerifyState !== 'capturing' &&
        faceVerifyState !== 'comparing' &&
        feedback.length > 0 && (
          <View style={styles.feedbackContainer}>
            <Text style={[styles.feedbackText, { fontFamily }]}>
              {feedback}
            </Text>
          </View>
        )}

      {/* Shutter button — tap to capture */}
      {faceVerifyState === 'ready' && (
        <View style={styles.shutterContainer}>
          <TouchableOpacity
            style={styles.shutterRing}
            onPress={capture}
            activeOpacity={0.75}
          >
            <View style={styles.shutterInner} />
          </TouchableOpacity>
        </View>
      )}

      {/* Capture flash */}
      {faceVerifyState === 'capturing' && (
        <View style={styles.captureFlash} pointerEvents="none" />
      )}

      {/* Error card — slides in below the oval, auto-dismisses */}
      {faceVerifyState === 'error' && showErrorCard && errorMessage ? (
        <ErrorCard
          message={errorMessage}
          cardTop={errorCardTop}
          onDismiss={() => setShowErrorCard(false)}
          fontFamily={fontFamily}
        />
      ) : null}

      {/* Retry button — shown after error card has dismissed */}
      {faceVerifyState === 'error' && (
        <View style={styles.retryContainer}>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={handleRetry}
            activeOpacity={0.8}
          >
            <Text style={[styles.retryText, { fontFamily }]}>Try Again</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000', overflow: 'hidden' },
  centered: { justifyContent: 'center', alignItems: 'center' },
  permissionText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  feedbackContainer: {
    position: 'absolute',
    bottom: '22%',
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
  shutterContainer: {
    position: 'absolute',
    bottom: '8%',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  shutterRing: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#fff',
  },
  captureFlash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fff',
    opacity: 0.4,
  },
  // ─── Error card ──────────────────────────────────────────────────────────────
  errorCard: {
    position: 'absolute',
    left: 20,
    right: 20,
    backgroundColor: 'rgba(12, 12, 14, 0.93)',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.35)',
  },
  errorCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  errorCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  errorDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
  },
  errorCardTitle: {
    color: '#FF3B30',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  errorCardX: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 15,
    lineHeight: 20,
  },
  errorCardMsg: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 12,
  },
  errorTrack: {
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 1,
    overflow: 'hidden',
  },
  errorBar: {
    height: 2,
    backgroundColor: '#FF3B30',
    borderRadius: 1,
  },
  // ─── Retry button ─────────────────────────────────────────────────────────────
  retryContainer: {
    position: 'absolute',
    bottom: '8%',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  retryButton: {
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 9999,
    backgroundColor: '#fff',
  },
  retryText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
});
