import { NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AccessibilityPrefsProvider } from './accessibility/AccessibilityPrefsContext';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { LocationConsentProvider } from './consent/LocationConsentContext';
import { LocaleProvider } from './i18n/LocaleContext';
import { initOfflineDb } from './offline/db';
import { flushService } from './offline/flush.service';
import { startNetworkWatcher, stopNetworkWatcher } from './offline/networkWatcher';
import { startLocalNotificationWatcher } from './notifications/localNotifications';
import { registerPushToken, watchPushTokenRotation } from './notifications/pushRegistration';
import { RootNavigator } from './navigation/RootNavigator';

const queryClient = new QueryClient();

/** 앱 부팅 시 1회: 오프라인 DB 초기화, 즉시 플러시 시도(완료조건1의
 * "재실행 시 자동 전송"), 네트워크/로컬알림 감시 시작. */
function OfflineBootstrap() {
  useEffect(() => {
    initOfflineDb().then(() => flushService.trigger());
    startNetworkWatcher();
    const stopLocalNotifications = startLocalNotificationWatcher();
    return () => {
      stopNetworkWatcher();
      stopLocalNotifications();
    };
  }, []);
  return null;
}

/** 인증 완료 후에만 device-tokens 등록(그 엔드포인트가 JWT를 요구하므로). */
function PushBootstrap() {
  const { status, deviceId } = useAuth();
  useEffect(() => {
    if (status !== 'AUTHENTICATED' || !deviceId) return;
    registerPushToken(deviceId).catch(() => {});
    const stop = watchPushTokenRotation(deviceId);
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, deviceId]);
  return null;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AccessibilityPrefsProvider>
        <LocaleProvider>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <LocationConsentProvider>
                <OfflineBootstrap />
                <PushBootstrap />
                <NavigationContainer>
                  <RootNavigator />
                </NavigationContainer>
                <StatusBar style="auto" />
              </LocationConsentProvider>
            </AuthProvider>
          </QueryClientProvider>
        </LocaleProvider>
      </AccessibilityPrefsProvider>
    </SafeAreaProvider>
  );
}
