/** Un trabajador está sobrepagado si su salario supera el valor marginal máximo. */
export function isOverpaid(wage: number, maxWage: number): boolean {
  return wage > maxWage;
}
