import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAccessibilityPrefs } from '../../accessibility/AccessibilityPrefsContext';
import { attendanceApi } from '../../api';
import { AttendanceDaySummary, AttendanceDayStatus } from '../../api/types';
import { Banner } from '../../components/Banner';
import { Screen } from '../../components/Screen';
import { useLocale } from '../../i18n/LocaleContext';
import { AttendanceStackParamList } from '../../navigation/types';
import { pad2 } from '../../api/mockUtils';

type Nav = NativeStackNavigationProp<AttendanceStackParamList, 'MyAttendance'>;

const STATUS_KEY: Record<AttendanceDayStatus, string> = {
  NORMAL: 'attendance_status_normal',
  LATE: 'attendance_status_late',
  EARLY_LEAVE: 'attendance_status_early_leave',
  ABSENT: 'attendance_status_absent',
  HOLIDAY_WORK: 'attendance_status_holiday_work',
  NO_SCHEDULE: 'attendance_status_no_schedule',
};

function statusColor(status: AttendanceDayStatus, palette: ReturnType<typeof useAccessibilityPrefs>['palette']): string {
  switch (status) {
    case 'LATE':
    case 'EARLY_LEAVE':
      return palette.warning;
    case 'ABSENT':
      return palette.danger;
    case 'HOLIDAY_WORK':
      return palette.primary;
    default:
      return palette.textMuted;
  }
}

export function MyAttendanceScreen() {
  const { t } = useLocale();
  const { palette, fs } = useAccessibilityPrefs();
  const navigation = useNavigation<Nav>();
  const [yearMonth, setYearMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
  });
  const [days, setDays] = useState<AttendanceDaySummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    attendanceApi
      .getMonthSummary(yearMonth)
      .then((res) => setDays(res.data))
      .finally(() => setLoading(false));
  }, [yearMonth]);

  function shiftMonth(delta: number) {
    const [y, m] = yearMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setYearMonth(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`);
  }

  const [year, month] = yearMonth.split('-').map(Number);
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const cells: (AttendanceDaySummary | null)[] = [...Array(firstWeekday).fill(null), ...days];

  return (
    <Screen>
      <Banner text={t('mock_data_banner')} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Pressable onPress={() => shiftMonth(-1)} accessibilityRole="button" style={{ padding: 12 }}>
          <Text style={{ color: palette.primary, fontSize: fs(20) }}>‹</Text>
        </Pressable>
        <Text style={{ color: palette.text, fontSize: fs(18), fontWeight: '800' }}>{yearMonth}</Text>
        <Pressable onPress={() => shiftMonth(1)} accessibilityRole="button" style={{ padding: 12 }}>
          <Text style={{ color: palette.primary, fontSize: fs(20) }}>›</Text>
        </Pressable>
      </View>

      {loading ? (
        <Text style={{ color: palette.textMuted, fontSize: fs(13) }}>{t('common_loading')}</Text>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {cells.map((day, i) =>
            day ? (
              <Pressable
                key={day.date}
                accessibilityRole="button"
                onPress={() => navigation.navigate('AttendanceDayDetail', { date: day.date })}
                style={{ width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: palette.text, fontSize: fs(13) }}>{Number(day.date.slice(-2))}</Text>
                {day.status !== 'NO_SCHEDULE' && (
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: statusColor(day.status, palette), marginTop: 2 }} />
                )}
              </Pressable>
            ) : (
              <View key={`empty-${i}`} style={{ width: '14.28%', aspectRatio: 1 }} />
            ),
          )}
        </View>
      )}
    </Screen>
  );
}
