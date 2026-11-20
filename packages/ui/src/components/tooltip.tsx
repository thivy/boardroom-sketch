"use client";

import type { ComponentProps, ReactNode } from "react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent as Content,
  TooltipArrow,
} from "@ui-sdk/react/tooltip";
import { cn } from "@app/ui/lib/utils";

function TooltipContent({
  className,
  side = "top",
  sideOffset = 4,
  children,
  ...props
}: Omit<ComponentProps<typeof Content>, "children"> & { children?: ReactNode }) {
  return (
    <Content
      side={side}
      sideOffset={sideOffset}
      className={cn(
        "relative z-50 w-max max-w-xs origin-(--transform-origin) rounded-xl bg-foreground px-3 py-1.5 text-xs text-background transition-[opacity,scale] data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0",
        className,
      )}
      {...props}
    >
      {children}
      <TooltipArrow className="size-2 rotate-45 rounded-xs bg-foreground" />
    </Content>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent };
