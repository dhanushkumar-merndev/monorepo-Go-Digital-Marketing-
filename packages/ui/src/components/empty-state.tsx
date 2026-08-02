import type { ComponentProps, ReactNode } from 'react';

import { cn } from '#lib/utils';

interface EmptyStateProps extends ComponentProps<'div'> {
  action?: ReactNode;
  description: string;
  icon?: ReactNode;
  title: string;
}

function EmptyState({ action, className, description, icon, title, ...props }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'border-border flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center',
        className,
      )}
      data-slot="empty-state"
      {...props}
    >
      {icon === undefined ? null : (
        <span className="bg-muted text-muted-foreground mb-4 grid size-11 place-items-center rounded-full">
          {icon}
        </span>
      )}
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="text-muted-foreground mt-2 max-w-md text-sm leading-6">{description}</p>
      {action === undefined ? null : <div className="mt-5">{action}</div>}
    </div>
  );
}

export { EmptyState };
