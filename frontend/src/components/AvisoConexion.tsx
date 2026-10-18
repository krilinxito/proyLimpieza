import { Link } from 'react-router-dom';
import { Icono } from './iconos';

type Props = {
  conectado: boolean;
  /** Registros escritos en la tablet que todavía no llegaron al servidor. */
  pendientes: number;
  /** Registros que no se pudieron guardar y hay que revisar. */
  paraCorregir: number;
};

/** "1 registro" / "3 registros": la palabra bien escrita, no un "registro(s)". */
function cuantos(n: number): string {
  return n === 1 ? '1 registro' : `${n} registros`;
}

/** La frase principal según cómo estén las cosas. */
function frase({ conectado, pendientes }: Props): string {
  const seGuarda = pendientes === 1 ? 'se guardará' : 'se guardarán';
  if (!conectado && pendientes > 0) {
    return `Trabajando sin internet — ${cuantos(pendientes)} ${seGuarda} cuando vuelva la conexión.`;
  }
  if (!conectado) return 'Trabajando sin internet — lo que registres se guardará cuando vuelva la conexión.';
  if (pendientes > 0) return `Con internet — guardando ${cuantos(pendientes)}…`;
  return 'Con internet — todo está guardado.';
}

/**
 * El estado de la conexión, siempre visible y en palabras (CLAUDE.md §9): nunca un ícono
 * suelto que haya que interpretar. Si algo no se pudo guardar, lo dice y lleva a revisarlo:
 * ningún error de guardado queda en silencio (CLAUDE.md §6) — SPEC-KRILINXI-007.
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
        <p>{frase(props)}</p>
        {paraCorregir > 0 && (
          <Link to="/para-corregir" className="mt-1 inline-block font-semibold text-peligro-texto underline">
            {cuantos(paraCorregir)} {paraCorregir === 1 ? 'no se pudo guardar' : 'no se pudieron guardar'}. Tocá acá para revisarlos.
          </Link>
        )}
      </div>
    </div>
  );
}
