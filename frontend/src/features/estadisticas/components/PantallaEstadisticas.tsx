import { useState } from 'react';
import { Aviso } from '../../../components/Aviso';
import { Boton } from '../../../components/Boton';
import { usePanel } from '../hooks/usePanel';
import { useSucursalesAbiertas } from '../../sucursales/hooks/useSucursales';
import { describirPeriodo, FILTRO_INICIAL, type Filtro } from '../periodo';
import { FiltroPanel } from './FiltroPanel';
import { Indicadores } from './Indicadores';
import { SeccionIngresos } from './SeccionIngresos';
import { SeccionClientes } from './SeccionClientes';
import { SeccionProductividad } from './SeccionProductividad';
import { SeccionSaldos } from './SeccionSaldos';
import { SeccionSinRecoger } from './SeccionSinRecoger';
import { SeccionVolumen } from './SeccionVolumen';

/**
 * El panel del admin — SPEC-KRILINXI-015: cuánto se cobró, cuánto falta cobrar y qué ropa
 * sigue sin recoger; y desde SPEC-KRILINXI-016, cuánta ropa entró por día, lo que hizo cada
 * persona y los clientes atendidos. Se lee de la API, no de la tablet (CLAUDE.md §8): sin internet lo dice,
 * en vez de mostrar números que no son.
 *
 * Desde SPEC-KRILINXI-026 es un tablero: arriba los indicadores, y cada sección con su gráfico y,
 * debajo, el detalle de siempre. Ni los indicadores ni los gráficos aparecen sin el panel listo.
 */
export function PantallaEstadisticas() {
  const [filtro, setFiltro] = useState<Filtro>(FILTRO_INICIAL);
  const sucursales = useSucursalesAbiertas();
  const { estado, recargar } = usePanel(filtro);

  return (
    <>
      <FiltroPanel filtro={filtro} sucursales={sucursales} alCambiar={setFiltro} />

      {estado.tipo === 'cargando' && <p className="mt-8 text-xl text-texto-suave">Buscando las estadísticas…</p>}

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
          <SeccionIngresos ingresos={estado.datos.ingresos} periodo={describirPeriodo(filtro, 'ingresos')} />
          <SeccionSaldos saldos={estado.datos.saldos} periodo={describirPeriodo(filtro, 'pendientes')} />
          <SeccionSinRecoger sinRecoger={estado.datos.sinRecoger} periodo={describirPeriodo(filtro, 'pendientes')} />
          <SeccionVolumen volumen={estado.datos.volumen} periodo={describirPeriodo(filtro, 'historia')} />
          <SeccionProductividad productividad={estado.datos.productividad} periodo={describirPeriodo(filtro, 'historia')} />
          {/* Solo con el panel listo: sin internet ya lo dice el aviso de arriba, una sola vez. */}
          <SeccionClientes filtro={filtro} periodo={describirPeriodo(filtro, 'historia')} />
        </>
      )}
    </>
  );
}
