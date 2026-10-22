import { useState } from 'react';
import { Aviso } from '../../../components/Aviso';
import { Boton } from '../../../components/Boton';
import { usePanel } from '../hooks/usePanel';
import { useSucursalesAbiertas } from '../../sucursales/hooks/useSucursales';
import { describirPeriodo, FILTRO_INICIAL, type Filtro } from '../periodo';
import { conMayuscula } from './Detalle';
import { FiltroPanel } from './FiltroPanel';
import { Indicadores } from './Indicadores';
import { VerMas } from './VerMas';
import { SeccionFormasDePago } from './SeccionFormasDePago';
import { SeccionIngresos } from './SeccionIngresos';
import { SeccionClientes } from './SeccionClientes';
import { SeccionProductividad } from './SeccionProductividad';
import { SeccionSaldos } from './SeccionSaldos';
import { SeccionSinRecoger } from './SeccionSinRecoger';
import { SeccionTendencia } from './SeccionTendencia';
import { SeccionVolumen } from './SeccionVolumen';

/**
 * Mientras llega el panel, el tablero con sus huecos de siempre — SPEC-KRILINXI-050: cuatro indicadores y las tres
 * tarjetas a la vista, del alto que tendrán, así nada salta cuando llegan. Ningún número hasta que llegan de verdad.
 */
function EsqueletoDelTablero() {
  const hueco = 'rounded-2xl bg-borde-suave motion-safe:animate-pulse';
  return (
    <div role="status" className="mt-8">
      <p className="sr-only">Buscando las estadísticas…</p>
      <div aria-hidden="true">
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((n) => (
            <div key={n} className={`h-28 ${hueco}`} />
          ))}
        </div>
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className={`h-96 lg:col-span-2 ${hueco}`} />
          <div className={`h-80 ${hueco}`} />
          <div className={`h-80 ${hueco}`} />
        </div>
      </div>
    </div>
  );
}

/**
 * El panel del admin — SPEC-KRILINXI-015: cuánto se cobró, cuánto falta cobrar y qué ropa
 * sigue sin recoger; y desde SPEC-KRILINXI-016, cuánta ropa entró por día, lo que hizo cada
 * persona y los clientes atendidos. Se lee de la API, no de la tablet (CLAUDE.md §8): sin internet lo dice,
 * en vez de mostrar números que no son.
 *
 * Desde SPEC-KRILINXI-026 es un tablero: arriba los indicadores, y cada sección con su gráfico y,
 * debajo, el detalle de siempre. Ni los indicadores ni los gráficos aparecen sin el panel listo.
 *
 * Desde SPEC-KRILINXI-042 es un dashboard: debajo de los indicadores, una grilla de tarjetas (dos por
 * fila desde 1024px, una en pantalla angosta), cada una con un gráfico que responde una pregunta, y
 * el detalle en tablas plegado en "Ver el detalle". El filtro de arriba cambia todas a la vez.
 */
export function PantallaEstadisticas() {
  const [filtro, setFiltro] = useState<Filtro>(FILTRO_INICIAL);
  const [masAbierto, setMasAbierto] = useState(false);
  const sucursales = useSucursalesAbiertas();
  const { estado, recargar } = usePanel(filtro);

  return (
    <>
      <FiltroPanel filtro={filtro} sucursales={sucursales} alCambiar={setFiltro} />

      {estado.tipo === 'cargando' && <EsqueletoDelTablero />}

      {estado.tipo === 'sin-conexion' && (
        <div className="mt-8">
          <Aviso tipo="advertencia">
            <p className="font-semibold">Las estadísticas necesitan conexión.</p>
            <p className="mt-2">Cuando vuelva internet se cargan solas. También podés probar de nuevo.</p>
            <div className="mt-4">
              <Boton onClick={recargar}>Probar de nuevo</Boton>
            </div>
          </Aviso>
        </div>
      )}

      {estado.tipo === 'error' && (
        <div className="mt-8">
          <Aviso tipo="error">
            <p>{estado.mensaje}</p>
            <div className="mt-4">
              <Boton onClick={recargar}>Probar de nuevo</Boton>
            </div>
          </Aviso>
        </div>
      )}

      {estado.tipo === 'listo' && (
        <>
          <Indicadores
            panel={estado.datos}
            periodos={{
              ingresos: describirPeriodo(filtro, 'ingresos'),
              pendientes: describirPeriodo(filtro, 'pendientes'),
              historia: describirPeriodo(filtro, 'historia'),
            }}
          />
          {/* A la vista, tres tarjetas: la caja día a día, con qué se pagó y lo que falta cobrar (SPEC-KRILINXI-050). */}
          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Pide su propio dato (`useIngresosPorDia`): una tendencia son días, no el "hoy" de los indicadores. */}
            <SeccionTendencia filtro={filtro} periodo={conMayuscula(describirPeriodo(filtro, 'historia'))} />
            <SeccionFormasDePago ingresos={estado.datos.ingresos} periodo={conMayuscula(describirPeriodo(filtro, 'ingresos'))} />
            <SeccionSaldos saldos={estado.datos.saldos} periodo={conMayuscula(describirPeriodo(filtro, 'pendientes'))} />
          </div>
          {/* El resto se despliega a pedido; la productividad y los clientes no se piden hasta entonces. */}
          <VerMas abierto={masAbierto} alCambiar={setMasAbierto}>
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <SeccionIngresos ingresos={estado.datos.ingresos} periodo={conMayuscula(describirPeriodo(filtro, 'ingresos'))} />
              <SeccionVolumen volumen={estado.datos.volumen} periodo={conMayuscula(describirPeriodo(filtro, 'historia'))} />
              <SeccionSinRecoger sinRecoger={estado.datos.sinRecoger} periodo={conMayuscula(describirPeriodo(filtro, 'pendientes'))} />
              <SeccionProductividad filtro={filtro} periodo={conMayuscula(describirPeriodo(filtro, 'historia'))} />
              {/* Solo con el panel listo: sin internet ya lo dice el aviso de arriba, una sola vez. */}
              <SeccionClientes filtro={filtro} periodo={conMayuscula(describirPeriodo(filtro, 'historia'))} />
            </div>
          </VerMas>
        </>
      )}
    </>
  );
}
