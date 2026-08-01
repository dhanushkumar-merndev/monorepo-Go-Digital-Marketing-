import { StyleSheet, View, type ViewProps } from 'react-native';

import { AppText } from './app-text';
import { cx } from './cx';
import { nativeTheme, type SemanticStatus } from '../../theme/native-theme';

export interface BadgeProps extends ViewProps {
  className?: string;
  label: string;
  tone?: SemanticStatus;
}

export function Badge({ className, label, style, tone = 'neutral', ...props }: BadgeProps) {
  const palette = nativeTheme.statuses[tone];

  return (
    <View
      accessibilityLabel={`${label}, ${tone}`}
      className={cx('self-start', className)}
      style={[
        styles.container,
        {
          backgroundColor: palette.background,
          borderColor: palette.border,
        },
        style,
      ]}
      {...props}
    >
      <AppText style={{ color: palette.foreground }} variant="caption">
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: nativeTheme.radii.full,
    borderWidth: 1,
    paddingHorizontal: nativeTheme.spacing[3],
    paddingVertical: nativeTheme.spacing[1],
  },
});
