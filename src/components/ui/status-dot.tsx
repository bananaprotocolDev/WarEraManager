import { cn } from "@/lib/ui/cn";
import type { StatusColor } from "@/lib/ui/company-status";

const COLOR: Record<StatusColor, string> = {
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
};

/** Punto de estado de color. Acompañar siempre con texto (no color solo). */
export function StatusDot({ color, label }: { color: StatusColor; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn("h-2.5 w-2.5 rounded-full", COLOR[color])} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}
