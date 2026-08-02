import type { ComponentProps } from 'react';

import { cn } from '#lib/utils';

function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'border-input bg-background text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/25 aria-invalid:border-destructive aria-invalid:ring-destructive/20 flex min-h-24 w-full resize-y rounded-md border px-3 py-2 text-sm shadow-[var(--shadow-xs)] transition-[border-color,box-shadow] outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3',
        className,
      )}
      data-slot="textarea"
      {...props}
    />
  );
}

export { Textarea };
