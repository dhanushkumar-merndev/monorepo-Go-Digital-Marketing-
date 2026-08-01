import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { AppText } from './app-text';
import { cx } from './cx';
import { nativeTheme } from '../../theme/native-theme';

export interface TextFieldProps extends TextInputProps {
  className?: string;
  description?: string;
  error?: string;
  label: string;
}

export function TextField({
  accessibilityLabel,
  className,
  description,
  editable = true,
  error,
  label,
  style,
  ...props
}: TextFieldProps) {
  return (
    <View className={cx('gap-2', className)}>
      <AppText variant="label">{label}</AppText>
      <TextInput
        {...props}
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ disabled: !editable }}
        editable={editable}
        placeholderTextColor={nativeTheme.colors.mutedForeground}
        selectionColor={nativeTheme.colors.ring}
        style={[
          styles.input,
          error ? styles.error : undefined,
          !editable ? styles.disabled : undefined,
          style,
        ]}
      />
      {error ? (
        <AppText accessibilityLiveRegion="polite" tone="danger" variant="caption">
          {error}
        </AppText>
      ) : description ? (
        <AppText tone="muted" variant="caption">
          {description}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  disabled: { opacity: 0.5 },
  error: { borderColor: nativeTheme.statuses.danger.border },
  input: {
    backgroundColor: nativeTheme.colors.card,
    borderColor: nativeTheme.colors.input,
    borderRadius: nativeTheme.radii.lg,
    borderWidth: 1,
    color: nativeTheme.colors.foreground,
    fontSize: nativeTheme.typography.fontSize.md,
    minHeight: nativeTheme.spacing[12],
    paddingHorizontal: nativeTheme.spacing[4],
    paddingVertical: nativeTheme.spacing[3],
  },
});
