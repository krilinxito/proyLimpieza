import { useState } from 'react';
import { Boton } from '../../../components/Boton';
import { usePanel } from '../hooks/usePanel';
import { useSucursales } from '../hooks/useSucursales';
import { describirPeriodo, FILTRO_INICIAL, type Filtro } from '../periodo';
import { FiltroPanel } from './FiltroPanel';
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
 */
export function PantallaEstadisticas() {
  const [filtro, setFiltro] = useState<Filtro>(FILTRO_INICIAL);
  const sucursales = useSucursales();
  const { estado, recargar } = usePanel(filtro);

  return (
    <>
      <FiltroPanel filtro={filtro} sucursales={sucursales} alCambiar={setFiltro} />

      {estado.tipo === 'cargando' && <p className="mt-8 text-xl text-slate-700">Buscando las estadísticas…</p>}

      {estado.tipo === 'sin-conexion' && (
        <div role="alert" className="mt-8 rounded-lg border-2 border-amber-600 bg-amber-50 p-4 text-xl text-amber-900">
          <p className="font-semibold">Las estadísticas necesitan conexión.</p>
          <p className="mt-2">Cuando vuelva internet se cargan solas. También podés probar de nuevo.</p>
          <div className="mt-4">
            <Boton onClick={recargar}>Probar de nuevo</Boton>
          </div>
        </div>
      )}

      {estado.tipo === 'error' && (
        <div role="alert" className="mt-8 rounded-lg bg-red-50 p-4 text-xl text-red-800">
          <p>{estado.mensaje}</p>
          <div className="mt-4">
            <Boton onClick={recargar}>Probar de nuevo</Boton>
          </div>
        </div>
      )}

      {estado.tipo === 'listo' && (
        <>
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
