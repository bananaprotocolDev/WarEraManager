"use client";
import { useState } from "react";
import { Package } from "lucide-react";
import { cn } from "@/lib/ui/cn";

/** URL pública de la imagen de un item del juego. */
export function itemImageUrl(code: string): string {
  return `https://app.warera.io/images/items/${code}.png`;
}

/** Imagen real del producto, con fallback a un ícono si no existe. */
export function ItemImage({ code, size = 40, className }: { code: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span
        className={cn("inline-flex items-center justify-center rounded-md bg-surface-2 text-muted-foreground", className)}
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <Package style={{ width: size * 0.55, height: size * 0.55 }} />
      </span>
    );
  }
  return (
    <img
      src={itemImageUrl(code)}
      alt={code}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn("rounded-md object-contain", className)}
    />
  );
}
