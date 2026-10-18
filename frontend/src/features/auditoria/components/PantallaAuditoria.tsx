import { useState } from 'react';
import { Aviso } from '../../../components/Aviso';
import { Boton } from '../../../components/Boton';
import { Paginas } from '../../../components/Paginas';
import { useSucursales } from '../../sucursales/hooks/useSucursales';
import { useCuentas } from '../../usuarios/hooks/useCuentas';
import { fechaParaLeer } from '../../estadisticas/periodo';
import { FILTRO_INICIAL, type FiltroAuditoria as Filtro } from '../filtro';
import { useAuditoria, useNombresConocidos } from '../hooks/useAuditoria';
import { FiltroAuditoria } from './FiltroAuditoria';
import { TarjetaRegistro } from './TarjetaRegistro';

/**
 * "¿Quién hizo qué?" — SPEC-KRILINXI-018. La auditoría se lee de la API (no baja a ninguna
 * tablet, CLAUDE.md §7): sin internet lo dice, en vez de mostrar una lista vacía.
 */
export function PantallaAuditoria() {
  const [filtro, setFiltro] = useState<Filtro>(FILTRO_INICIAL);
  const { estado, recargar, pagina, irAPagina } = useAuditoria(filtro);
  const nombres = useNombresConocidos(estado);
  const personas = (useCuentas() ?? []).map((c) => ({ id: c.id, nombre: c.nombreCompleto }));
  const sucursales = (useSucursales() ?? []).map((s) => ({ id: s.id, nombre: s.nombre }));

  return (
    <>
      <FiltroAuditoria filtro={filtro} personas={personas} sucursales={sucursales} alCambiar={setFiltro} />

      {estado.tipo === 'cargando' && <p className="mt-8 text-xl text-texto-suave">Buscando…</p>}

      {(estado.tipo === 'sin-conexion' || estado.tipo === 'error') && (
        <div className="mt-8">
          <Aviso tipo={estado.tipo === 'sin-conexion' ? 'advertencia' : 'error'}>
            {estado.tipo === 'sin-conexion' ? (
              <>
                <p className="font-semibold">Esta consulta necesita conexión.</p>
                <p className="mt-2">Cuando vuelva internet se carga sola. También podés probar de nuevo.</p>
              </>
            ) : (
              <p>{estado.mensaje}</p>
            )}
            <div className="mt-4">
              <Boton onClick={recargar}>Probar de nuevo</Boton>
            </div>
          </Aviso>
        </div>
      )}

      {estado.tipo === 'listo' && (
        <section aria-label="Lo que se hizo" className="mt-8">
          <h2 className="text-2xl font-bold text-texto">
            Del {fechaParaLeer(estado.datos.desde)} al {fechaParaLeer(estado.datos.hasta)}
          </h2>
          {estado.datos.registros.length === 0 ? (
            <p className="mt-4 text-xl text-texto-suave">
              {filtro.soloParaRevisar
                ? 'No hay nada para revisar en este período.'
                : 'No hay nada registrado en este período.'}
            </p>
          ) : (
            <>
              <ul className="mt-4 grid gap-3">
                {estado.datos.registros.map((r) => (
                  <TarjetaRegistro key={r.id} registro={r} nombres={nombres} />
                ))}
              </ul>
              <Paginas
                pagina={pagina}
                total={estado.datos.total}
                porPagina={estado.datos.porPagina}
                irAPagina={irAPagina}
                nombre="Páginas de quién hizo qué"
              />
            </>
          )}
        </section>
      )}
    </>
  );
}
