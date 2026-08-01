export const colors = {
  background: '#f8fafc',
  foreground: '#172033',
  card: '#ffffff',
  cardForeground: '#172033',
  popover: '#ffffff',
  popoverForeground: '#172033',
  primary: '#175cd3',
  primaryForeground: '#ffffff',
  secondary: '#e9eef7',
  secondaryForeground: '#24324a',
  muted: '#eef2f7',
  mutedForeground: '#526071',
  accent: '#fff1d6',
  accentForeground: '#7a3f00',
  destructive: '#c81e1e',
  destructiveForeground: '#ffffff',
  border: '#d7dee8',
  input: '#c4cedc',
  ring: '#175cd3',
} as const;

export const darkColors = {
  background: '#0b1220',
  foreground: '#e8edf5',
  card: '#111b2e',
  cardForeground: '#e8edf5',
  popover: '#111b2e',
  popoverForeground: '#e8edf5',
  primary: '#75a7ff',
  primaryForeground: '#071126',
  secondary: '#1d2a40',
  secondaryForeground: '#dfe7f3',
  muted: '#172237',
  mutedForeground: '#aab6c8',
  accent: '#4b3210',
  accentForeground: '#ffe1a6',
  destructive: '#ff7b7b',
  destructiveForeground: '#2b0808',
  border: '#2a3951',
  input: '#3a4a63',
  ring: '#75a7ff',
} as const;

export const typography = {
  fontFamily: {
    sans: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    mono: '"JetBrains Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace',
  },
  fontSize: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
    '4xl': 36,
  },
  fontWeight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  lineHeight: {
    tight: 1.2,
    snug: 1.35,
    normal: 1.5,
    relaxed: 1.65,
  },
} as const;

export const radii = {
  none: 0,
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 24,
  full: 9999,
} as const;

export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
  24: 96,
} as const;

export const shadows = {
  xs: {
    web: '0 1px 2px rgb(15 23 42 / 0.06)',
    native: { color: '#0f172a', opacity: 0.06, radius: 2, offsetY: 1, elevation: 1 },
  },
  sm: {
    web: '0 1px 3px rgb(15 23 42 / 0.10), 0 1px 2px rgb(15 23 42 / 0.06)',
    native: { color: '#0f172a', opacity: 0.1, radius: 3, offsetY: 1, elevation: 2 },
  },
  md: {
    web: '0 8px 20px rgb(15 23 42 / 0.10), 0 2px 6px rgb(15 23 42 / 0.06)',
    native: { color: '#0f172a', opacity: 0.12, radius: 10, offsetY: 5, elevation: 5 },
  },
  lg: {
    web: '0 18px 40px rgb(15 23 42 / 0.14), 0 4px 12px rgb(15 23 42 / 0.08)',
    native: { color: '#0f172a', opacity: 0.16, radius: 20, offsetY: 9, elevation: 9 },
  },
} as const;

export const statuses = {
  neutral: { background: '#eef2f7', foreground: '#374151', border: '#cbd5e1' },
  info: { background: '#e9f2ff', foreground: '#174ea6', border: '#9cc2ff' },
  success: { background: '#e7f8ef', foreground: '#12633a', border: '#85d8aa' },
  warning: { background: '#fff4da', foreground: '#7a4800', border: '#efc56b' },
  danger: { background: '#ffebeb', foreground: '#9b1c1c', border: '#f2a1a1' },
} as const;

export const motion = {
  duration: { instant: 0, fast: 120, normal: 200, slow: 320 },
  easing: { standard: 'cubic-bezier(0.2, 0, 0, 1)', emphasized: 'cubic-bezier(0.2, 0, 0, 1.2)' },
} as const;

export const designTokens = {
  colors,
  darkColors,
  typography,
  radii,
  spacing,
  shadows,
  statuses,
  motion,
} as const;

export type DesignTokens = typeof designTokens;
export type SemanticStatus = keyof typeof statuses;
