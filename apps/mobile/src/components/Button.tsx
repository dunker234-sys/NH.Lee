import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import { useAccessibilityPrefs } from '../accessibility/AccessibilityPrefsContext';
import { MIN_TOUCH_TARGET, SPACING } from '../theme/tokens';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'normal' | 'large';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

/** 접근성 요구사항(48dp 이상 터치영역, 폰트 배율, 고대비)을 모든 버튼에 강제 적용한다. */
export function Button({ label, onPress, variant = 'primary', size = 'normal', disabled, loading, style }: ButtonProps) {
  const { palette, fs } = useAccessibilityPrefs();
  const backgroundColor =
    variant === 'primary' ? palette.primary : variant === 'danger' ? palette.danger : palette.surface;
  const textColor = variant === 'secondary' ? palette.text : palette.primaryText;
  const height = size === 'large' ? 72 : MIN_TOUCH_TARGET;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled || loading) }}
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.base,
        {
          backgroundColor,
          minHeight: height,
          borderWidth: variant === 'secondary' ? 1 : 0,
          borderColor: palette.border,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={[styles.label, { color: textColor, fontSize: fs(size === 'large' ? 20 : 16) }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
  },
  label: {
    fontWeight: '700',
  },
});
