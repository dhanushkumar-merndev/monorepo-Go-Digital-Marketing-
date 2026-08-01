import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '#lib/utils';

const badgeVariants = cva(
  'inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        destructive: 'border-transparent bg-destructive/10 text-destructive',
        outline: 'border-border bg-transparent text-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function Badge({
  className,
  variant = 'default',
  ...props
}: ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return (
    <span className={cn(badgeVariants({ className, variant }))} data-slot="badge" {...props} />
  );
}

export { Badge, badgeVariants };
