export const colors = {
  bg: '#05060a',
  surface: '#10121b',
  surfaceAlt: '#171a25',
  border: '#242838',
  text: '#f5f6fb',
  muted: '#9aa0b5',
  faint: '#6b7186',
  primary: '#8b5cf6',
  primaryDark: '#6d3ff0',
  pink: '#ec4899',
  cyan: '#22d3ee',
  success: '#22c55e',
  danger: '#ef4444',
  overlay: 'rgba(5,6,10,0.72)',
  white: '#ffffff',
  black: '#000000',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
};

export const gradients = {
  brand: ['#8b5cf6', '#ec4899'] as const,
  card: ['#171a25', '#10121b'] as const,
  top: ['rgba(0,0,0,0.75)', 'rgba(0,0,0,0.34)', 'rgba(0,0,0,0)'] as const,
  bottom: ['rgba(0,0,0,0)', 'rgba(0,0,0,0.58)', 'rgba(0,0,0,0.92)'] as const,
};

export const typography = {
  title: { fontSize: 26, fontWeight: '800' as const, letterSpacing: -0.4 },
  h2: { fontSize: 20, fontWeight: '800' as const, letterSpacing: -0.2 },
  h3: { fontSize: 16, fontWeight: '700' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  small: { fontSize: 13, fontWeight: '500' as const },
  tiny: { fontSize: 11, fontWeight: '600' as const },
};
