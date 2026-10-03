import { useState } from 'react';
import { Boton } from '../../../components/Boton';
import { PantallaRopa } from '../../ordenes/components/PantallaRopa';
import type { OrdenVista } from '../../ordenes/types';
import type { EntregaLista } from '../types';
import { FormularioEntrega } from './FormularioEntrega';
import { ResumenEntrega } from './ResumenEntrega';

/** "Entregar la ropa" dentro del detalle: un botón que abre el formulario. */
function AccionEntregar({ orden, alEntregar }: { orden: OrdenVista; alEntregar: (entrega: EntregaLista) => void }) {
  const [abierto, setAbierto] = useState(false);
  if (!abierto) return <Boton onClick={() => setAbierto(true)}>Entregar la ropa</Boton>;
  return <FormularioEntrega orden={orden} alEntregar={alEntregar} alCancelar={() => setAbierto(false)} />;
}

/**
 * Entregar ropa — SPEC-KRILINXI-009. Es la pantalla de la ropa (SPEC-KRILINXI-008) con una
 * acción más en el detalle: así la búsqueda por boleta o teléfono, el estado y el saldo son
 * los mismos en todo el mostrador.
 */
export function PantallaEntregar() {
  const [entregada, setEntregada] = useState<EntregaLista | null>(null);

  if (entregada) return <ResumenEntrega entrega={entregada} alEntregarOtra={() => setEntregada(null)} />;

  return (
    <>
      <p className="mt-4 text-xl text-slate-700">Buscá la boleta o el teléfono del cliente.</p>
      <PantallaRopa accionesExtra={(orden) => <AccionEntregar orden={orden} alEntregar={setEntregada} />} />
    </>
  );
}
