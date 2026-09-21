import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Text } from 'react-native';
import { useAccessibilityPrefs } from '../../accessibility/AccessibilityPrefsContext';
import { applicationsApi } from '../../api';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import { useLocale } from '../../i18n/LocaleContext';
import { AttendanceStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<AttendanceStackParamList, 'CorrectionRequestForm'>;
type Rte = RouteProp<AttendanceStackParamList, 'CorrectionRequestForm'>;

export function CorrectionRequestFormScreen() {
  const { t } = useLocale();
  const { palette, fs } = useAccessibilityPrefs();
  const { params } = useRoute<Rte>();
  const navigation = useNavigation<Nav>();
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      await applicationsApi.submitCorrection(params.date, reason);
      setDone(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <Banner text={t('mock_data_banner')} />
      <Text style={{ color: palette.text, fontSize: fs(20), fontWeight: '800' }}>{t('correction_form_title')}</Text>
      <Text style={{ color: palette.textMuted, fontSize: fs(13) }}>{params.date}</Text>

      {done ? (
        <Banner variant="success" text={t('correction_form_submitted')} />
      ) : (
        <>
          <TextField
            label={t('correction_form_reason')}
            value={reason}
            onChangeText={setReason}
            multiline
            numberOfLines={4}
          />
          <Button label={t('correction_form_submit')} onPress={submit} loading={submitting} disabled={!reason.trim()} size="large" />
        </>
      )}
      {done && <Button label={t('common_confirm')} onPress={() => navigation.goBack()} />}
    </Screen>
  );
}
