import { useId, useState } from 'react';
import { Aviso } from '../../../components/Aviso';
import { Boton } from '../../../components/Boton';
import { Tarjeta } from '../../../components/Tarjeta';
import { useSucursalesAbiertas } from '../../sucursales/hooks/useSucursales';
import { useAtencion } from '../hooks/useAtencion';

/**
 * "Atender en una sucursal", en el Inicio del ADMIN — SPEC-KRILINXI-029.
 *
 * Primero un botón, y al tocarlo las sucursales abiertas (de la base local, así funciona también
 * sin internet), todas a la vista como en `ElegirMetodo`, y "Empezar a atender". Al empezar, el
 * Inicio muestra las tareas del mostrador y la cabecera dice dónde se atiende.
 *
 * No aparece para un EMPLEADO, ni mientras el ADMIN ya está atendiendo: para cambiar de
 * sucursal, primero "Dejar de atender" (en la cabecera), así siempre se sabe dónde se está.
 */
export function AtenderEnUnaSucursal() {
  const atencion = useAtencion();
  const sucursales = useSucursalesAbiertas();
  const [eligiendo, setEligiendo] = useState(false);
  const [elegida, setElegida] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const grupo = useId();

  if (!atencion.puedeElegir || atencion.sucursalId) return null;

  function empezar() {
    if (!atencion.puedeElegir) return;
    // Una que se cerró mientras estaba en pantalla ya no está en la lista: no vale.
    if (!elegida || !sucursales.some((s) => s.id === elegida)) {
      setError('Elegí una sucursal de la lista.');
      return;
    }
    atencion.empezar(elegida);
  }

  return (
    <div className="mt-8">
      <Tarjeta titulo="Atender en una sucursal">
        {/* Sin texto de ayuda: el título y el botón ya dicen qué es (SPEC-KRILINXI-037). */}
        {!eligiendo ? (
          <div className="w-auto">
            <Boton icono="sucursales" onClick={() => setEligiendo(true)}>
              Atender en una sucursal
            </Boton>
          </div>
        ) : sucursales.length === 0 ? (
          <div className="mt-4">
            <Aviso tipo="informacion">Todavía no hay sucursales abiertas en esta tablet. Esperá unos segundos.</Aviso>
          </div>
        ) : (
          <>
            <fieldset className="mt-4" aria-describedby={error ? `${grupo}-error` : undefined}>
              <legend className="text-xl font-semibold text-texto">¿En qué sucursal vas a atender?</legend>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                {sucursales.map((s) => (
                  <label
                    key={s.id}
                    className={`flex min-h-14 items-center gap-3 rounded-lg border-2 px-4 text-xl ${
                      elegida === s.id ? 'border-marca bg-marca-suave font-semibold' : 'border-borde bg-superficie'
                    }`}
                  >
                    <input
                      type="radio"
                      name={grupo}
                      className="size-6"
                      checked={elegida === s.id}
                      onChange={() => {
                        setElegida(s.id);
                        setError(null);
                      }}
                    />
                    {s.nombre}
                  </label>
                ))}
              </div>
              {error && (
                <p id={`${grupo}-error`} className="mt-2 text-lg font-semibold text-peligro-texto">
                  {error}
                </p>
              )}
            </fieldset>
            <div className="mt-6 flex flex-wrap gap-4">
              <div className="w-auto">
                <Boton onClick={empezar}>Empezar a atender</Boton>
              </div>
              <div className="w-auto">
                <Boton
                  variante="secundario"
                  onClick={() => {
                    setEligiendo(false);
                    setElegida(null);
                    setError(null);
                  }}
                >
                  Cancelar
                </Boton>
              </div>
            </div>
          </>
        )}
      </Tarjeta>
    </div>
  );
}
