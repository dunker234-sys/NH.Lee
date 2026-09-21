import type { ExpoConfig } from 'expo/config';

// EXPO_PUBLIC_* 접두 환경변수는 Expo가 빌드 시 클라이언트 번들에 그대로
// 인라인한다 — EAS 빌드 프로필(development/preview/production)별로 다른
// API 주소를 넣을 때 이 방식을 쓴다(계획서 §11-3). 아직 스테이징 서버가
// 없어 기본값은 로컬 개발 서버(apps/api 기본 포트)를 가리킨다.
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

// TODO(사용자 확인 필요): 실제 배포용 번들 ID/패키지명으로 교체할 것.
// EAS 빌드(Apple Developer/Google Play 계정 필요, 계획서 §11-1)를 준비할 때
// 회사의 실제 도메인 역순 식별자로 바꿔야 한다.
const BUNDLE_IDENTIFIER = 'kr.co.attendance.worker';

const config: ExpoConfig = {
  name: '근태관리',
  slug: 'attendance-worker',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  scheme: 'attendance-worker',
  ios: {
    supportsTablet: false,
    bundleIdentifier: BUNDLE_IDENTIFIER,
    // NFC 태깅(react-native-nfc-manager)에 필요 — 유료 Apple Developer 계정의
    // com.apple.developer.nfc.readersession.formats 엔타이틀먼트가 있어야
    // 실기기에서 동작한다(계획서 §11-2).
    infoPlist: {
      NFCReaderUsageDescription: '출퇴근 타각을 위해 NFC 태그를 읽습니다.',
      NSCameraUsageDescription: 'QR 코드로 출퇴근을 등록하기 위해 카메라를 사용합니다.',
      NSLocationWhenInUseUsageDescription: '출퇴근 위치 확인(지오펜스 인증)을 위해 위치 정보를 사용합니다. 상시 추적하지 않습니다.',
      NSFaceIDUsageDescription: '생체인증으로 빠르게 로그인하기 위해 사용합니다.',
    },
    entitlements: {
      'com.apple.developer.nfc.readersession.formats': ['TAG'],
    },
  },
  android: {
    package: BUNDLE_IDENTIFIER,
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'NFC', 'CAMERA', 'USE_BIOMETRIC', 'USE_FINGERPRINT'],
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-secure-store',
    'expo-sqlite',
    'expo-local-authentication',
    'expo-localization',
    [
      'expo-location',
      {
        locationWhenInUsePermission: '출퇴근 위치 확인(지오펜스 인증)을 위해 위치 정보를 사용합니다. 상시 추적하지 않습니다.',
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission: 'QR 코드로 출퇴근을 등록하기 위해 카메라를 사용합니다.',
      },
    ],
    [
      'expo-notifications',
      {
        // 로컬 알림 아이콘 — 실제 사업장 로고로 추후 교체.
        icon: './assets/icon.png',
      },
    ],
  ],
  extra: {
    apiBaseUrl: API_BASE_URL,
  },
};

export default config;
