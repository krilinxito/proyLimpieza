import type { ReactNode } from 'react';

/**
 * "Ver más estadísticas" — SPEC-KRILINXI-050. Lo que el admin mira primero está a la vista; el resto del
 * tablero se despliega a pedido. Es un `<details>` como `Detalle` (se maneja con teclado y dedo, y el lector de
 * pantalla lo anuncia plegado o desplegado), pero **controlado**: lo de adentro no se monta hasta que se abre,
 * y lo que pide su propio dato (productividad, clientes) no lo pide antes.
 */
export function VerMas({ abierto, alCambiar, children }: { abierto: boolean; alCambiar: (abierto: boolean) => void; children: ReactNode }) {
  return (
    <details className="mt-8" open={abierto} onToggle={(evento) => alCambiar(evento.currentTarget.open)}>
      <summary className="min-h-14 cursor-pointer py-3 text-xl font-semibold text-marca">Ver más estadísticas</summary>
      {abierto && children}
    </details>
  );
}
