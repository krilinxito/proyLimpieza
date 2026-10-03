/**
 * El teléfono tal como se guarda: solo dígitos.
 *
 * Es **la misma regla** que el backend (`normalizarTelefono` en
 * `backend/src/utils/validacion.ts`), y tiene que seguir siéndolo. El servidor guarda el
 * teléfono así, y eso es lo que baja a la base local; si aquí se normalizara distinto,
 * "70 12-34 56" no encontraría a "70123456" y el mostrador daría de alta dos veces al mismo
 * cliente. `telefono.test.ts` repite los casos del backend para que no se separen.
 *
 * El prefijo de país no se quita: "+591 70123456" queda "59170123456", igual que en el
 * servidor. Tratarlo como el mismo número sería una regla nueva, y tendría que nacer en los
 * dos lados a la vez.
 */
export function normalizarTelefono(valor: string): string {
  return valor.replace(/\D/g, '');
}
