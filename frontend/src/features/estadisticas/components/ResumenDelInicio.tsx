import { Aviso } from '../../../components/Aviso';
import { Boton } from '../../../components/Boton';
import { EnlaceBoton } from '../../../components/EnlaceBoton';
import { usePanel } from '../hooks/usePanel';
import { describirPeriodo, FILTRO_INICIAL } from '../periodo';
import { Indicadores } from './Indicadores';

/**
 * Los cuatro números del tablero, en el Inicio del ADMIN que no atiende — SPEC-KRILINXI-035. Son
 * los mismos de la pantalla de Estadísticas (`usePanel` e `Indicadores`, SPEC-KRILINXI-026), con el
 * filtro de siempre: lo cobrado hoy, lo pendiente, lo recibido en los últimos 30 días. Se piden a la
 * API (CLAUDE.md §8): sin internet lo dice, en vez de mostrar números que no son.
 */
export function ResumenDelInicio() {
  const { estado, recargar } = usePanel(FILTRO_INICIAL);

  return (
    <section aria-label="Cómo va el negocio" className="mt-8">
      <h2 className="text-2xl font-bold text-texto">Cómo va el negocio</h2>
      {estado.tipo === 'cargando' && <p className="mt-4 text-xl text-texto-suave">Buscando los números…</p>}
      {estado.tipo === 'sin-conexion' && (
        <div className="mt-4">
          <Aviso tipo="advertencia">Las estadísticas necesitan conexión. Cuando vuelva internet se cargan solas.</Aviso>
        </div>
      )}
      {estado.tipo === 'error' && (
        <div className="mt-4 grid justify-items-start gap-3">
          <Aviso tipo="error">{estado.mensaje}</Aviso>
          <div className="w-auto">
            <Boton variante="secundario" onClick={recargar}>
              Probar de nuevo
            </Boton>
          </div>
        </div>
      )}
      {estado.tipo === 'listo' && (
        <>
          <Indicadores
            panel={estado.datos}
            periodos={{
              ingresos: describirPeriodo(FILTRO_INICIAL, 'ingresos'),
              pendientes: describirPeriodo(FILTRO_INICIAL, 'pendientes'),
              historia: describirPeriodo(FILTRO_INICIAL, 'historia'),
            }}
          />
          <div className="mt-4">
            <EnlaceBoton a="/estadisticas" variante="secundario" icono="estadisticas">
              Ver las estadísticas
            </EnlaceBoton>
          </div>
        </>
      )}
    </section>
  );
}
