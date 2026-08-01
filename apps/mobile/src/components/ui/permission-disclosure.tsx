import { StyleSheet, View, type ViewProps } from 'react-native';

import { AppText } from './app-text';
import { Badge } from './badge';
import { Button } from './button';
import { cx } from './cx';
import { nativeTheme, type SemanticStatus } from '../../theme/native-theme';

export interface PermissionDisclosureProps extends ViewProps {
  actionLabel: string;
  bullets: string[];
  className?: string;
  description: string;
  disabled?: boolean;
  loading?: boolean;
  onRequest: () => void;
  statusLabel: string;
  statusTone?: SemanticStatus;
  title: string;
}

export function PermissionDisclosure({
  actionLabel,
  bullets,
  className,
  description,
  disabled = false,
  loading = false,
  onRequest,
  statusLabel,
  statusTone = 'neutral',
  style,
  title,
  ...props
}: PermissionDisclosureProps) {
  return (
    <View className={cx('gap-4', className)} style={[styles.container, style]} {...props}>
      <View className="flex-row items-start justify-between gap-3">
        <AppText className="flex-1" variant="heading">
          {title}
        </AppText>
        <Badge label={statusLabel} tone={statusTone} />
      </View>
      <AppText tone="muted">{description}</AppText>
      <View className="gap-2">
        {bullets.map((bullet) => (
          <View className="flex-row items-start gap-2" key={bullet}>
            <AppText accessibilityElementsHidden tone="muted">
              •
            </AppText>
            <AppText className="flex-1" tone="muted" variant="caption">
              {bullet}
            </AppText>
          </View>
        ))}
      </View>
      <Button
        disabled={disabled}
        label={actionLabel}
        loading={loading}
        onPress={onRequest}
        variant="secondary"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderColor: nativeTheme.colors.border,
    borderRadius: nativeTheme.radii.xl,
    borderWidth: 1,
    padding: nativeTheme.spacing[5],
  },
});
