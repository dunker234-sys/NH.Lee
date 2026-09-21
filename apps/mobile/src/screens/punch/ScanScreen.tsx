import { CameraView, useCameraPermissions } from 'expo-camera';
import React, { useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import NfcManager, { NfcTech } from 'react-native-nfc-manager';
import { useAccessibilityPrefs } from '../../accessibility/AccessibilityPrefsContext';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { useLocale } from '../../i18n/LocaleContext';
import { useMySites } from '../../punch/useMySites';
import { usePunchAction } from '../../punch/usePunchAction';

type Mode = 'NFC' | 'QR';

export function ScanScreen() {
  const { t } = useLocale();
  const { palette, fs } = useAccessibilityPrefs();
  const { sites } = useMySites();
  const { punch } = usePunchAction();
  const [mode, setMode] = useState<Mode>('NFC');
  const [punchType, setPunchType] = useState<'IN' | 'OUT'>('IN');
  const [status, setStatus] = useState<string>('');

  const primarySite = sites[0];

  async function submit(registrationMethod: 'NFC' | 'QR', token: string) {
    if (!primarySite) return;
    await punch({ punchType, siteId: primarySite.id, registrationMethod, qrOrNfcToken: token });
    setStatus(t('home_punch_completed', { type: t(punchType === 'IN' ? 'home_punch_in' : 'home_punch_out') }));
  }

  return (
    <Screen>
      <Text style={{ color: palette.text, fontSize: fs(20), fontWeight: '800' }}>{t('scan_screen_title')}</Text>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button label={t('home_punch_in')} variant={punchType === 'IN' ? 'primary' : 'secondary'} onPress={() => setPunchType('IN')} />
        <Button label={t('home_punch_out')} variant={punchType === 'OUT' ? 'primary' : 'secondary'} onPress={() => setPunchType('OUT')} />
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button label={t('scan_nfc_tab')} variant={mode === 'NFC' ? 'primary' : 'secondary'} onPress={() => setMode('NFC')} />
        <Button label={t('scan_qr_tab')} variant={mode === 'QR' ? 'primary' : 'secondary'} onPress={() => setMode('QR')} />
      </View>

      {mode === 'NFC' ? <NfcPane onTag={(uid) => submit('NFC', uid)} /> : <QrPane onCode={(code) => submit('QR', code)} />}

      {status !== '' && <Text style={{ color: palette.success, fontSize: fs(14), fontWeight: '700' }}>{status}</Text>}
    </Screen>
  );
}

function NfcPane({ onTag }: { onTag: (uid: string) => void }) {
  const { t } = useLocale();
  const { palette, fs } = useAccessibilityPrefs();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    NfcManager.isSupported()
      .then(setSupported)
      .catch(() => setSupported(false));
    return () => {
      NfcManager.cancelTechnologyRequest().catch(() => {});
    };
  }, []);

  async function startScan() {
    setWaiting(true);
    try {
      await NfcManager.start();
      await NfcManager.requestTechnology(NfcTech.NfcA);
      const tag = await NfcManager.getTag();
      if (tag?.id) onTag(tag.id);
    } catch {
      // 사용자가 태깅을 취소했거나 태그 인식 실패 — 조용히 재시도 가능하게 둔다.
    } finally {
      await NfcManager.cancelTechnologyRequest().catch(() => {});
      setWaiting(false);
    }
  }

  if (supported === false) {
    return <Text style={{ color: palette.danger, fontSize: fs(14) }}>{t('scan_nfc_unsupported')}</Text>;
  }

  return (
    <View style={{ gap: 12, alignItems: 'center', paddingVertical: 24 }}>
      <Text style={{ color: palette.textMuted, fontSize: fs(14), textAlign: 'center' }}>{t('scan_nfc_instruction')}</Text>
      <Button label={waiting ? t('scan_nfc_waiting') : t('scan_nfc_tab')} onPress={startScan} loading={waiting} size="large" />
    </View>
  );
}

function QrPane({ onCode }: { onCode: (code: string) => void }) {
  const { t } = useLocale();
  const { palette, fs } = useAccessibilityPrefs();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  if (Platform.OS === 'web') {
    return <Text style={{ color: palette.textMuted, fontSize: fs(13) }}>웹 미리보기에서는 QR 스캔을 지원하지 않습니다.</Text>;
  }

  if (!permission) return null;
  if (!permission.granted) {
    return <Button label={t('scan_qr_tab')} onPress={requestPermission} />;
  }

  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: palette.textMuted, fontSize: fs(14) }}>{t('scan_qr_instruction')}</Text>
      <View style={{ height: 280, borderRadius: 12, overflow: 'hidden' }}>
        <CameraView
          style={{ flex: 1 }}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={
            scanned
              ? undefined
              : ({ data }) => {
                  setScanned(true);
                  onCode(data);
                  setTimeout(() => setScanned(false), 3000);
                }
          }
        />
      </View>
    </View>
  );
}
