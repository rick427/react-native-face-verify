import { Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Path, Svg } from 'react-native-svg';
import { FaceVerify } from './FaceVerify';
import type { FaceVerifyModalProps } from './types';

/** × icon drawn with SVG — no external icon library required. */
function CloseIcon({
  color = '#fff',
  size = 18,
}: {
  color?: string;
  size?: number;
}) {
  const pad = size * 0.1;
  const end = size - pad;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Path
        d={`M${pad} ${pad} L${end} ${end} M${end} ${pad} L${pad} ${end}`}
        stroke={color}
        strokeWidth={size * 0.14}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * Drop-in face verification modal.
 *
 * ```tsx
 * <FaceVerifyModal
 *   visible={showVerify}
 *   onClose={() => setShowVerify(false)}
 *   referenceImage={base64String}
 *   endpoint={{ url: 'https://api.example.com/compare' }}
 *   onMatch={(result) => console.log('Match!', result.similarity)}
 *   onNoMatch={(result) => console.log('No match', result.similarity)}
 * />
 * ```
 */
export function FaceVerifyModal({
  visible,
  onClose,
  animationType = 'slide',
  closeButtonStyle,
  closeButtonIconColor = '#fff',
  closeButtonIconSize = 18,
  referenceImage,
  awsConfig,
  endpoint,
  onMatch,
  onNoMatch,
  onError,
  countdownFrom,
  soundEnabled,
  fontFamily,
}: FaceVerifyModalProps) {
  return (
    <Modal
      visible={visible}
      animationType={animationType}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <FaceVerify
          style={styles.camera}
          referenceImage={referenceImage}
          awsConfig={awsConfig}
          endpoint={endpoint}
          onMatch={onMatch}
          onNoMatch={onNoMatch}
          onError={onError}
          countdownFrom={countdownFrom}
          soundEnabled={soundEnabled}
          fontFamily={fontFamily}
        />

        <TouchableOpacity
          style={[styles.closeButton, closeButtonStyle]}
          onPress={onClose}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <CloseIcon color={closeButtonIconColor} size={closeButtonIconSize} />
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  closeButton: {
    position: 'absolute',
    top: 52,
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
});
