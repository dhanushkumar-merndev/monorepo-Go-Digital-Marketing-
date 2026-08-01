import type { SemanticStatus } from '@gdm/design-tokens';
import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '#lib/utils';

const statusToneClasses = {
  danger:
    'border-[var(--status-danger-border)] bg-[var(--status-danger-background)] text-[var(--status-danger-foreground)]',
  info: 'border-[var(--status-info-border)] bg-[var(--status-info-background)] text-[var(--status-info-foreground)]',
  neutral:
    'border-[var(--status-neutral-border)] bg-[var(--status-neutral-background)] text-[var(--status-neutral-foreground)]',
  success:
    'border-[var(--status-success-border)] bg-[var(--status-success-background)] text-[var(--status-success-foreground)]',
  warning:
    'border-[var(--status-warning-border)] bg-[var(--status-warning-background)] text-[var(--status-warning-foreground)]',
} satisfies Record<SemanticStatus, string>;

const statusBadgeVariants = cva(
  'inline-flex min-h-6 w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
  {
    variants: {
      tone: {
        ...statusToneClasses,
      },
    },
    defaultVariants: {
      tone: 'neutral',
    },
  },
);

function StatusBadge({
  className,
  tone = 'neutral',
  ...props
}: ComponentProps<'span'> & VariantProps<typeof statusBadgeVariants>) {
  return (
    <span
      className={cn(statusBadgeVariants({ className, tone }))}
      data-slot="status-badge"
      {...props}
    />
  );
}

export { StatusBadge, statusBadgeVariants };
