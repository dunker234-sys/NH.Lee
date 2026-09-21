import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useAccessibilityPrefs } from '../../accessibility/AccessibilityPrefsContext';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { useLocationConsent } from '../../consent/LocationConsentContext';
import { FONT_SCALE_STEPS } from '../../theme/tokens';
import { SUPPORTED_LOCALES, useLocale } from '../../i18n/LocaleContext';
import { SettingsStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<SettingsStackParamList, 'Privacy'>;

const STATUS_KEY: Record<string, 'privacy_status_agreed' | 'privacy_status_paused' | 'privacy_status_withdrawn'> = {
  AGREED: 'privacy_status_agreed',
  PAUSED: 'privacy_status_paused',
  WITHDRAWN: 'privacy_status_withdrawn',
};

export function PrivacyScreen() {
  const { t, locale, setLocale } = useLocale();
  const { palette, fs, fontScale, setFontScale, highContrast, setHighContrast } = useAccessibilityPrefs();
  const { current, history, pause, resume, withdraw, agree, loading } = useLocationConsent();
  const navigation = useNavigation<Nav>();
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  const statusLabel = current ? t(STATUS_KEY[current.status]) : t('privacy_status_none');

  return (
    <Screen>
      <Text style={{ color: palette.text, fontSize: fs(22), fontWeight: '800' }}>{t('privacy_screen_title')}</Text>

      <Section title={t('privacy_location_section_title')}>
        {loading ? (
          <Text style={{ color: palette.textMuted, fontSize: fs(13) }}>{t('common_loading')}</Text>
        ) : (
          <>
            <Text style={{ color: palette.text, fontSize: fs(16), fontWeight: '700' }}>{statusLabel}</Text>
            {current?.status === 'AGREED' && (
              <Button label={t('privacy_pause_button')} variant="danger" onPress={() => run(pause)} loading={busy} />
            )}
            {(current?.status === 'PAUSED' || current?.status === 'WITHDRAWN') && (
              <Button label={t('privacy_resume_button')} onPress={() => run(resume)} loading={busy} />
            )}
            {!current && <Button label={t('consent_gate_agree')} onPress={() => run(agree)} loading={busy} />}
            {current?.status !== 'WITHDRAWN' && current && (
              <Button label={t('privacy_withdraw_button')} variant="secondary" onPress={() => run(withdraw)} loading={busy} />
            )}
            <Button label={t('privacy_view_access_log')} variant="secondary" onPress={() => navigation.navigate('LocationAccessLog')} />

            {history.length > 0 && (
              <View style={{ marginTop: 8, gap: 4 }}>
                <Text style={{ color: palette.textMuted, fontSize: fs(13), fontWeight: '700' }}>{t('privacy_history_title')}</Text>
                {history.map((h) => (
                  <Text key={h.id} style={{ color: palette.textMuted, fontSize: fs(12) }}>
                    {t(STATUS_KEY[h.status])} · {new Date(h.createdAt).toLocaleString()}
                  </Text>
                ))}
              </View>
            )}
          </>
        )}
      </Section>

      <Section title={t('privacy_accessibility_section_title')}>
        <Text style={{ color: palette.textMuted, fontSize: fs(13) }}>{t('privacy_font_scale_label')}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {FONT_SCALE_STEPS.map((step) => (
            <Button
              key={step}
              label={`${Math.round(step * 100)}%`}
              variant={fontScale === step ? 'primary' : 'secondary'}
              onPress={() => setFontScale(step)}
            />
          ))}
        </View>
        <Button
          label={t('privacy_high_contrast_label')}
          variant={highContrast ? 'primary' : 'secondary'}
          onPress={() => setHighContrast(!highContrast)}
        />
      </Section>

      <Section title={t('privacy_language_label')}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {SUPPORTED_LOCALES.map((l) => (
            <Button key={l} label={l.toUpperCase()} variant={locale === l ? 'primary' : 'secondary'} onPress={() => setLocale(l)} />
          ))}
        </View>
      </Section>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { palette, fs } = useAccessibilityPrefs();
  return (
    <View style={{ gap: 8, paddingVertical: 8, borderTopWidth: 1, borderColor: palette.border }}>
      <Text style={{ color: palette.text, fontSize: fs(15), fontWeight: '700' }}>{title}</Text>
      {children}
    </View>
  );
}
