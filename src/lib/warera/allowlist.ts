/**
 * Allow-list de procedimientos tRPC read-only que el proxy puede reenviar.
 * Cualquier proc fuera de esta lista se rechaza (defensa en profundidad).
 */
export const ALLOWED_PROCS: ReadonlySet<string> = new Set([
  "itemTrading.getPrices",
  "gameConfig.getGameConfig",
  "company.getCompanies",
  "company.getById",
  "country.getCountryById",
  "country.getAllCountries",
  "user.getUserLite",
  "user.getUsersByCountry",
  "worker.getWorkers",
  "workOffer.getWorkOfferByCompanyId",
  "workOffer.getWorkOffersPaginated",
  "upgrade.getUpgradeByTypeAndEntity",
  "transaction.getPaginatedTransactions",
]);

/** Datos globales (no dependen del usuario) → cacheables en el servidor. */
const CACHEABLE_PROCS: ReadonlySet<string> = new Set([
  "itemTrading.getPrices",
  "gameConfig.getGameConfig",
  "country.getAllCountries",
]);

export function isAllowedProc(proc: string): boolean {
  return ALLOWED_PROCS.has(proc);
}

export function isCacheableProc(proc: string): boolean {
  return CACHEABLE_PROCS.has(proc);
}
