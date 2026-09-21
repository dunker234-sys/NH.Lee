import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { useAccessibilityPrefs } from '../../accessibility/AccessibilityPrefsContext';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { useLocale } from '../../i18n/LocaleContext';

/** status==='NEEDS_BIOMETRIC'일 때 표시 — 콜드 실행 시 저장된 refreshToken을 생체인증으로 잠금 해제한다(계획서 §7.3). */
export function BiometricGateScreen() {
  const { t } = useLocale();
  const { palette, fs } = useAccessibilityPrefs();
  const { loginWithBiometric, logout } = useAuth();
  const [failed, setFailed] = useState(false);
  const [prompting, setPrompting] = useState(false);

  async function attempt() {
    setPrompting(true);
    setFailed(false);
    const ok = await loginWithBiometric(t('login_biometric_prompt'));
    setPrompting(false);
    if (!ok) setFailed(true);
  }

  useEffect(() => {
    attempt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Screen scroll={false} style={{ alignItems: 'center', justifyContent: 'center', gap: 24 }}>
      <Text style={{ color: palette.text, fontSize: fs(20), fontWeight: '700', textAlign: 'center' }}>
        {t('login_biometric_prompt')}
      </Text>
      <Button label={t('common_retry')} onPress={attempt} loading={prompting} />
      {failed && <Button label={t('login_submit')} variant="secondary" onPress={() => logout()} />}
    </Screen>
  );
}
