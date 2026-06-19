import { cn } from "@/lib/ui/cn";

const RARITY: Record<string, { cls: string; label: string }> = {
  common: { cls: "bg-surface-2 text-muted-foreground", label: "común" },
  uncommon: { cls: "bg-success/15 text-success", label: "poco común" },
  rare: { cls: "bg-primary/15 text-primary", label: "raro" },
  epic: { cls: "bg-accent/15 text-accent", label: "épico" },
  legendary: { cls: "bg-accent/15 text-accent", label: "legendario" },
};

/** Badge de rareza del item (color + texto). */
export function RarityBadge({ rarity }: { rarity: string }) {
  const cfg = RARITY[rarity] ?? RARITY.common;
  return (
    <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium capitalize", cfg.cls)}>
      {cfg.label}
    </span>
  );
}
