import { Link } from 'react-router-dom';
import { Icono } from './iconos';
import { cuantos, fraseConexion } from './textoConexion';

type Props = {
  conectado: boolean;
  /** Registros escritos en la tablet que todavía no llegaron al servidor. */
  pendientes: number;
  /** Registros que no se pudieron guardar y hay que revisar. */
  paraCorregir: number;
};

/**
 * El estado de la conexión en grande, en palabras (CLAUDE.md §9). Si algo no se pudo guardar, lo
 * dice y lleva a revisarlo: ningún error de guardado queda en silencio (CLAUDE.md §6) —
 * SPEC-KRILINXI-007.
 *
 * Desde SPEC-KRILINXI-031 el marco lo muestra solo cuando hay registros para corregir, es decir,
 * cuando pide hacer algo. El resto del tiempo el estado va en la píldora de la cabecera
 * (`components/marco/PildoraConexion.tsx`), con los mismos textos (`textoConexion.ts`).
 *
 * Recibe los números por props, como todo componente compartido: quien los saca de la base
 * local es `useConexion`.
 *
 * Tiene el aspecto de `Aviso` (SPEC-KRILINXI-027): el mismo ícono al costado, sin internet en
 * advertencia y con internet en neutro. No ES un `Aviso` porque su rol es siempre `status`: está
 * en todas las pantallas y cambia solo, y un `alert` interrumpiría al lector de pantalla cada vez
 * que se corta o vuelve la conexión.
 */
export function AvisoConexion(props: Props) {
  const { conectado, paraCorregir } = props;
  return (
    <div
      role="status"
      className={`mx-auto mt-2 flex max-w-3xl items-start gap-3 rounded-xl border-2 px-6 py-3 text-lg ${
        conectado ? 'border-borde-suave bg-superficie text-texto' : 'border-advertencia-borde bg-advertencia-fondo text-advertencia-texto'
      }`}
    >
      <Icono nombre={conectado ? 'informacion' : 'advertencia'} />
      <div className="min-w-0 flex-1">
        <p>{fraseConexion(props)}</p>
        {paraCorregir > 0 && (
          <Link to="/para-corregir" className="mt-1 inline-block font-semibold text-peligro-texto underline">
            {cuantos(paraCorregir)} {paraCorregir === 1 ? 'no se pudo guardar' : 'no se pudieron guardar'}. Toca acá para revisarlos.
          </Link>
        )}
      </div>
    </div>
  );
}
