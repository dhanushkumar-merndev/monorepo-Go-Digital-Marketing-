import type { ComponentProps } from 'react';

import { cn } from '#lib/utils';

function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden="true"
      className={cn('bg-muted animate-pulse rounded-md', className)}
      data-slot="skeleton"
      {...props}
    />
  );
}

export { Skeleton };
