/**
 * Si la persona acaba de iniciar sesión, el dashboard la recibe con «Bienvenido»; si cambió de página y volvió, con «Tu
 * estado». Es un aviso de un solo uso que se deja al ingresar y que el dashboard usa y borra.
 */
let pending = false;

export function markJustLoggedIn(): void {
  pending = true;
}

export function justLoggedIn(): boolean {
  return pending;
}

export function clearWelcome(): void {
  pending = false;
}
