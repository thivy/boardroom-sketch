"use client";

import type { ComponentProps, ReactNode } from "react";
import {
  Combobox,
  ComboboxClear,
  ComboboxContent as Content,
  ComboboxEmpty as Empty,
  ComboboxInput as Input,
  ComboboxItem as Item,
  ComboboxItemIndicator,
  ComboboxList as List,
  ComboboxTrigger,
  type ListItem,
} from "@ui-sdk/react/combobox";
import { CheckIcon, ChevronsUpDownIcon, XIcon } from "lucide-react";
import { cn } from "@app/ui/lib/utils";
import { buttonVariants } from "./button";
import { InputGroup, InputGroupAddon } from "./input-group";

const iconButton = buttonVariants({ variant: "ghost", size: "icon-xs" });

function ComboboxInput({
  className,
  showClear = false,
  ...props
}: Omit<ComponentProps<typeof Input>, "className"> & { className?: string; showClear?: boolean }) {
  return (
    <InputGroup className={className}>
      <Input
        className="min-w-0 flex-1 bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50"
        {...props}
      />
      <InputGroupAddon align="inline-end">
        {showClear && (
          <ComboboxClear aria-label="Clear selection" className={iconButton}>
            <XIcon />
          </ComboboxClear>
        )}
        <ComboboxTrigger aria-label="Show options" className={iconButton}>
          <ChevronsUpDownIcon />
        </ComboboxTrigger>
      </InputGroupAddon>
    </InputGroup>
  );
}

function ComboboxContent({ className, sideOffset = 6, ...props }: ComponentProps<typeof Content>) {
  return (
    <Content
      sideOffset={sideOffset}
      className={cn(
        "relative z-50 w-(--anchor-width) min-w-36 origin-(--transform-origin) overflow-hidden rounded-xl bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 transition-[opacity,scale] data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 [--list-height:var(--available-height)]",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxList<T extends string | number>({
  className,
  items,
  ...props
}: Omit<ComponentProps<typeof List>, "children"> & { items: readonly ListItem<T>[] }) {
  return (
    <List
      className={cn("max-h-[min(18rem,var(--list-height))] overflow-auto p-1", className)}
      {...props}
    >
      {(state) => {
        const visible = new Set(
          state.items.flatMap((item) =>
            typeof item === "object" && "value" in item ? [item.value] : [],
          ),
        );
        return items
          .filter((item) => visible.has(item.value))
          .map((item) => (
            <ComboboxItem
              key={item.value}
              value={item.value}
              label={item.label}
              disabled={item.disabled}
            >
              {item.label}
            </ComboboxItem>
          ));
      }}
    </List>
  );
}

function ComboboxEmpty({ className, ...props }: ComponentProps<typeof Empty>) {
  return (
    <Empty
      className={cn("px-3 py-2 text-center text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function ComboboxItem<T extends string | number>({
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof Item<T>>, "children"> & { children?: ReactNode }) {
  return (
    <Item
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-lg py-1.5 pr-8 pl-2.5 text-sm outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-accent data-highlighted:text-accent-foreground",
        className,
      )}
      {...props}
    >
      <span className="truncate">{children}</span>
      <ComboboxItemIndicator className="absolute right-2.5">
        <CheckIcon className="size-4" />
      </ComboboxItemIndicator>
    </Item>
  );
}

export { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList };
