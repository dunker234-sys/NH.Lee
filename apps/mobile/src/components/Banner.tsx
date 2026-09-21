import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAccessibilityPrefs } from '../accessibility/AccessibilityPrefsContext';
import { SPACING } from '../theme/tokens';

interface BannerProps {
  text: string;
  variant?: 'info' | 'warning' | 'success';
  children?: React.ReactNode;
}

export function Banner({ text, variant = 'info', children }: BannerProps) {
  const { palette, fs } = useAccessibilityPrefs();
  const color = variant === 'warning' ? palette.warning : variant === 'success' ? palette.success : palette.primary;

  return (
    <View style={[styles.container, { borderColor: color, backgroundColor: palette.surface }]}>
      <Text style={[styles.text, { color: palette.text, fontSize: fs(14) }]}>{text}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1.5,
    borderRadius: 10,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  text: {
    lineHeight: 20,
  },
});
