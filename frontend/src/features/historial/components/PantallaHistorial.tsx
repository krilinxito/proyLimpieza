import { useState, type ReactNode } from 'react';
import { Aviso } from '../../../components/Aviso';
import { Boton } from '../../../components/Boton';
import { Paginas } from '../../../components/Paginas';
import { fechaParaLeer } from '../../estadisticas/periodo';
import { useSucursales } from '../../sucursales/hooks/useSucursales';
import { FILTRO_INICIAL, hayFiltros, type FiltroHistorial } from '../filtro';
import { useHistorialCompleto, useHistorialDeLaSucursal, useModoDelHistorial } from '../hooks/useHistorial';
import type { BoletaListada } from '../types';
import { DetalleDeSoloLectura } from './DetalleDeSoloLectura';
import { FilaDeBoleta } from './FilaDeBoleta';
import { FiltroDelHistorial } from './FiltroDelHistorial';

type Pantalla = { filtro: FiltroHistorial; alCambiar: (filtro: FiltroHistorial) => void; alLimpiar: () => void };

/** La lista de boletas, o qué decir si no hay ninguna (y cómo salir de ahí). */
function Lista({
  titulo,
  boletas,
  vacia,
  filtro,
  alLimpiar,
  destino,
}: {
  titulo: string;
  boletas: BoletaListada[];
  vacia: string;
  filtro: FiltroHistorial;
  alLimpiar: () => void;
  destino: (boleta: BoletaListada) => Parameters<typeof FilaDeBoleta>[0]['destino'];
}) {
  return (
    <section aria-label="Las boletas" className="mt-8">
      <h2 className="text-2xl font-bold text-texto">{titulo}</h2>
      {boletas.length === 0 ? (
        <div className="mt-4">
          <p className="text-xl text-texto-suave">{hayFiltros(filtro) ? 'No hay ninguna boleta con esos filtros.' : vacia}</p>
          {hayFiltros(filtro) && (
            <div className="mt-4">
              <Boton variante="secundario" onClick={alLimpiar}>
                Limpiar filtros
              </Boton>
            </div>
          )}
        </div>
      ) : (
        <ul className="mt-4 grid gap-3">
          {boletas.map((boleta) => (
            <li key={boleta.id}>
              <FilaDeBoleta boleta={boleta} destino={destino(boleta)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** El título de la lista: las fechas elegidas ("Boletas del 01/10/2026 al 05/10/2026"), o `porDefecto`. */
function tituloDeLaLista(filtro: FiltroHistorial, porDefecto: string): string {
  if (!filtro.fechas) return porDefecto;
  const { desde, hasta } = filtro.fechas;
  return desde === hasta ? `Boletas del ${fechaParaLeer(desde)}` : `Boletas del ${fechaParaLeer(desde)} al ${fechaParaLeer(hasta)}`;
}

/**
 * Quien atiende: las boletas de su sucursal de trabajo, de la base local, también sin internet
 * (CLAUDE.md §6). Tocar una boleta la abre en el Mostrador, donde se puede cobrar o entregar.
 */
function DeLaSucursal({ filtro, alCambiar, alLimpiar }: Pantalla) {
  const { boletas, total, porPagina, pagina, irAPagina } = useHistorialDeLaSucursal(filtro);

  return (
    <>
      <FiltroDelHistorial filtro={filtro} alCambiar={alCambiar} alLimpiar={alLimpiar} />
      {boletas === null ? (
        <p className="mt-8 text-xl text-texto-suave">Buscando…</p>
      ) : (
        <>
          <Lista
            titulo={tituloDeLaLista(filtro, 'Boletas de los últimos 30 días')}
            boletas={boletas}
            vacia="No hay boletas en los últimos 30 días."
            filtro={filtro}
            alLimpiar={alLimpiar}
            destino={() => ({ tipo: 'mostrador' })}
          />
          <Paginas pagina={pagina} total={total} porPagina={porPagina} irAPagina={irAPagina} nombre="Páginas del historial" />
        </>
      )}
    </>
  );
}

/**
 * El ADMIN que no atiende: el historial completo de todas las sucursales, pedido a la API (no tiene
 * la ropa en la tablet, CLAUDE.md §7). Sin internet lo dice, y no muestra una lista vacía.
 */
function Completo({ filtro, alCambiar, alLimpiar }: Pantalla) {
  const { estado, recargar, pagina, irAPagina } = useHistorialCompleto(filtro);
  const sucursales = (useSucursales() ?? []).map((s) => ({ id: s.id, nombre: s.nombre }));
  const [abierta, setAbierta] = useState<BoletaListada | null>(null);

  if (abierta) return <DetalleDeSoloLectura boleta={abierta} alVolver={() => setAbierta(null)} />;

  let contenido: ReactNode = null;
  if (estado.tipo === 'cargando') contenido = <p className="mt-8 text-xl text-texto-suave">Buscando…</p>;
  else if (estado.tipo === 'sin-conexion' || estado.tipo === 'error') {
    contenido = (
      <div className="mt-8">
        <Aviso tipo={estado.tipo === 'sin-conexion' ? 'advertencia' : 'error'}>
          {estado.tipo === 'sin-conexion' ? (
            <>
              <p className="font-semibold">El historial completo necesita conexión.</p>
              <p className="mt-2">Cuando vuelva internet se carga solo. También podés probar de nuevo.</p>
            </>
          ) : (
            <p>{estado.mensaje}</p>
          )}
          <div className="mt-4">
            <Boton onClick={recargar}>Probar de nuevo</Boton>
          </div>
        </Aviso>
      </div>
    );
  } else {
    const { boletas, total, porPagina } = estado.datos;
    contenido = (
      <>
        <Lista
          titulo={tituloDeLaLista(filtro, 'Todas las boletas')}
          boletas={boletas}
          vacia="Todavía no hay boletas."
          filtro={filtro}
          alLimpiar={alLimpiar}
          destino={(boleta) => ({ tipo: 'detalle', alElegir: () => setAbierta(boleta) })}
        />
        <Paginas pagina={pagina} total={total} porPagina={porPagina} irAPagina={irAPagina} nombre="Páginas del historial" />
      </>
    );
  }

  return (
    <>
      <FiltroDelHistorial filtro={filtro} sucursales={sucursales} alCambiar={alCambiar} alLimpiar={alLimpiar} />
      {contenido}
    </>
  );
}

/**
 * Historial de boletas — SPEC-KRILINXI-041. Cada uno ve lo que le corresponde: quien atiende, su
 * sucursal de los últimos 30 días, de la base local; el admin que no atiende, todo el historial de
 * todas las sucursales, de la API.
 */
export function PantallaHistorial() {
  const modo = useModoDelHistorial();
  const [filtro, setFiltro] = useState<FiltroHistorial>(FILTRO_INICIAL);
  // Cambia al limpiar: vuelve a montar el filtro, así las fechas escritas también quedan en blanco.
  const [vuelta, setVuelta] = useState(0);
  const limpiar = () => {
    setFiltro(FILTRO_INICIAL);
    setVuelta((v) => v + 1);
  };

  const props = { filtro, alCambiar: setFiltro, alLimpiar: limpiar };
  return modo === 'sucursal' ? <DeLaSucursal key={vuelta} {...props} /> : <Completo key={vuelta} {...props} />;
}
