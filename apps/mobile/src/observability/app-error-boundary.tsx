import { Component, type ErrorInfo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { StatePanel } from '../components/ui';
import { nativeTheme } from '../theme/native-theme';
import { reportError } from './error-reporter';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  override state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    reportError(error, { feature: 'mobile-root', operation: info.componentStack ?? 'render' });
  }

  private readonly retry = (): void => {
    this.setState({ hasError: false });
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <StatePanel
            actionLabel="Try again"
            description="The app shell encountered an unexpected error. No queued work was discarded."
            onAction={this.retry}
            state="error"
            title="The app needs to recover"
          />
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'stretch',
    backgroundColor: nativeTheme.colors.background,
    flex: 1,
    justifyContent: 'center',
    padding: nativeTheme.spacing[4],
  },
});
