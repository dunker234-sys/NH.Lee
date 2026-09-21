import React, { useState } from 'react';
import { Text } from 'react-native';
import { useAccessibilityPrefs } from '../../accessibility/AccessibilityPrefsContext';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import { useLocale } from '../../i18n/LocaleContext';

export function ForcePasswordChangeScreen() {
  const { t } = useLocale();
  const { palette, fs } = useAccessibilityPrefs();
  const { changePassword } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await changePassword(current, next);
    } catch {
      setError(t('common_error_generic'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <Text style={{ color: palette.text, fontSize: fs(22), fontWeight: '700' }}>
        {t('force_password_change_title')}
      </Text>
      <TextField label={t('force_password_change_current')} value={current} onChangeText={setCurrent} secureTextEntry />
      <TextField label={t('force_password_change_new')} value={next} onChangeText={setNext} secureTextEntry />
      {error && <Text style={{ color: palette.danger, fontSize: fs(14) }}>{error}</Text>}
      <Button
        label={t('force_password_change_submit')}
        onPress={handleSubmit}
        loading={submitting}
        disabled={!current || next.length < 8}
        size="large"
      />
    </Screen>
  );
}
