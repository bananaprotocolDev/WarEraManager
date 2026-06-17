/** Formatea un número con separador de miles y 2 decimales. */
export function formatMoney(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Beneficio por día con signo explícito. */
export function formatPerDay(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)} /día`;
}

/** Fracción 0..1 a porcentaje entero. */
export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}
