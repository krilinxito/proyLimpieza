import { useEffect, useState } from 'react';
import { Boton } from '../../../components/Boton';
import { BuscadorVivo } from '../../../components/BuscadorVivo';
import { Insignia } from '../../../components/Insignia';
import { TEXTO_ESTADO_ORDEN } from '../../../lib/dominio';
import { TONO_ESTADO } from '../../ordenes/estado';
import { TarjetaOrden } from '../../ordenes/components/TarjetaOrden';
import type { OrdenVista } from '../../ordenes/types';
import { useMostrador } from '../hooks/useMostrador';
import type { Encontrado } from '../types';
import { FichaCliente } from './FichaCliente';

/** Dónde está quien atiende: mirando la ropa en el local, o en la ficha de un cliente. */
type Vista = { tipo: 'inicio' } | { tipo: 'ficha'; clienteId: string; abierta: string | null };

/** Cómo se ve cada resultado del buscador: un cliente, o una boleta con su estado. */
function ResultadoEncontrado({ encontrado }: { encontrado: Encontrado }) {
  if (encontrado.tipo === 'cliente') {
    const { cliente } = encontrado;
    return (
      <span className="grid">
        <span className="font-semibold">{cliente.nombre}</span>
        <span className="text-lg text-texto-suave">
          Cliente · Tel. {cliente.telefono}
          {cliente.carnet && ` · Carnet ${cliente.carnet}`}
        </span>
      </span>
    );
  }
  const { orden } = encontrado;
  return (
    <span className="flex w-full flex-wrap items-center justify-between gap-2">
      <span className="grid">
        <span className="font-semibold">Boleta {orden.numeroBoleta}</span>
        <span className="text-lg text-texto-suave">{orden.clienteNombre}</span>
      </span>
      <Insignia tono={TONO_ESTADO[orden.estado]}>{TEXTO_ESTADO_ORDEN[orden.estado]}</Insignia>
    </span>
  );
}

/** La ropa en el local de la sucursal: lo que se ve cuando no se busca nada (como Ropa en el local). */
function RopaEnElLocal({ alElegir }: { alElegir: (orden: OrdenVista) => void }) {
  const mostrador = useMostrador();
  const [ordenes, setOrdenes] = useState<OrdenVista[] | null>(null);

  useEffect(() => {
    if (!mostrador.lista) return;
    let vigente = true;
    mostrador
      .enElLocal()
      .then((lista) => vigente && setOrdenes(lista))
      .catch((error: unknown) => console.error('No se pudo leer la ropa en el local.', error));
    return () => {
      vigente = false;
    };
  }, [mostrador]);

  return (
    <>
      <h2 className="mt-8 text-2xl font-bold text-texto">Ropa en el local</h2>
      {ordenes === null && <p className="mt-4 text-xl text-texto-suave">Buscando…</p>}
      {ordenes?.length === 0 && <p className="mt-4 text-xl text-texto-suave">No hay ropa en el local.</p>}
      {ordenes && ordenes.length > 0 && (
        <ul className="mt-4 grid gap-3">
          {ordenes.map((orden) => (
            <li key={orden.id}>
              <TarjetaOrden orden={orden} alElegir={() => alElegir(orden)} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * El Mostrador — SPEC-KRILINXI-033: Ropa en el local, Cobrar y Entregar ropa, en una sola pantalla
 * con una sola entrada. Se busca (un cliente o una boleta), se elige, y se actúa desde la ficha del
 * cliente: un solo camino, como pide CLAUDE.md §9.
 *
 * Sin buscar nada, muestra la ropa en el local. Todo es de la sucursal de trabajo y sale de la base
 * local, también sin internet (CLAUDE.md §6).
 */
export function PantallaMostrador() {
  const mostrador = useMostrador();
  const [vista, setVista] = useState<Vista>({ tipo: 'inicio' });
  // Cambia cada vez que se elige algo: vuelve a montar el buscador, que queda vacío.
  const [vuelta, setVuelta] = useState(0);

  function ir(nueva: Vista) {
    setVista(nueva);
    setVuelta((v) => v + 1);
  }

  function abrirBoleta(orden: OrdenVista) {
    if (orden.clienteId) ir({ tipo: 'ficha', clienteId: orden.clienteId, abierta: orden.id });
  }

  function elegir(encontrado: Encontrado) {
    if (encontrado.tipo === 'cliente') ir({ tipo: 'ficha', clienteId: encontrado.cliente.id, abierta: null });
    else abrirBoleta(encontrado.orden);
  }

  return (
    <div className="mt-6">
      <BuscadorVivo<Encontrado>
        key={vuelta}
        etiqueta="Buscar cliente o boleta: nombre, teléfono, carnet o número de boleta"
        buscar={(texto) => (mostrador.lista ? mostrador.buscar(texto) : Promise.resolve({ resultados: [], hayMas: false }))}
        claveDe={(e) => (e.tipo === 'cliente' ? `cliente-${e.cliente.id}` : `boleta-${e.orden.id}`)}
        mostrar={(e) => <ResultadoEncontrado encontrado={e} />}
        alElegir={elegir}
        sinResultados="No hay ningún cliente ni boleta con eso en esta sucursal."
        deshabilitado={!mostrador.lista}
      />

      {vista.tipo === 'inicio' ? (
        <RopaEnElLocal alElegir={abrirBoleta} />
      ) : (
        <>
          <FichaCliente
            key={vista.clienteId}
            clienteId={vista.clienteId}
            abierta={vista.abierta}
            alAbrir={(ordenId) => setVista({ ...vista, abierta: ordenId })}
          />
          <div className="mt-6">
            <Boton variante="secundario" onClick={() => ir({ tipo: 'inicio' })}>
              Ver toda la ropa en el local
            </Boton>
          </div>
        </>
      )}
    </div>
  );
}
