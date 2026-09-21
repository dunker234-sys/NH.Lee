import React, { useState } from 'react';
import { Alert, Text } from 'react-native';
import { useAccessibilityPrefs } from '../../accessibility/AccessibilityPrefsContext';
import { isBiometricAvailable, isBiometricEnrolledForApp, setBiometricEnrolledForApp } from '../../auth/biometric';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import { useLocale } from '../../i18n/LocaleContext';

export function LoginScreen() {
  const { t } = useLocale();
  const { palette, fs } = useAccessibilityPrefs();
  const { login } = useAuth();
  const [employeeNo, setEmployeeNo] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await login(employeeNo.trim(), password);
      await maybeOfferBiometricEnrollment();
    } catch {
      setError(t('login_error'));
    } finally {
      setSubmitting(false);
    }
  }

  async function maybeOfferBiometricEnrollment() {
    const [available, alreadyEnrolled] = await Promise.all([isBiometricAvailable(), isBiometricEnrolledForApp()]);
    if (!available || alreadyEnrolled) return;
    Alert.alert(t('login_biometric_offer_title'), t('login_biometric_offer_body'), [
      { text: t('login_biometric_offer_decline'), style: 'cancel' },
      { text: t('login_biometric_offer_accept'), onPress: () => setBiometricEnrolledForApp(true) },
    ]);
  }

  return (
    <Screen>
      <Text style={{ color: palette.text, fontSize: fs(28), fontWeight: '800', marginBottom: 24 }}>
        {t('login_title')}
      </Text>
      <TextField
        label={t('login_employee_no')}
        value={employeeNo}
        onChangeText={setEmployeeNo}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="next"
      />
      <TextField
        label={t('login_password')}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        returnKeyType="go"
        onSubmitEditing={handleSubmit}
      />
      {error && <Text style={{ color: palette.danger, fontSize: fs(14) }}>{error}</Text>}
      <Button
        label={t('login_submit')}
        onPress={handleSubmit}
        loading={submitting}
        disabled={!employeeNo || !password}
        size="large"
      />
    </Screen>
  );
}
