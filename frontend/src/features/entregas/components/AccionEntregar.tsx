import { useState } from 'react';
import { Boton } from '../../../components/Boton';
import type { OrdenVista } from '../../ordenes/types';
import type { EntregaLista } from '../types';
import { FormularioEntrega } from './FormularioEntrega';

/**
 * "Entregar la ropa" dentro del detalle de una boleta: un botón que abre el formulario —
 * SPEC-KRILINXI-009. Desde SPEC-KRILINXI-033 vive aparte, porque lo usa el Mostrador (antes era
 * parte de la pantalla /entregar, que ya no existe).
 */
export function AccionEntregar({ orden, alEntregar }: { orden: OrdenVista; alEntregar: (entrega: EntregaLista) => void }) {
  const [abierto, setAbierto] = useState(false);
  if (!abierto) return <Boton onClick={() => setAbierto(true)}>Entregar la ropa</Boton>;
  return <FormularioEntrega orden={orden} alEntregar={alEntregar} alCancelar={() => setAbierto(false)} />;
}
