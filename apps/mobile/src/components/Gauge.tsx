import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAccessibilityPrefs } from '../accessibility/AccessibilityPrefsContext';
import { SPACING } from '../theme/tokens';

interface GaugeProps {
  label: string;
  valueMinutes: number;
  limitMinutes: number;
}

/** 이번 주 누적 + 52시간 게이지(홈 화면 요구사항). limitMinutes 근접/초과 시 경고색으로 전환. */
export function Gauge({ label, valueMinutes, limitMinutes }: GaugeProps) {
  const { palette, fs } = useAccessibilityPrefs();
  const ratio = limitMinutes > 0 ? Math.min(valueMinutes / limitMinutes, 1) : 0;
  const overLimit = valueMinutes >= limitMinutes;
  const nearLimit = !overLimit && ratio >= 0.9;
  const barColor = overLimit ? palette.danger : nearLimit ? palette.warning : palette.primary;

  const hours = (minutes: number) => (minutes / 60).toFixed(1);

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: palette.textMuted, fontSize: fs(13) }]}>{label}</Text>
      <View style={[styles.track, { backgroundColor: palette.border }]}>
        <View style={[styles.fill, { width: `${ratio * 100}%`, backgroundColor: barColor }]} />
      </View>
      <Text style={[styles.value, { color: palette.text, fontSize: fs(15) }]}>
        {hours(valueMinutes)}시간 / {hours(limitMinutes)}시간
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: SPACING.xs },
  label: { fontWeight: '600' },
  track: { height: 14, borderRadius: 7, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 7 },
  value: { fontWeight: '600' },
});
