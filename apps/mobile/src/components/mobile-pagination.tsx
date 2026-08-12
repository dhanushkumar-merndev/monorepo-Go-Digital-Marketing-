import type { PageMetadata } from '@gdm/contracts';
import { View } from 'react-native';

import { AppText, Button } from './ui';

export function MobilePagination({
  metadata,
  onPage,
}: {
  metadata: PageMetadata;
  onPage(page: number): void;
}) {
  return (
    <View
      accessibilityLabel={`Page ${String(metadata.page)}`}
      className="flex-row items-center justify-between gap-3"
    >
      <Button
        disabled={metadata.page <= 1}
        label="Previous"
        onPress={() => onPage(metadata.page - 1)}
        variant="secondary"
      />
      <AppText tone="muted" variant="caption">
        Page {metadata.page}
      </AppText>
      <Button
        disabled={!metadata.has_next}
        label="Next"
        onPress={() => onPage(metadata.page + 1)}
        variant="secondary"
      />
    </View>
  );
}
