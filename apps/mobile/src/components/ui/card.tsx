import { StyleSheet, View, type ViewProps } from 'react-native';

import { cx } from './cx';
import { cardShadowStyle, nativeTheme } from '../../theme/native-theme';

export interface CardProps extends ViewProps {
  className?: string;
}

export function Card({ className, style, ...props }: CardProps) {
  return (
    <View
      className={cx('gap-4', className)}
      style={[styles.card, cardShadowStyle, style]}
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: nativeTheme.colors.card,
    borderColor: nativeTheme.colors.border,
    borderRadius: nativeTheme.radii.xl,
    borderWidth: 1,
    padding: nativeTheme.spacing[5],
  },
});
