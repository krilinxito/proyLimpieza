import { useState } from 'react';
import { Boton } from '../../../components/Boton';
import type { OrdenVista } from '../../ordenes/types';
import type { EntregaLista } from '../types';
import { FormularioEntrega } from './FormularioEntrega';
import { FormularioReembolso } from './FormularioReembolso';

/**
 * "Entregar la ropa" dentro del detalle de una boleta: un botón que abre el formulario —
 * SPEC-KRILINXI-009. Con saldo pendiente suma "Entregar sin cobrar" (SPEC-KRILINXI-070), secundario y rojo
 * solo al abrirse: la acción principal a la vista sigue siendo una sola. Desde SPEC-KRILINXI-033 vive aparte, porque lo usa el Mostrador (antes era
 * parte de la pantalla /entregar, que ya no existe).
 *
 * Va dentro de la fila de acciones de la boleta (SPEC-KRILINXI-038): el botón es compacto, y el
 * formulario, cuando se abre, ocupa la fila entera (dos columnas en la grilla, todo el ancho en flex).
 */
export function AccionEntregar({
  orden,
  alEntregar,
  principal = true,
}: {
  orden: OrdenVista;
  alEntregar: (entrega: EntregaLista) => void;
  /** Si es la acción principal de la boleta (SPEC-KRILINXI-037): sí cuando la ropa ya está lista. */
  principal?: boolean;
}) {
  const [abierto, setAbierto] = useState<'entrega' | 'sin-cobrar' | null>(null);
  if (abierto === null) {
    return (
      <>
        <Boton
          variante={principal ? 'primario' : 'secundario'}
          tamano="compacto"
          icono="entregar"
          onClick={() => setAbierto('entrega')}
        >
          Entregar la ropa
        </Boton>
        {/* Solo si debe algo: en una boleta pagada no hay nada que perdonar. */}
        {orden.saldo > 0 && (
          <Boton variante="secundario" tamano="compacto" icono="entregar" onClick={() => setAbierto('sin-cobrar')}>
            Entregar sin cobrar
          </Boton>
        )}
      </>
    );
  }
  return (
    <div className="col-span-2 sm:basis-full">
      {abierto === 'entrega' ? (
        <FormularioEntrega orden={orden} alEntregar={alEntregar} alCancelar={() => setAbierto(null)} />
      ) : (
        <FormularioReembolso orden={orden} alEntregar={alEntregar} alCancelar={() => setAbierto(null)} />
      )}
    </div>
  );
}
