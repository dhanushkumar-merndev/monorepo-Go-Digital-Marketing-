import { StyleSheet, View, type ViewProps } from 'react-native';

import { AppText } from './app-text';
import { cx } from './cx';
import { nativeTheme, type SemanticStatus } from '../../theme/native-theme';

export interface AlertProps extends ViewProps {
  className?: string;
  description: string;
  title: string;
  tone?: SemanticStatus;
}

export function Alert({
  className,
  description,
  style,
  title,
  tone = 'info',
  ...props
}: AlertProps) {
  const palette = nativeTheme.statuses[tone];

  return (
    <View
      accessibilityLiveRegion={tone === 'danger' ? 'assertive' : 'polite'}
      accessibilityRole={tone === 'danger' ? 'alert' : 'summary'}
      className={cx('gap-1', className)}
      style={[
        styles.container,
        { backgroundColor: palette.background, borderColor: palette.border },
        style,
      ]}
      {...props}
    >
      <AppText style={{ color: palette.foreground }} variant="label">
        {title}
      </AppText>
      <AppText style={{ color: palette.foreground }} variant="caption">
        {description}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: nativeTheme.radii.lg,
    borderWidth: 1,
    padding: nativeTheme.spacing[4],
  },
});
