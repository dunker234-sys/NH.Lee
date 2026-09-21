import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { useAccessibilityPrefs } from '../../accessibility/AccessibilityPrefsContext';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { useLocationConsent } from '../../consent/LocationConsentContext';
import { useLocale } from '../../i18n/LocaleContext';
import { PunchQueueRow } from '../../offline/punchQueue.repository';
import { useQueueRows } from '../../offline/useQueueRows';
import { HomeStackParamList } from '../../navigation/types';
import { useMySites } from '../../punch/useMySites';
import { usePunchAction } from '../../punch/usePunchAction';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'Punch'>;

export function PunchScreen() {
  const { t } = useLocale();
  const { palette, fs } = useAccessibilityPrefs();
  const { canUseGps } = useLocationConsent();
  const { sites } = useMySites();
  const { punch } = usePunchAction();
  const rows = useQueueRows();
  const navigation = useNavigation<Nav>();
  const [busy, setBusy] = useState<'IN' | 'OUT' | null>(null);

  const primarySite = sites[0];

  async function handlePunch(type: 'IN' | 'OUT') {
    if (!primarySite) return;
    setBusy(type);
    try {
      await punch({
        punchType: type,
        siteId: primarySite.id,
        registrationMethod: canUseGps ? 'GPS' : 'NFC', // 동의 없으면 GPS 자체를 시도하지 않는다 — ScanScreen 경로 유도가 정석
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen>
      <Text style={{ color: palette.text, fontSize: fs(20), fontWeight: '800' }}>{t('punch_screen_title')}</Text>

      {!canUseGps && (
        <Banner variant="warning" text={t('punch_consent_denied_banner')}>
          <Button label={t('scan_screen_title')} onPress={() => navigation.navigate('Scan')} />
        </Banner>
      )}

      <View style={{ gap: 16 }}>
        <Button label={t('home_punch_in')} size="large" onPress={() => handlePunch('IN')} loading={busy === 'IN'} disabled={busy !== null} />
        <Button
          label={t('home_punch_out')}
          size="large"
          variant="secondary"
          onPress={() => handlePunch('OUT')}
          loading={busy === 'OUT'}
          disabled={busy !== null}
        />
      </View>

      <Text style={{ color: palette.text, fontSize: fs(16), fontWeight: '700', marginTop: 16 }}>
        {t('punch_queue_title')}
      </Text>
      <FlatList
        data={rows}
        keyExtractor={(row) => row.local_id}
        scrollEnabled={false}
        renderItem={({ item }) => <QueueRowItem row={item} />}
        ListEmptyComponent={<Text style={{ color: palette.textMuted, fontSize: fs(13) }}>—</Text>}
      />
    </Screen>
  );
}

function QueueRowItem({ row }: { row: PunchQueueRow }) {
  const { t } = useLocale();
  const { palette, fs } = useAccessibilityPrefs();
  const statusText =
    row.status === 'SENT'
      ? t('home_sync_synced')
      : row.status === 'FAILED_RETRYABLE'
        ? t('punch_send_failed_will_retry')
        : t('punch_offline_saved');
  const statusColor = row.status === 'SENT' ? palette.success : row.status === 'FAILED_RETRYABLE' ? palette.danger : palette.warning;

  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderColor: palette.border }}>
      <Text style={{ color: palette.text, fontSize: fs(14) }}>
        {row.punch_type} · {new Date(row.recorded_at).toLocaleTimeString()}
      </Text>
      <Text style={{ color: statusColor, fontSize: fs(13), fontWeight: '700' }}>{statusText}</Text>
    </View>
  );
}
