import { Pressable, StyleSheet, View, type PressableProps } from 'react-native';

import { AppText } from './app-text';
import { cx } from './cx';
import { nativeTheme } from '../../theme/native-theme';

export interface ListRowProps extends Omit<PressableProps, 'children'> {
  className?: string;
  description?: string;
  title: string;
}

export function ListRow({
  className,
  description,
  disabled,
  style,
  title,
  ...props
}: ListRowProps) {
  const isDisabled = disabled ?? false;

  return (
    <Pressable
      {...props}
      accessibilityLabel={description ? `${title}. ${description}` : title}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      className={cx('flex-row items-center gap-3', className)}
      disabled={isDisabled}
      style={(state) => [
        styles.row,
        state.pressed && styles.pressed,
        isDisabled && styles.disabled,
        typeof style === 'function' ? style(state) : style,
      ]}
    >
      <View className="flex-1 gap-1">
        <AppText variant="label">{title}</AppText>
        {description ? (
          <AppText tone="muted" variant="caption">
            {description}
          </AppText>
        ) : null}
      </View>
      <AppText accessibilityElementsHidden tone="muted" variant="heading">
        ›
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  disabled: { opacity: 0.45 },
  pressed: { backgroundColor: nativeTheme.colors.muted },
  row: {
    borderBottomColor: nativeTheme.colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 56,
    paddingHorizontal: nativeTheme.spacing[4],
    paddingVertical: nativeTheme.spacing[3],
  },
});
