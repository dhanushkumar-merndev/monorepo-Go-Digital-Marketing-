import {
  colors,
  radii,
  shadows,
  spacing,
  statuses,
  typography,
  type SemanticStatus,
} from '@gdm/design-tokens';
import type { TextStyle, ViewStyle } from 'react-native';

const cardShadow = shadows.sm.native;

export const nativeTheme = {
  colors,
  radii,
  spacing,
  statuses,
  typography,
} as const;

export const cardShadowStyle = {
  elevation: cardShadow.elevation,
  shadowColor: cardShadow.color,
  shadowOffset: { height: cardShadow.offsetY, width: 0 },
  shadowOpacity: cardShadow.opacity,
  shadowRadius: cardShadow.radius,
} satisfies ViewStyle;

export const textStyles = {
  body: {
    fontSize: typography.fontSize.md,
    fontWeight: `${typography.fontWeight.regular}`,
    lineHeight: typography.fontSize.md * typography.lineHeight.normal,
  },
  caption: {
    fontSize: typography.fontSize.sm,
    fontWeight: `${typography.fontWeight.regular}`,
    lineHeight: typography.fontSize.sm * typography.lineHeight.normal,
  },
  heading: {
    fontSize: typography.fontSize.xl,
    fontWeight: `${typography.fontWeight.semibold}`,
    lineHeight: typography.fontSize.xl * typography.lineHeight.snug,
  },
  label: {
    fontSize: typography.fontSize.md,
    fontWeight: `${typography.fontWeight.semibold}`,
    lineHeight: typography.fontSize.md * typography.lineHeight.snug,
  },
  title: {
    fontSize: typography.fontSize['3xl'],
    fontWeight: `${typography.fontWeight.bold}`,
    lineHeight: typography.fontSize['3xl'] * typography.lineHeight.tight,
  },
} satisfies Record<string, TextStyle>;

export type { SemanticStatus };
