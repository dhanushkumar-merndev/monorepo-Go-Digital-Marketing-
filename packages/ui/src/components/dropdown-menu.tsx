'use client';

import { Menu as MenuPrimitive } from '@base-ui/react/menu';

import { cn } from '#lib/utils';

const DropdownMenu = MenuPrimitive.Root;

function DropdownMenuTrigger({ className, ...props }: MenuPrimitive.Trigger.Props) {
  return (
    <MenuPrimitive.Trigger
      className={cn('focus-visible:ring-ring outline-none focus-visible:ring-2', className)}
      data-slot="dropdown-menu-trigger"
      {...props}
    />
  );
}

function DropdownMenuContent({ className, ...props }: MenuPrimitive.Popup.Props) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner className="z-[60] outline-none" sideOffset={8}>
        <MenuPrimitive.Popup
          className={cn(
            'border-border bg-popover text-popover-foreground min-w-48 origin-[var(--transform-origin)] rounded-md border p-1 shadow-[var(--shadow-md)] transition-[transform,opacity] duration-100 outline-none data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0',
            className,
          )}
          data-slot="dropdown-menu-content"
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

function DropdownMenuItem({ className, ...props }: MenuPrimitive.Item.Props) {
  return (
    <MenuPrimitive.Item
      className={cn(
        'data-highlighted:bg-muted data-highlighted:text-foreground flex min-h-9 cursor-default items-center gap-2 rounded-sm px-2.5 py-2 text-sm outline-none data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
        className,
      )}
      data-slot="dropdown-menu-item"
      {...props}
    />
  );
}

function DropdownMenuSeparator({ className, ...props }: MenuPrimitive.Separator.Props) {
  return (
    <MenuPrimitive.Separator
      className={cn('bg-border -mx-1 my-1 h-px', className)}
      data-slot="dropdown-menu-separator"
      {...props}
    />
  );
}

function DropdownMenuGroupLabel({ className, ...props }: MenuPrimitive.GroupLabel.Props) {
  return (
    <MenuPrimitive.GroupLabel
      className={cn('text-muted-foreground px-2.5 py-1.5 text-xs font-medium', className)}
      data-slot="dropdown-menu-label"
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroupLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
};
