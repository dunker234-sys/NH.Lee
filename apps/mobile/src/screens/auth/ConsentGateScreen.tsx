import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useAccessibilityPrefs } from '../../accessibility/AccessibilityPrefsContext';
import { consentApi } from '../../api/consentApi';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { useLocationConsent } from '../../consent/LocationConsentContext';
import { useLocale } from '../../i18n/LocaleContext';

const GATE_SHOWN_KEY_PREFIX = 'consent_gate_shown_v';

export async function isConsentGateShown(policyVersion: string): Promise<boolean> {
  return (await AsyncStorage.getItem(GATE_SHOWN_KEY_PREFIX + policyVersion)) === 'true';
}

async function markConsentGateShown(policyVersion: string): Promise<void> {
  await AsyncStorage.setItem(GATE_SHOWN_KEY_PREFIX + policyVersion, 'true');
}

interface Props {
  onDone: () => void;
}

/**
 * 최초 실행(정확히는: 이 정책버전에 대해 아직 응답한 적 없을 때) 1회
 * 표시된다. /consent/*는 인증이 필요한 엔드포인트라(punches 등과 동일한
 * JWT 요구) 로그인 이후 시점에만 호출할 수 있다 — 계획서 원문은 이 화면을
 * "AuthStack(미인증)"에 배치했지만, 실제 백엔드 계약상 로그인 후에만
 * 동작할 수 있어 RootNavigator가 AUTHENTICATED 상태 이후·MainTabs 이전에
 * 끼워 넣는다.
 */
export function ConsentGateScreen({ onDone }: Props) {
  const { t } = useLocale();
  const { palette, fs } = useAccessibilityPrefs();
  const { agree } = useLocationConsent();
  const [retentionDays, setRetentionDays] = useState<number | null>(null);
  const [policyVersion, setPolicyVersion] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    consentApi.getPolicy().then((policy) => {
      setRetentionDays(policy.retentionDays);
      setPolicyVersion(policy.policyVersion);
    });
  }, []);

  async function finish(didAgree: boolean) {
    if (!policyVersion) return;
    setSubmitting(true);
    try {
      if (didAgree) await agree();
      await markConsentGateShown(policyVersion);
      onDone();
    } finally {
      setSubmitting(false);
    }
  }

  if (!policyVersion) {
    return (
      <Screen scroll={false} style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: palette.textMuted, fontSize: fs(14) }}>{t('common_loading')}</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={{ color: palette.text, fontSize: fs(24), fontWeight: '800' }}>{t('consent_gate_title')}</Text>

      <NoticeItem label={t('consent_gate_purpose_label')} body={t('consent_gate_purpose_body')} />
      <NoticeItem label={t('consent_gate_items_label')} body={t('consent_gate_items_body')} />
      <NoticeItem
        label={t('consent_gate_retention_label')}
        body={t('consent_gate_retention_body', { days: retentionDays ?? '-' })}
      />
      <NoticeItem label={t('consent_gate_refusal_label')} body={t('consent_gate_refusal_body')} />
      <NoticeItem label={t('consent_gate_withdraw_label')} body={t('consent_gate_withdraw_body')} />

      <View style={{ gap: 12, marginTop: 12 }}>
        <Button label={t('consent_gate_agree')} onPress={() => finish(true)} loading={submitting} size="large" />
        <Button label={t('consent_gate_decline')} variant="secondary" onPress={() => finish(false)} disabled={submitting} />
      </View>
    </Screen>
  );
}

function NoticeItem({ label, body }: { label: string; body: string }) {
  const { palette, fs } = useAccessibilityPrefs();
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ color: palette.text, fontSize: fs(14), fontWeight: '700' }}>{label}</Text>
      <Text style={{ color: palette.textMuted, fontSize: fs(13), lineHeight: 18 }}>{body}</Text>
    </View>
  );
}
