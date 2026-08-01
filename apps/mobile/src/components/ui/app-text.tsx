import { Text, type TextProps, type TextStyle } from 'react-native';

import { cx } from './cx';
import { nativeTheme, textStyles } from '../../theme/native-theme';

type TextVariant = keyof typeof textStyles;
type TextTone = 'danger' | 'foreground' | 'inverted' | 'muted' | 'success';

export interface AppTextProps extends TextProps {
  className?: string;
  tone?: TextTone;
  variant?: TextVariant;
}

const toneStyles: Record<TextTone, TextStyle> = {
  danger: { color: nativeTheme.statuses.danger.foreground },
  foreground: { color: nativeTheme.colors.foreground },
  inverted: { color: nativeTheme.colors.primaryForeground },
  muted: { color: nativeTheme.colors.mutedForeground },
  success: { color: nativeTheme.statuses.success.foreground },
};

export function AppText({
  className,
  style,
  tone = 'foreground',
  variant = 'body',
  ...props
}: AppTextProps) {
  return (
    <Text
      className={cx('shrink', className)}
      style={[textStyles[variant], toneStyles[tone], style]}
      {...props}
    />
  );
}
