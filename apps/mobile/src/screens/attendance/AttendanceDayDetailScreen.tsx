import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useAccessibilityPrefs } from '../../accessibility/AccessibilityPrefsContext';
import { attendanceApi } from '../../api';
import { AttendanceDayDetailData } from '../../api/types';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { useLocale } from '../../i18n/LocaleContext';
import { StringKey } from '../../i18n/strings.ko';
import { AttendanceStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<AttendanceStackParamList, 'AttendanceDayDetail'>;
type Rte = RouteProp<AttendanceStackParamList, 'AttendanceDayDetail'>;

const STATUS_KEY: Record<string, StringKey> = {
  NORMAL: 'attendance_status_normal',
  LATE: 'attendance_status_late',
  EARLY_LEAVE: 'attendance_status_early_leave',
  ABSENT: 'attendance_status_absent',
  HOLIDAY_WORK: 'attendance_status_holiday_work',
  NO_SCHEDULE: 'attendance_status_no_schedule',
};

export function AttendanceDayDetailScreen() {
  const { t } = useLocale();
  const { palette, fs } = useAccessibilityPrefs();
  const { params } = useRoute<Rte>();
  const navigation = useNavigation<Nav>();
  const [detail, setDetail] = useState<AttendanceDayDetailData | null>(null);

  useEffect(() => {
    attendanceApi.getDayDetail(params.date).then((res) => setDetail(res.data));
  }, [params.date]);

  if (!detail) {
    return (
      <Screen scroll={false} style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: palette.textMuted, fontSize: fs(14) }}>{t('common_loading')}</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={{ color: palette.text, fontSize: fs(20), fontWeight: '800' }}>{params.date}</Text>
      <Text style={{ color: palette.text, fontSize: fs(16), fontWeight: '700' }}>{t(STATUS_KEY[detail.status])}</Text>
      <Text style={{ color: palette.textMuted, fontSize: fs(14) }}>
        {t('attendance_worked_minutes')}: {(detail.workedMinutes / 60).toFixed(1)}h
      </Text>

      {detail.punches.map((p, i) => (
        <Text key={i} style={{ color: palette.text, fontSize: fs(13) }}>
          {p.type} · {new Date(p.recordedAt).toLocaleTimeString()} · {p.verificationLevel}
        </Text>
      ))}

      {detail.note && <Text style={{ color: palette.warning, fontSize: fs(13) }}>{detail.note}</Text>}

      <View style={{ marginTop: 16 }}>
        <Button label={t('attendance_request_correction')} onPress={() => navigation.navigate('CorrectionRequestForm', { date: params.date })} />
      </View>
    </Screen>
  );
}
