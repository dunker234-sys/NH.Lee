import React from 'react';
import { ScrollView, StyleSheet, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAccessibilityPrefs } from '../accessibility/AccessibilityPrefsContext';
import { SPACING } from '../theme/tokens';

interface ScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  style?: ViewStyle;
}

export function Screen({ children, scroll = true, style }: ScreenProps) {
  const { palette } = useAccessibilityPrefs();
  const Container = scroll ? ScrollView : View;
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]} edges={['top', 'bottom']}>
      <Container
        style={scroll ? undefined : styles.flex}
        contentContainerStyle={scroll ? [styles.content, style] : undefined}
      >
        {scroll ? children : <View style={[styles.content, styles.flex, style]}>{children}</View>}
      </Container>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: SPACING.lg, gap: SPACING.md },
});
