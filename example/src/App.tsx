import { useState } from 'react';
import {
  Image,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { FaceVerifyModal } from '@rick427/react-native-face-verify';
import type { VerifyResult } from '@rick427/react-native-face-verify';

// Replace with your backend URL or awsConfig
const ENDPOINT = {
  url: 'https://your-api.example.com/compare',
  headers: {
    Authorization: 'Bearer YOUR_TOKEN',
  },
};

type Screen = 'home' | 'result';

export default function App() {
  const [showModal, setShowModal] = useState(false);
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [screen, setScreen] = useState<Screen>('home');

  const pickReferenceImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.9,
    });

    if (!picked.canceled && picked.assets[0]?.base64) {
      setReferenceImage(picked.assets[0].base64);
      setResult(null);
      setScreen('home');
    }
  };

  const handleMatch = (verifyResult: VerifyResult) => {
    setResult(verifyResult);
    setScreen('result');
    setShowModal(false);
  };

  const handleNoMatch = (verifyResult: VerifyResult) => {
    setResult(verifyResult);
    setScreen('result');
    setShowModal(false);
  };

  const handleError = (err: Error) => {
    console.error('[FaceVerify] error:', err.message);
    setShowModal(false);
  };

  const reset = () => {
    setResult(null);
    setScreen('home');
  };

  if (screen === 'result' && result) {
    return (
      <SafeAreaView style={styles.container}>
        <View
          style={[
            styles.resultBadge,
            result.match ? styles.badgeMatch : styles.badgeNoMatch,
          ]}
        >
          <Text style={styles.badgeText}>
            {result.match ? 'Identity Verified' : 'Face Not Recognized'}
          </Text>
        </View>

        <View style={styles.row}>
          {referenceImage && (
            <View style={styles.imageCard}>
              <Text style={styles.imageLabel}>Reference</Text>
              <Image
                source={{ uri: `data:image/jpeg;base64,${referenceImage}` }}
                style={styles.previewImage}
                resizeMode="cover"
              />
            </View>
          )}
          <View style={styles.imageCard}>
            <Text style={styles.imageLabel}>Captured</Text>
            <Image
              source={{ uri: `data:image/jpeg;base64,${result.capturedImage}` }}
              style={styles.previewImage}
              resizeMode="cover"
            />
          </View>
        </View>

        <Text style={styles.similarity}>
          Similarity:{' '}
          <Text
            style={[
              styles.similarityValue,
              result.match ? styles.green : styles.red,
            ]}
          >
            {result.similarity.toFixed(1)}%
          </Text>
        </Text>

        <TouchableOpacity style={styles.primaryButton} onPress={reset}>
          <Text style={styles.primaryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Face Verify</Text>
      <Text style={styles.subtitle}>
        Pick a reference photo, then verify against the front camera.
      </Text>

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={pickReferenceImage}
      >
        <Text style={styles.secondaryButtonText}>
          {referenceImage ? 'Change Reference Photo' : 'Pick Reference Photo'}
        </Text>
      </TouchableOpacity>

      {referenceImage && (
        <Image
          source={{ uri: `data:image/jpeg;base64,${referenceImage}` }}
          style={styles.referenceThumb}
          resizeMode="cover"
        />
      )}

      <TouchableOpacity
        style={[styles.primaryButton, !referenceImage && styles.buttonDisabled]}
        onPress={() => referenceImage && setShowModal(true)}
        disabled={!referenceImage}
      >
        <Text style={styles.primaryButtonText}>Start Verification</Text>
      </TouchableOpacity>

      <FaceVerifyModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        referenceImage={referenceImage ?? ''}
        endpoint={ENDPOINT}
        onMatch={handleMatch}
        onNoMatch={handleNoMatch}
        onError={handleError}
        animationType="slide"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F0F',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#999',
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 300,
  },
  primaryButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 16,
    paddingHorizontal: 36,
    borderRadius: 12,
    alignItems: 'center',
    width: '100%',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  secondaryButton: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    width: '100%',
  },
  secondaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
  },
  referenceThumb: {
    width: 120,
    height: 120,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  resultBadge: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 24,
    marginBottom: 8,
  },
  badgeMatch: {
    backgroundColor: '#1a3a1a',
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  badgeNoMatch: {
    backgroundColor: '#3a1a1a',
    borderWidth: 1,
    borderColor: '#FF3B30',
  },
  badgeText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    gap: 16,
  },
  imageCard: {
    alignItems: 'center',
    gap: 6,
  },
  imageLabel: {
    color: '#888',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  previewImage: {
    width: 140,
    height: 180,
    borderRadius: 12,
  },
  similarity: {
    color: '#ccc',
    fontSize: 16,
  },
  similarityValue: {
    fontWeight: '700',
  },
  green: {
    color: '#4CAF50',
  },
  red: {
    color: '#FF3B30',
  },
});
