import { randomInt } from 'node:crypto';

// Alfabeto sin caracteres ambiguos (se excluyen 0/O, 1/l/I) para que la
// contraseña temporal sea legible al dictarla o transcribirla desde el
// comprobante impreso. Se separan mayúsculas, minúsculas y dígitos para
// poder garantizar variedad y cumplir políticas básicas de complejidad.
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const DIGITS = '23456789';
const ALL = UPPER + LOWER + DIGITS;

/** Devuelve un carácter aleatorio (uniforme) del alfabeto dado. */
function pick(alphabet: string): string {
  return alphabet[randomInt(alphabet.length)]!;
}

/**
 * Genera una contraseña temporal aleatoria y legible, en dos bloques
 * separados por guion (ej. `Kf7m-9QxP`). Longitud total 8 (sin contar el
 * guion) para cumplir `@MinLength(8)`. Garantiza al menos una mayúscula, una
 * minúscula y un dígito. Usa `crypto.randomInt` (CSPRNG nativo de Node).
 */
export function generateTempPassword(): string {
  // Semilla que asegura variedad de clases de caracteres.
  const seed = [pick(UPPER), pick(LOWER), pick(DIGITS)];
  // Completa hasta 8 caracteres con el alfabeto completo.
  while (seed.length < 8) seed.push(pick(ALL));
  // Barajado Fisher-Yates para no fijar la posición de las clases.
  for (let i = seed.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [seed[i], seed[j]] = [seed[j]!, seed[i]!];
  }
  // Inserta el guion a la mitad → dos bloques de 4 (ej. `Kf7m-9QxP`).
  return `${seed.slice(0, 4).join('')}-${seed.slice(4).join('')}`;
}

/**
 * Genera un código de matrícula cuando el instituto no provee uno propio.
 * Formato `E{cohortYear}-{4 dígitos}` (ej. `E2025-4821`). No garantiza
 * unicidad global: la constraint UNIQUE de la columna es la autoridad final;
 * el llamador debe reintentar ante colisión.
 */
export function generateStudentCode(cohortYear: number): string {
  const suffix = String(randomInt(10000)).padStart(4, '0');
  return `E${cohortYear}-${suffix}`;
}
