import { StyleSheet, View, type ViewProps } from 'react-native';

import { cx } from './cx';
import { nativeTheme } from '../../theme/native-theme';

export interface SkeletonProps extends ViewProps {
  className?: string;
}

export function Skeleton({ className, style, ...props }: SkeletonProps) {
  return (
    <View
      accessibilityElementsHidden
      className={cx('w-full', className)}
      importantForAccessibility="no-hide-descendants"
      style={[styles.skeleton, style]}
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: nativeTheme.colors.muted,
    borderRadius: nativeTheme.radii.md,
    height: nativeTheme.spacing[4],
  },
});
