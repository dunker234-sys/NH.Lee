import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { useAccessibilityPrefs } from '../../accessibility/AccessibilityPrefsContext';
import { notificationApi } from '../../api';
import { AlertLogEntry } from '@attendance/shared-types';
import { Screen } from '../../components/Screen';
import { useLocale } from '../../i18n/LocaleContext';

/** 실제 GET /alert-log를 그대로 쓴다(목업 아님) — 단, 실제 알림 발송
 * 프로듀서(52시간 경고 등)가 아직 없어(docs/SELF_SERVICE_ENDPOINTS.md §5)
 * STEP6-9 전까지는 비어 있는 것이 정상이다. */
export function NotificationsScreen() {
  const { t } = useLocale();
  const { palette, fs } = useAccessibilityPrefs();
  const [items, setItems] = useState<AlertLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      notificationApi
        .listAlertLog()
        .then((res) => setItems(res.items))
        .finally(() => setLoading(false));
    }, []),
  );

  return (
    <Screen>
      {loading ? (
        <Text style={{ color: palette.textMuted, fontSize: fs(13) }}>{t('common_loading')}</Text>
      ) : items.length === 0 ? (
        <Text style={{ color: palette.textMuted, fontSize: fs(14) }}>{t('notifications_empty')}</Text>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: palette.border, gap: 2 }}>
              <Text style={{ color: palette.text, fontSize: fs(14), fontWeight: '700' }}>{item.notificationType}</Text>
              <Text style={{ color: palette.textMuted, fontSize: fs(12) }}>
                {item.channel} · {item.result} · {new Date(item.requestedAt).toLocaleString()}
              </Text>
            </View>
          )}
        />
      )}
    </Screen>
  );
}
