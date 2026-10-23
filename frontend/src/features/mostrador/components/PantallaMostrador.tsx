import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Boton } from '../../../components/Boton';
import { BuscadorVivo } from '../../../components/BuscadorVivo';
import { Insignia } from '../../../components/Insignia';
import { ModalConfirmacion } from '../../../components/ModalConfirmacion';
import { Paginas } from '../../../components/Paginas';
import { usePaginado } from '../../../hooks/usePaginado';
import { TEXTO_ESTADO_ORDEN } from '../../../lib/dominio';
import { TONO_ESTADO } from '../../ordenes/estado';
import { ResumenRopa } from '../../ordenes/components/ResumenRopa';
import { TarjetaOrden } from '../../ordenes/components/TarjetaOrden';
import type { OrdenVista, RopaRegistrada } from '../../ordenes/types';
import { useMostrador } from '../hooks/useMostrador';
import type { Encontrado } from '../types';
import { FichaCliente } from './FichaCliente';
import { RegistrarEnMostrador } from './RegistrarEnMostrador';

/**
 * Dónde está quien atiende: mirando la ropa en el local, en la ficha de un cliente, o registrando
 * ropa (SPEC-KRILINXI-034), con el cliente de la ficha o eligiéndolo en el formulario.
 */
type Vista =
  | { tipo: 'inicio' }
  | { tipo: 'ficha'; clienteId: string; abierta: string | null }
  | { tipo: 'registrando'; clienteId: string | null }
  | { tipo: 'registrada'; ropa: RopaRegistrada };

/** El parámetro de la dirección que abre el Mostrador con el formulario: `/mostrador?registrar`. */
export const PARAMETRO_REGISTRAR = 'registrar';

/**
 * La dirección que abre una boleta en la ficha de su cliente — SPEC-KRILINXI-035: el Inicio lleva
 * así a cada boleta de sus listas. `/mostrador?cliente=…&boleta=…`.
 */
export function enlaceABoleta(orden: { id: string; clienteId: string | null }): string {
  const parametros = new URLSearchParams({ boleta: orden.id });
  if (orden.clienteId) parametros.set('cliente', orden.clienteId);
  return `/mostrador?${parametros.toString()}`;
}

/** Qué muestra el Mostrador al abrirse, según la dirección. */
function vistaInicial(parametros: URLSearchParams): Vista {
  if (parametros.has(PARAMETRO_REGISTRAR)) return { tipo: 'registrando', clienteId: null };
  const clienteId = parametros.get('cliente');
  if (clienteId) return { tipo: 'ficha', clienteId, abierta: parametros.get('boleta') };
  return { tipo: 'inicio' };
}

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
  const paginas = usePaginado(ordenes);

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
      {paginas.visibles && paginas.visibles.length > 0 && (
        <ul className="mt-4 grid gap-3">
          {paginas.visibles.map((orden) => (
            <li key={orden.id}>
              <TarjetaOrden orden={orden} alElegir={() => alElegir(orden)} />
            </li>
          ))}
        </ul>
      )}
      <Paginas pagina={paginas.pagina} total={paginas.total} porPagina={paginas.porPagina} irAPagina={paginas.irAPagina} nombre="Páginas de la ropa en el local" />
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
  const [parametros, setParametros] = useSearchParams();
  // `/mostrador?registrar` (adonde lleva /registrar-ropa) abre directo el formulario, y
  // `?cliente=…&boleta=…` (desde el Inicio) abre esa boleta en la ficha de su cliente.
  const [vista, setVista] = useState<Vista>(() => vistaInicial(parametros));
  // Cambia cada vez que se elige algo: vuelve a montar el buscador, que queda vacío.
  const [vuelta, setVuelta] = useState(0);
  // Lo escrito en el formulario de la ropa y si se está por descartar (SPEC-KRILINXI-048).
  const [hayEscrito, setHayEscrito] = useState(false);
  const [saliendo, setSaliendo] = useState(false);

  function ir(nueva: Vista) {
    setVista(nueva);
    setVuelta((v) => v + 1);
    // Lo que pedía la dirección ya se mostró: vuelve a ser /mostrador, y recargar no lo reabre.
    if (nueva.tipo !== 'registrando' && parametros.toString() !== '') setParametros({}, { replace: true });
  }

  function abrirBoleta(orden: OrdenVista) {
    if (orden.clienteId) ir({ tipo: 'ficha', clienteId: orden.clienteId, abierta: orden.id });
  }

  function elegir(encontrado: Encontrado) {
    if (encontrado.tipo === 'cliente') ir({ tipo: 'ficha', clienteId: encontrado.cliente.id, abierta: null });
    else abrirBoleta(encontrado.orden);
  }

  if (vista.tipo === 'registrando') {
    const volver = () => {
      setSaliendo(false);
      ir(vista.clienteId ? { tipo: 'ficha', clienteId: vista.clienteId, abierta: null } : { tipo: 'inicio' });
    };
    return (
      <div className="mt-6">
        <RegistrarEnMostrador
          clienteId={vista.clienteId}
          alRegistrar={(ropa) => ir({ tipo: 'registrada', ropa })}
          alCambiarEscrito={setHayEscrito}
        />
        <div className="mt-6">
          {/* Con algo escrito, volver lo descartaría: se pregunta antes (SPEC-KRILINXI-048). */}
          <Boton variante="navegacion" onClick={() => (hayEscrito ? setSaliendo(true) : volver())}>
            Volver al mostrador sin guardar
          </Boton>
        </div>
        <ModalConfirmacion
          abierto={saliendo}
          titulo="¿Salir sin guardar?"
          mensaje="Se pierde lo que escribiste: esta ropa no queda registrada."
          textoConfirmar="Sí, salir"
          textoCancelar="Seguir escribiendo"
          peligroso
          onConfirmar={volver}
          onCancelar={() => setSaliendo(false)}
        />
      </div>
    );
  }

  if (vista.tipo === 'registrada') {
    const { ropa } = vista;
    // Después del resumen, a la ficha del cliente con la boleta nueva abierta.
    return (
      <ResumenRopa
        ropa={ropa}
        textoSeguir={`Ver la boleta en la ficha de ${ropa.cliente.nombre}`}
        alSeguir={() => ir({ tipo: 'ficha', clienteId: ropa.cliente.id, abierta: ropa.ordenId })}
      />
    );
  }

  return (
    <div className="mt-6">
      {/* Siempre a mano, también con la ficha de un cliente abierta: ahí lo trae elegido. Es la
          acción principal salvo con una boleta abierta, que trae la suya (SPEC-KRILINXI-037). */}
      <div className="mb-6">
        <Boton
          icono="registrar-ropa"
          variante={vista.tipo === 'ficha' && vista.abierta ? 'secundario' : 'primario'}
          onClick={() => ir({ tipo: 'registrando', clienteId: vista.tipo === 'ficha' ? vista.clienteId : null })}
        >
          Registrar ropa
        </Boton>
      </div>
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
            alRegistrar={() => ir({ tipo: 'registrando', clienteId: vista.clienteId })}
          />
          <div className="mt-6">
            <Boton variante="navegacion" onClick={() => ir({ tipo: 'inicio' })}>
              Ver toda la ropa en el local
            </Boton>
          </div>
        </>
      )}
    </div>
  );
}
