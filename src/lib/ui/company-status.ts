export type StatusLevel = "good" | "low" | "loss";
export type StatusColor = "success" | "warning" | "destructive";

export interface CompanyStatus {
  level: StatusLevel;
  color: StatusColor;
}

/** Clasifica una empresa por su beneficio neto/día. */
export function companyStatus(netPerDay: number): CompanyStatus {
  if (netPerDay < 0) return { level: "loss", color: "destructive" };
  if (netPerDay <= 5) return { level: "low", color: "warning" };
  return { level: "good", color: "success" };
}
