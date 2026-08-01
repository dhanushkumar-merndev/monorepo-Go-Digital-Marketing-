import { colors, radii, shadows, spacing, statuses, typography } from '@gdm/design-tokens';
import type { Config } from 'tailwindcss';

const pxScale = (scale: Readonly<Record<string, number>>) =>
  Object.fromEntries(Object.entries(scale).map(([name, value]) => [name, `${value}px`]));

const stringScale = (scale: Readonly<Record<string, number>>) =>
  Object.fromEntries(Object.entries(scale).map(([name, value]) => [name, `${value}`]));

const config = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  // NativeWind publishes its Tailwind preset as CommonJS.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      borderRadius: pxScale(radii),
      boxShadow: Object.fromEntries(
        Object.entries(shadows).map(([name, shadow]) => [name, shadow.web]),
      ),
      colors: {
        accent: colors.accent,
        background: colors.background,
        border: colors.border,
        card: colors.card,
        foreground: colors.foreground,
        input: colors.input,
        muted: colors.muted,
        primary: colors.primary,
        ring: colors.ring,
        secondary: colors.secondary,
        status: statuses,
      },
      fontFamily: Object.fromEntries(
        Object.entries(typography.fontFamily).map(([name, value]) => [name, [value]]),
      ),
      fontSize: pxScale(typography.fontSize),
      fontWeight: stringScale(typography.fontWeight),
      lineHeight: stringScale(typography.lineHeight),
      spacing: pxScale(spacing),
    },
  },
  plugins: [],
} satisfies Config;

export default config;
