import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useAccessibilityPrefs } from '../../accessibility/AccessibilityPrefsContext';
import { complianceApi, scheduleApi } from '../../api';
import { pad2 } from '../../api/mockUtils';
import { ScheduleDay, WeeklyComplianceGauge } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Gauge } from '../../components/Gauge';
import { Screen } from '../../components/Screen';
import { useLocale } from '../../i18n/LocaleContext';
import { useQueueStatus } from '../../offline/useQueueStatus';
import { useMySites } from '../../punch/useMySites';
import { usePunchAction } from '../../punch/usePunchAction';
import { HomeStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'Home'>;

function currentWeekMonday(): string {
  const now = new Date();
  const day = now.getDay(); // 0=일
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  return `${monday.getFullYear()}-${pad2(monday.getMonth() + 1)}-${pad2(monday.getDate())}`;
}

function todayString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/**
 * 완료조건4(홈 진입~타각 완료 2탭 이내): 이 화면의 출근/퇴근 버튼 자체가
 * 타각 트리거다 — PunchScreen으로 이동하지 않고 즉시 usePunchAction을
 * 호출한다. 일반 경로는 1탭으로 끝난다.
 */
export function HomeScreen() {
  const { t } = useLocale();
  const { palette, fs } = useAccessibilityPrefs();
  const { principal } = useAuth();
  const { pendingCount } = useQueueStatus();
  const { sites, loading: sitesLoading } = useMySites();
  const { punch } = usePunchAction();
  const navigation = useNavigation<Nav>();
  const [busy, setBusy] = useState<'IN' | 'OUT' | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [todaySchedule, setTodaySchedule] = useState<ScheduleDay | null>(null);
  const [gauge, setGauge] = useState<WeeklyComplianceGauge | null>(null);

  const primarySite = sites[0];

  // 목업 API(complianceApi/scheduleApi)라도 화면에 포커스될 때마다 최신값을
  // 반영한다 — 타각 직후 홈으로 돌아왔을 때 "현재까지 근로시간"이 갱신된
  // 것처럼 보이게 하는 최소한의 사실성.
  useFocusEffect(
    useCallback(() => {
      const yearMonth = todayString().slice(0, 7);
      scheduleApi.getMonthSchedule(yearMonth).then((res) => {
        setTodaySchedule(res.data.days.find((d) => d.date === todayString()) ?? null);
      });
      complianceApi.getWeeklyGauge(currentWeekMonday()).then((res) => setGauge(res.data));
    }, []),
  );

  async function handlePunch(type: 'IN' | 'OUT') {
    if (!primarySite) return;
    setBusy(type);
    try {
      await punch({ punchType: type, siteId: primarySite.id, registrationMethod: 'GPS' });
      setFeedback(t('home_punch_completed', { type: t(type === 'IN' ? 'home_punch_in' : 'home_punch_out') }));
      setTimeout(() => setFeedback(null), 3000);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen>
      <Text style={{ color: palette.text, fontSize: fs(22), fontWeight: '800' }}>
        {t('home_greeting', { name: principal?.employeeNo ?? '' })}
      </Text>

      {pendingCount > 0 && <Banner variant="warning" text={t('home_sync_pending_banner', { count: pendingCount })} />}
      {feedback && <Banner variant="success" text={feedback} />}

      <View style={{ height: 8 }} />

      {sitesLoading ? (
        <Text style={{ color: palette.textMuted, fontSize: fs(14) }}>{t('common_loading')}</Text>
      ) : !primarySite ? (
        <Banner variant="warning" text={t('common_error_generic')} />
      ) : (
        <View style={{ gap: 16 }}>
          <Button
            label={t('home_punch_in')}
            size="large"
            onPress={() => handlePunch('IN')}
            loading={busy === 'IN'}
            disabled={busy !== null}
          />
          <Button
            label={t('home_punch_out')}
            size="large"
            variant="secondary"
            onPress={() => handlePunch('OUT')}
            loading={busy === 'OUT'}
            disabled={busy !== null}
          />
        </View>
      )}

      <Button label={t('home_open_scan')} variant="secondary" onPress={() => navigation.navigate('Scan')} />

      {/* 오늘 근무 예정·현재까지 근로시간·주간 52시간 게이지: STEP6/STEP9 백엔드가
          없어 scheduleApi/complianceApi의 목업 구현을 쓴다(계획서 §2.3 mock/real 경계) —
          화면 코드는 실제 백엔드가 생겨도 그대로다. */}
      <Banner text={t('mock_data_banner')} />
      <View style={{ gap: 4 }}>
        <Text style={{ color: palette.textMuted, fontSize: fs(13), fontWeight: '700' }}>{t('home_today_schedule')}</Text>
        <Text style={{ color: palette.text, fontSize: fs(15) }}>
          {todaySchedule?.shiftName
            ? `${todaySchedule.shiftName} ${todaySchedule.plannedStartTime}~${todaySchedule.plannedEndTime}`
            : t('schedule_off_day')}
        </Text>
      </View>

      {gauge && (
        <View style={{ gap: 12, marginTop: 8 }}>
          <View style={{ gap: 4 }}>
            <Text style={{ color: palette.textMuted, fontSize: fs(13), fontWeight: '700' }}>{t('home_worked_so_far')}</Text>
            <Text style={{ color: palette.text, fontSize: fs(20), fontWeight: '800' }}>
              {(gauge.workedTodayMinutes / 60).toFixed(1)}시간
            </Text>
          </View>
          <Gauge label={t('home_weekly_gauge_title')} valueMinutes={gauge.totalWorkMinutes} limitMinutes={gauge.limitMinutes} />
        </View>
      )}
    </Screen>
  );
}
