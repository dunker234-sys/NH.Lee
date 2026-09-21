import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { useAccessibilityPrefs } from '../../accessibility/AccessibilityPrefsContext';
import { applicationsApi } from '../../api';
import { ApplicationRecord } from '../../api/types';
import { Banner } from '../../components/Banner';
import { Screen } from '../../components/Screen';
import { StringKey } from '../../i18n/strings.ko';
import { useLocale } from '../../i18n/LocaleContext';

const KIND_KEY: Record<ApplicationRecord['kind'], StringKey> = {
  CORRECTION: 'application_kind_correction',
  LEAVE: 'application_kind_leave',
  OVERTIME: 'application_kind_overtime',
  DISPATCH: 'application_kind_dispatch',
};

const STATUS_COLOR_KEY: Record<ApplicationRecord['status'], 'warning' | 'success' | 'danger'> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
};

export function ApplicationsScreen() {
  const { t } = useLocale();
  const { palette, fs } = useAccessibilityPrefs();
  const [items, setItems] = useState<ApplicationRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      applicationsApi
        .listApplications()
        .then((res) => setItems(res.data))
        .finally(() => setLoading(false));
    }, []),
  );

  return (
    <Screen>
      <Banner text={t('mock_data_banner')} />
      {loading ? (
        <Text style={{ color: palette.textMuted, fontSize: fs(13) }}>{t('common_loading')}</Text>
      ) : items.length === 0 ? (
        <Text style={{ color: palette.textMuted, fontSize: fs(14) }}>{t('applications_empty')}</Text>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          renderItem={({ item }) => {
            const color = palette[STATUS_COLOR_KEY[item.status] === 'warning' ? 'warning' : STATUS_COLOR_KEY[item.status] === 'success' ? 'success' : 'danger'];
            return (
              <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: palette.border, gap: 2 }}>
                <Text style={{ color: palette.textMuted, fontSize: fs(11), fontWeight: '700' }}>{t(KIND_KEY[item.kind])}</Text>
                <Text style={{ color: palette.text, fontSize: fs(14) }}>{item.summary}</Text>
                <Text style={{ color, fontSize: fs(12), fontWeight: '700' }}>
                  {item.status}
                  {item.approvalStage ? ` · ${item.approvalStage}` : ''}
                </Text>
              </View>
            );
          }}
        />
      )}
    </Screen>
  );
}
