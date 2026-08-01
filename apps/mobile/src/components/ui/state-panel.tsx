import { ActivityIndicator, StyleSheet, View, type ViewProps } from 'react-native';

import { AppText } from './app-text';
import { Button } from './button';
import { cx } from './cx';
import { Skeleton } from './skeleton';
import { nativeTheme, type SemanticStatus } from '../../theme/native-theme';

export type SurfaceState = 'empty' | 'error' | 'loading' | 'offline' | 'success';

export interface StatePanelProps extends ViewProps {
  actionLabel?: string;
  className?: string;
  description?: string;
  onAction?: () => void;
  state: SurfaceState;
  title?: string;
}

const copy: Record<SurfaceState, { description: string; title: string; tone: SemanticStatus }> = {
  empty: {
    description: 'There is no preview content to show.',
    title: 'Nothing here yet',
    tone: 'neutral',
  },
  error: {
    description: 'The preview could not be loaded. Try again.',
    title: 'Something went wrong',
    tone: 'danger',
  },
  loading: {
    description: 'Preparing the local mobile foundation.',
    title: 'Loading',
    tone: 'info',
  },
  offline: {
    description: 'Cached content remains available. New work will wait for a connection.',
    title: 'You are offline',
    tone: 'warning',
  },
  success: {
    description: 'The client-side foundation is available.',
    title: 'Ready',
    tone: 'success',
  },
};

export function StatePanel({
  actionLabel,
  className,
  description,
  onAction,
  state,
  style,
  title,
  ...props
}: StatePanelProps) {
  const stateCopy = copy[state];
  const palette = nativeTheme.statuses[stateCopy.tone];

  return (
    <View
      accessibilityLiveRegion={state === 'error' ? 'assertive' : 'polite'}
      accessibilityRole={state === 'error' ? 'alert' : 'summary'}
      className={cx('items-center gap-3', className)}
      style={[
        styles.container,
        { backgroundColor: palette.background, borderColor: palette.border },
        style,
      ]}
      {...props}
    >
      {state === 'loading' ? (
        <View className="w-full gap-3">
          <ActivityIndicator
            accessibilityLabel="Loading preview"
            color={palette.foreground}
            size="small"
          />
          <Skeleton />
          <Skeleton style={{ width: '72%' }} />
          <Skeleton style={{ width: '48%' }} />
        </View>
      ) : null}
      <AppText className="text-center" style={{ color: palette.foreground }} variant="heading">
        {title ?? stateCopy.title}
      </AppText>
      <AppText className="text-center" style={{ color: palette.foreground }} variant="body">
        {description ?? stateCopy.description}
      </AppText>
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} variant="secondary" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: nativeTheme.radii.xl,
    borderWidth: 1,
    minHeight: 180,
    padding: nativeTheme.spacing[5],
  },
});
