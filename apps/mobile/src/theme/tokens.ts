/**
 * 접근성 요구사항(계획서 §8.2)을 코드 상수로 강제한다 — 화면별로 산발적으로
 * 스타일링하면 "48dp 이상" 같은 요구가 조용히 깨질 수 있어, 공용 컴포넌트
 * (Button 등)가 항상 이 상수를 참조하게 한다.
 */
export const MIN_TOUCH_TARGET = 48;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const FONT_SCALE_STEPS = [1.0, 1.15, 1.3] as const;
export type FontScaleStep = (typeof FONT_SCALE_STEPS)[number];

export interface ColorPalette {
  background: string;
  surface: string;
  text: string;
  textMuted: string;
  primary: string;
  primaryText: string;
  danger: string;
  success: string;
  warning: string;
  border: string;
}

export const LIGHT_PALETTE: ColorPalette = {
  background: '#F5F6F8',
  surface: '#FFFFFF',
  text: '#1A1D21',
  textMuted: '#5B6270',
  primary: '#1F6FEB',
  primaryText: '#FFFFFF',
  danger: '#D1242F',
  success: '#1A7F37',
  warning: '#9A6700',
  border: '#D8DCE2',
};

// WCAG AA 이상을 목표로 명암비를 키운 고대비 팔레트 — 단순히 더 어둡게가 아니라
// 텍스트/배경 대비를 명확히 분리한다.
export const HIGH_CONTRAST_PALETTE: ColorPalette = {
  background: '#000000',
  surface: '#000000',
  text: '#FFFFFF',
  textMuted: '#E0E0E0',
  primary: '#66B2FF',
  primaryText: '#000000',
  danger: '#FF6B6B',
  success: '#5FE38A',
  warning: '#FFD54A',
  border: '#FFFFFF',
};

export function fontSize(base: number, scale: number): number {
  return Math.round(base * scale);
}
