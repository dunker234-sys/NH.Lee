import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useAccessibilityPrefs } from '../../accessibility/AccessibilityPrefsContext';
import { leaveApi } from '../../api';
import { LeaveBalance, LeaveRequest } from '../../api/types';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { useLocale } from '../../i18n/LocaleContext';
import { StringKey } from '../../i18n/strings.ko';
import { LeaveStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<LeaveStackParamList, 'Leave'>;

const STATUS_KEY: Record<LeaveRequest['status'], StringKey> = {
  PENDING: 'leave_status_pending',
  APPROVED: 'leave_status_approved',
  REJECTED: 'leave_status_rejected',
};

export function LeaveScreen() {
  const { t } = useLocale();
  const { palette, fs } = useAccessibilityPrefs();
  const navigation = useNavigation<Nav>();
  const [balance, setBalance] = useState<LeaveBalance | null>(null);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);

  useFocusEffect(
    useCallback(() => {
      leaveApi.getBalance().then((res) => setBalance(res.data));
      leaveApi.listRequests().then((res) => setRequests(res.data));
    }, []),
  );

  return (
    <Screen>
      <Banner text={t('mock_data_banner')} />

      {balance && (
        <View style={{ gap: 4 }}>
          <Text style={{ color: palette.text, fontSize: fs(22), fontWeight: '800' }}>
            {t('leave_balance_title')}: {balance.remainingDays}
          </Text>
          <Text style={{ color: palette.textMuted, fontSize: fs(13) }}>
            {t('leave_balance_used')}: {balance.usedDays} / {balance.totalDays}
          </Text>
          <Text style={{ color: palette.textMuted, fontSize: fs(12), fontWeight: '700', marginTop: 8 }}>
            {t('leave_balance_breakdown_title')}
          </Text>
          {balance.breakdown.map((b, i) => (
            <Text key={i} style={{ color: palette.textMuted, fontSize: fs(12) }}>
              {b.label}: {b.days}일
            </Text>
          ))}
        </View>
      )}

      <Button label={t('leave_request_new')} onPress={() => navigation.navigate('LeaveRequestForm')} />

      <View style={{ marginTop: 8 }}>
        {requests.map((r) => (
          <View key={r.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderColor: palette.border }}>
            <Text style={{ color: palette.text, fontSize: fs(14) }}>
              {r.startDate} ~ {r.endDate} ({r.days}일)
            </Text>
            <Text style={{ color: palette.textMuted, fontSize: fs(12) }}>{t(STATUS_KEY[r.status])}</Text>
          </View>
        ))}
      </View>
    </Screen>
  );
}
