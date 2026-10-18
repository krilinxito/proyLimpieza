/**
 * Quién atiende, en la cabecera: un círculo con la inicial de su nombre — SPEC-KRILINXI-030.
 * Al pasar el mouse dice "Perfil"; para el lector de pantalla, "Perfil de Rosa Quispe".
 *
 * Por ahora no hace nada al tocarlo: el perfil es una spec propia. Por eso es un `<span>` y no
 * un botón (un botón que no hace nada es peor que ninguno); cuando exista el perfil, pasa a ser
 * el botón que lo abre.
 */
export function Avatar({ nombre }: { nombre: string }) {
  const inicial = nombre.trim().charAt(0).toLocaleUpperCase('es') || '?';
  return (
    <span
      role="img"
      aria-label={`Perfil de ${nombre}`}
      title="Perfil"
      className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-marca text-xl font-bold text-sobre-marca"
    >
      <span aria-hidden="true">{inicial}</span>
    </span>
  );
}
