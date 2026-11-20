"use client";

import type { ComponentProps, ReactNode } from "react";
import {
  Menu as DropdownMenu,
  MenuTrigger as DropdownMenuTrigger,
  MenuContent,
  MenuRadioGroup as DropdownMenuRadioGroup,
  MenuRadioItem,
  MenuItemIndicator,
} from "@ui-sdk/react/menu";
import { CheckIcon } from "lucide-react";
import { cn } from "@app/ui/lib/utils";

function DropdownMenuContent({
  className,
  align = "start",
  sideOffset = 4,
  ...props
}: ComponentProps<typeof MenuContent>) {
  return (
    <MenuContent
      align={align}
      sideOffset={sideOffset}
      className={cn(
        "pointer-events-auto z-50 max-h-(--available-height) min-w-32 origin-(--transform-origin) overflow-auto rounded-xl bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none transition-[opacity,scale] data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof MenuRadioItem>, "children"> & { children?: ReactNode }) {
  return (
    <MenuRadioItem
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-lg py-1.5 pr-8 pl-2.5 text-sm outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-accent data-highlighted:text-accent-foreground",
        className,
      )}
      {...props}
    >
      {children}
      <MenuItemIndicator className="absolute right-2.5">
        <CheckIcon className="size-4" />
      </MenuItemIndicator>
    </MenuRadioItem>
  );
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
};
