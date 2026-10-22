import { Aviso } from '../../../components/Aviso';
import { Boton } from '../../../components/Boton';
import type { EstadoPedido } from '../../../hooks/usePedidoOnline';

/**
 * El lugar de lo que todavía no llegó — SPEC-KRILINXI-050. Un bloque de la altura de un gráfico, para que el
 * tablero no se arme a saltos cuando llegan los datos, y nunca un cero ni un gráfico vacío (CLAUDE.md §8).
 * El texto es para quien no ve el bloque: un lector de pantalla lo anuncia como estado.
 */
export function Esqueleto({ texto }: { texto: string }) {
  return (
    <div role="status" className="mt-4">
      <p className="sr-only">{texto}</p>
      <div aria-hidden="true" className="h-64 rounded-xl bg-borde-suave motion-safe:animate-pulse" />
    </div>
  );
}

/**
 * Lo que dice una tarjeta que pide su propio dato cuando no pudo traerlo: sin internet o con error, y el botón para
 * probar de nuevo (SPEC-KRILINXI-016). Las demás tarjetas siguen a la vista.
 */
export function AvisoDeTarjeta({ estado, recargar }: { estado: Extract<EstadoPedido<unknown>, { tipo: 'sin-conexion' | 'error' }>; recargar: () => void }) {
  return (
    <div className="mt-4">
      <Aviso tipo={estado.tipo === 'sin-conexion' ? 'advertencia' : 'error'}>
        <p>{estado.tipo === 'sin-conexion' ? 'Las estadísticas necesitan conexión.' : estado.mensaje}</p>
        <div className="mt-4">
          <Boton onClick={recargar}>Probar de nuevo</Boton>
        </div>
      </Aviso>
    </div>
  );
}
