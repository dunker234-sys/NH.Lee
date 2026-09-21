import React from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { useAccessibilityPrefs } from '../accessibility/AccessibilityPrefsContext';
import { MIN_TOUCH_TARGET, SPACING } from '../theme/tokens';

interface TextFieldProps extends TextInputProps {
  label: string;
}

export function TextField({ label, style, ...inputProps }: TextFieldProps) {
  const { palette, fs } = useAccessibilityPrefs();
  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: palette.textMuted, fontSize: fs(13) }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={palette.textMuted}
        style={[
          styles.input,
          { color: palette.text, borderColor: palette.border, backgroundColor: palette.surface, fontSize: fs(16) },
          style,
        ]}
        {...inputProps}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: SPACING.xs },
  label: { fontWeight: '600' },
  input: {
    minHeight: MIN_TOUCH_TARGET,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: SPACING.md,
  },
});
