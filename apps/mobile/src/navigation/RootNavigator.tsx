import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAccessibilityPrefs } from '../accessibility/AccessibilityPrefsContext';
import { useAuth } from '../auth/AuthContext';
import { useConsentGateNeeded } from '../consent/useConsentGateNeeded';
import { ConsentGateScreen } from '../screens/auth/ConsentGateScreen';
import { ForcePasswordChangeScreen } from '../screens/auth/ForcePasswordChangeScreen';
import { LocationAccessLogScreen } from '../screens/privacy/LocationAccessLogScreen';
import { PrivacyScreen } from '../screens/privacy/PrivacyScreen';
import { NotificationsScreen } from '../screens/notifications/NotificationsScreen';
import { useLocale } from '../i18n/LocaleContext';
import { AuthStack } from './AuthStack';
import { MainTabs } from './MainTabs';
import { NotificationsStackParamList, RootStackParamList, SettingsStackParamList } from './types';

const Root = createNativeStackNavigator<RootStackParamList>();
const SettingsStackNav = createNativeStackNavigator<SettingsStackParamList>();
const NotificationsStackNav = createNativeStackNavigator<NotificationsStackParamList>();

function SettingsModal() {
  const { t } = useLocale();
  return (
    <SettingsStackNav.Navigator>
      <SettingsStackNav.Screen name="Privacy" component={PrivacyScreen} options={{ title: t('nav_privacy') }} />
      <SettingsStackNav.Screen
        name="LocationAccessLog"
        component={LocationAccessLogScreen}
        options={{ title: t('location_access_log_title') }}
      />
    </SettingsStackNav.Navigator>
  );
}

function NotificationsModal() {
  const { t } = useLocale();
  return (
    <NotificationsStackNav.Navigator>
      <NotificationsStackNav.Screen name="Notifications" component={NotificationsScreen} options={{ title: t('nav_notifications') }} />
    </NotificationsStackNav.Navigator>
  );
}

function LoadingScreen() {
  const { palette } = useAccessibilityPrefs();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.background }}>
      <ActivityIndicator color={palette.primary} size="large" />
    </View>
  );
}

/**
 * 인증 상태에 따라 최상위 흐름을 게이팅한다: LOADING → 스피너,
 * UNAUTHENTICATED/NEEDS_BIOMETRIC → AuthStack, PASSWORD_CHANGE_REQUIRED →
 * 비밀번호 변경 화면(단독), AUTHENTICATED인데 동의 게이트 미응답 →
 * ConsentGateScreen(단독), 그 외 → MainTabs. ConsentGateScreen을
 * AuthStack이 아니라 여기 둔 이유는 /consent/*가 인증이 필요한 엔드포인트라
 * 로그인 이후에만 호출할 수 있기 때문이다(ConsentGateScreen.tsx 주석 참고).
 */
export function RootNavigator() {
  const { status } = useAuth();

  return (
    <Root.Navigator screenOptions={{ headerShown: false }}>
      {status === 'LOADING' ? (
        <Root.Screen name="AuthStack" component={LoadingScreenRoute} />
      ) : status === 'UNAUTHENTICATED' || status === 'NEEDS_BIOMETRIC' ? (
        <Root.Screen name="AuthStack" component={AuthStack} />
      ) : status === 'PASSWORD_CHANGE_REQUIRED' ? (
        <Root.Screen name="AuthStack" component={ForcePasswordChangeScreen} />
      ) : (
        <>
          <Root.Screen name="MainTabs" component={GatedMainTabs} />
          <Root.Screen name="NotificationsModal" component={NotificationsModal} options={{ headerShown: false, presentation: 'modal' }} />
          <Root.Screen name="SettingsModal" component={SettingsModal} options={{ headerShown: false, presentation: 'modal' }} />
        </>
      )}
    </Root.Navigator>
  );
}

function LoadingScreenRoute() {
  return <LoadingScreen />;
}

/** AUTHENTICATED가 됐지만 이번 정책버전에 대한 동의 게이트에 아직 응답하지 않았으면 MainTabs 대신 이 화면을 단독 표시한다. */
function GatedMainTabs() {
  const needed = useConsentGateNeeded();
  const [resolved, setResolved] = React.useState(false);

  if (needed === null) return <LoadingScreen />;
  if (needed && !resolved) return <ConsentGateScreen onDone={() => setResolved(true)} />;
  return <MainTabs />;
}
