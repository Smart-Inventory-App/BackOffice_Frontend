const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const DIGITS = "23456789";
const ALL = UPPER + LOWER + DIGITS;

function randomIndex(max: number): number {
  const buffer = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buffer);
  return buffer[0] % max;
}

/**
 * Una contraseña inicial para pasarle a quien va a ser administrador: 12 caracteres con una mayúscula, una minúscula y un
 * número (las reglas de las cuentas), sin los que se confunden al leerlos (0, O, 1, l, I).
 */
export function generatePassword(length = 12): string {
  const pick = (set: string) => set[randomIndex(set.length)];
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS)];
  while (chars.length < length) chars.push(pick(ALL));
  // Se mezclan para que las tres obligatorias no queden siempre al principio
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
