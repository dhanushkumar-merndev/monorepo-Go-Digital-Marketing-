import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '#lib/utils';

const alertVariants = cva(
  'relative grid w-full gap-1 rounded-lg border px-4 py-3 text-left text-sm has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-3 [&>svg]:row-span-2 [&>svg]:mt-0.5 [&>svg]:size-4',
  {
    variants: {
      variant: {
        default: 'border-border bg-card text-card-foreground',
        destructive:
          'border-[var(--status-danger-border)] bg-[var(--status-danger-background)] text-[var(--status-danger-foreground)]',
        info: 'border-[var(--status-info-border)] bg-[var(--status-info-background)] text-[var(--status-info-foreground)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function Alert({
  className,
  variant = 'default',
  ...props
}: ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return (
    <div
      className={cn(alertVariants({ className, variant }))}
      data-slot="alert"
      role="alert"
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('font-semibold', className)} data-slot="alert-title" {...props} />;
}

function AlertDescription({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('text-sm leading-6 opacity-90', className)}
      data-slot="alert-description"
      {...props}
    />
  );
}

export { Alert, AlertDescription, AlertTitle, alertVariants };
