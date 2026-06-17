import * as React from "react";
import { cn } from "@/lib/ui/cn";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-surface p-6 shadow-md transition-all duration-200",
        className,
      )}
      {...props}
    />
  );
}
