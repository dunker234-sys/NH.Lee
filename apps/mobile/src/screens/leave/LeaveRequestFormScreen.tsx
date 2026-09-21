import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useAccessibilityPrefs } from '../../accessibility/AccessibilityPrefsContext';
import { leaveApi } from '../../api';
import { LeaveRequestInput } from '../../api/types';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import { useLocale } from '../../i18n/LocaleContext';
import { LeaveStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<LeaveStackParamList, 'LeaveRequestForm'>;

const TYPES: LeaveRequestInput['leaveType'][] = ['ANNUAL', 'HALF_DAY', 'QUARTER_DAY'];

export function LeaveRequestFormScreen() {
  const { t } = useLocale();
  const { palette, fs } = useAccessibilityPrefs();
  const navigation = useNavigation<Nav>();
  const [leaveType, setLeaveType] = useState<LeaveRequestInput['leaveType']>('ANNUAL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      await leaveApi.submitRequest({ leaveType, startDate, endDate: endDate || startDate });
      navigation.goBack();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <Banner text={t('mock_data_banner')} />
      <Text style={{ color: palette.text, fontSize: fs(20), fontWeight: '800' }}>{t('leave_request_new')}</Text>

      <Text style={{ color: palette.textMuted, fontSize: fs(13) }}>{t('leave_request_type')}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {TYPES.map((type) => (
          <Button key={type} label={type} variant={leaveType === type ? 'primary' : 'secondary'} onPress={() => setLeaveType(type)} />
        ))}
      </View>

      <TextField label={t('leave_request_start')} value={startDate} onChangeText={setStartDate} placeholder="2026-08-27" />
      <TextField label={t('leave_request_end')} value={endDate} onChangeText={setEndDate} placeholder="2026-08-27" />

      <Button label={t('leave_request_submit')} onPress={submit} loading={submitting} disabled={!startDate} size="large" />
    </Screen>
  );
}
