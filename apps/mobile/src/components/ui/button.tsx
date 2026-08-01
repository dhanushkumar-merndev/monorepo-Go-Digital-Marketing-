import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  type PressableProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { AppText } from './app-text';
import { cx } from './cx';
import { nativeTheme } from '../../theme/native-theme';

export type ButtonVariant = 'danger' | 'ghost' | 'primary' | 'secondary';

export interface ButtonProps extends Omit<PressableProps, 'children'> {
  className?: string;
  label: string;
  loading?: boolean;
  variant?: ButtonVariant;
}

const variants: Record<ButtonVariant, { container: ViewStyle; label: TextStyle }> = {
  danger: {
    container: {
      backgroundColor: nativeTheme.colors.destructive,
      borderColor: nativeTheme.colors.destructive,
    },
    label: { color: nativeTheme.colors.destructiveForeground },
  },
  ghost: {
    container: { backgroundColor: 'transparent', borderColor: 'transparent' },
    label: { color: nativeTheme.colors.primary },
  },
  primary: {
    container: {
      backgroundColor: nativeTheme.colors.primary,
      borderColor: nativeTheme.colors.primary,
    },
    label: { color: nativeTheme.colors.primaryForeground },
  },
  secondary: {
    container: {
      backgroundColor: nativeTheme.colors.secondary,
      borderColor: nativeTheme.colors.border,
    },
    label: { color: nativeTheme.colors.secondaryForeground },
  },
};

export function Button({
  accessibilityLabel,
  accessibilityRole = 'button',
  accessibilityState,
  className,
  disabled = false,
  label,
  loading = false,
  style,
  variant = 'primary',
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const variantStyle = variants[variant];

  return (
    <Pressable
      {...props}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole={accessibilityRole}
      accessibilityState={{ ...accessibilityState, busy: loading, disabled: isDisabled }}
      className={cx('flex-row items-center justify-center gap-2', className)}
      disabled={isDisabled}
      style={(state) => [
        styles.container,
        variantStyle.container,
        state.pressed && styles.pressed,
        isDisabled && styles.disabled,
        typeof style === 'function' ? style(state) : style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          accessibilityLabel="Working"
          color={variantStyle.label.color}
          size="small"
        />
      ) : null}
      <AppText style={variantStyle.label} variant="label">
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: nativeTheme.radii.lg,
    borderWidth: 1,
    minHeight: nativeTheme.spacing[12],
    paddingHorizontal: nativeTheme.spacing[4],
    paddingVertical: nativeTheme.spacing[3],
  },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.78 },
});
