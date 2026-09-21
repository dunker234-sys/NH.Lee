import { LocationAccessLogEntry } from '@attendance/shared-types';
import React, { useEffect, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { useAccessibilityPrefs } from '../../accessibility/AccessibilityPrefsContext';
import { locationAccessLogApi } from '../../api/locationAccessLogApi';
import { Screen } from '../../components/Screen';
import { useLocale } from '../../i18n/LocaleContext';

/**
 * 위치정보법 §16조②/§24조③ 확인자료 열람. 순수 읽기 화면 — 서버에
 * 실제로 이 자료를 쓰는 코드가 아직 없어(알려진 갭, docs/
 * SELF_SERVICE_ENDPOINTS.md §4) 지금은 항상 빈 목록이 정상이다.
 */
export function LocationAccessLogScreen() {
  const { t } = useLocale();
  const { palette, fs } = useAccessibilityPrefs();
  const [items, setItems] = useState<LocationAccessLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    locationAccessLogApi
      .list()
      .then((res) => setItems(res.items))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Screen>
      <Text style={{ color: palette.text, fontSize: fs(20), fontWeight: '800' }}>{t('location_access_log_title')}</Text>
      {loading ? (
        <Text style={{ color: palette.textMuted, fontSize: fs(13) }}>{t('common_loading')}</Text>
      ) : items.length === 0 ? (
        <Text style={{ color: palette.textMuted, fontSize: fs(14) }}>{t('location_access_log_empty')}</Text>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <View style={{ paddingVertical: 8, borderBottomWidth: 1, borderColor: palette.border, gap: 2 }}>
              <Text style={{ color: palette.text, fontSize: fs(14) }}>
                {t('location_access_log_purpose')}: {item.accessPurpose}
              </Text>
              <Text style={{ color: palette.textMuted, fontSize: fs(12) }}>
                {t('location_access_log_accessed_by')}: {item.accessedBy} · {t('location_access_log_accessed_at')}:{' '}
                {new Date(item.accessedAt).toLocaleString()}
              </Text>
            </View>
          )}
        />
      )}
    </Screen>
  );
}
