import React, { useEffect, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { useAccessibilityPrefs } from '../../accessibility/AccessibilityPrefsContext';
import { scheduleApi } from '../../api';
import { pad2 } from '../../api/mockUtils';
import { MonthSchedule, ScheduleDay, YearScheduleSummary } from '../../api/types';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { useLocale } from '../../i18n/LocaleContext';

type Mode = 'MONTH' | 'YEAR';

export function ScheduleScreen() {
  const { t } = useLocale();
  const { palette, fs } = useAccessibilityPrefs();
  const [mode, setMode] = useState<Mode>('MONTH');

  return (
    <Screen>
      <Banner text={t('mock_data_banner')} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button label={t('schedule_month_tab')} variant={mode === 'MONTH' ? 'primary' : 'secondary'} onPress={() => setMode('MONTH')} />
        <Button label={t('schedule_year_tab')} variant={mode === 'YEAR' ? 'primary' : 'secondary'} onPress={() => setMode('YEAR')} />
      </View>
      {mode === 'MONTH' ? <MonthView /> : <YearView />}
    </Screen>
  );
}

function MonthView() {
  const { t } = useLocale();
  const { palette, fs } = useAccessibilityPrefs();
  const [data, setData] = useState<MonthSchedule | null>(null);
  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;

  useEffect(() => {
    scheduleApi.getMonthSchedule(yearMonth).then((res) => setData(res.data));
  }, [yearMonth]);

  if (!data) return <Text style={{ color: palette.textMuted, fontSize: fs(13) }}>{t('common_loading')}</Text>;

  return (
    <FlatList
      data={data.days}
      keyExtractor={(d) => d.date}
      scrollEnabled={false}
      renderItem={({ item }) => <ScheduleDayRow day={item} />}
    />
  );
}

function ScheduleDayRow({ day }: { day: ScheduleDay }) {
  const { t } = useLocale();
  const { palette, fs } = useAccessibilityPrefs();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderColor: palette.border }}>
      <Text style={{ color: palette.text, fontSize: fs(14) }}>{day.date}</Text>
      <Text style={{ color: day.shiftName ? palette.text : palette.textMuted, fontSize: fs(14) }}>
        {day.shiftName ? `${day.shiftName} ${day.plannedStartTime}~${day.plannedEndTime}` : t('schedule_off_day')}
      </Text>
    </View>
  );
}

function YearView() {
  const { t } = useLocale();
  const { palette, fs } = useAccessibilityPrefs();
  const [data, setData] = useState<YearScheduleSummary | null>(null);
  const year = new Date().getFullYear();

  useEffect(() => {
    scheduleApi.getYearSchedule(year).then((res) => setData(res.data));
  }, [year]);

  if (!data) return <Text style={{ color: palette.textMuted, fontSize: fs(13) }}>{t('common_loading')}</Text>;

  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: palette.text, fontSize: fs(16), fontWeight: '700' }}>
        {t('schedule_year_total', { year: data.year })}: {data.totalScheduledDays}
      </Text>
      {data.byMonth.map((m) => (
        <View key={m.month} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: palette.text, fontSize: fs(14) }}>{m.month}월</Text>
          <Text style={{ color: palette.textMuted, fontSize: fs(14) }}>{m.scheduledDays}일</Text>
        </View>
      ))}
    </View>
  );
}
