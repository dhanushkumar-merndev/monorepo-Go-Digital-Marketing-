import { ScrollView, StyleSheet, type ScrollViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { cx } from './cx';
import { nativeTheme } from '../../theme/native-theme';

export interface ScreenProps extends ScrollViewProps {
  className?: string;
}

export function Screen({ children, className, contentContainerStyle, ...props }: ScreenProps) {
  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <ScrollView
        automaticallyAdjustKeyboardInsets
        className={cx('flex-1', className)}
        contentContainerStyle={[styles.content, contentContainerStyle]}
        keyboardShouldPersistTaps="handled"
        {...props}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: nativeTheme.spacing[5],
    padding: nativeTheme.spacing[4],
    paddingBottom: nativeTheme.spacing[8],
  },
  safeArea: {
    backgroundColor: nativeTheme.colors.background,
    flex: 1,
  },
});
