import { useState, type FormEvent } from 'react';
import { Boton } from '../../../components/Boton';
import { CampoTexto } from '../../../components/CampoTexto';
import type { MetodoPago } from '../../../lib/dominio';
import { formatearBs, type Centavos } from '../../../lib/money';
import type { ResultadoAccion } from '../types';
import { ElegirMetodo } from './ElegirMetodo';

type Props = {
  saldo: Centavos;
  cobrar: (datos: { monto: string; metodo: MetodoPago | null }) => Promise<ResultadoAccion>;
  alCobrar: () => void;
  alCancelar: () => void;
};

/** Cobrar a cuenta de la ropa que todavía está en el local — SPEC-KRILINXI-008. */
export function FormularioCobro({ saldo, cobrar, alCobrar, alCancelar }: Props) {
  const [monto, setMonto] = useState('');
  const [metodo, setMetodo] = useState<MetodoPago | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (guardando) return;
    setGuardando(true);
    setError(null);
    try {
      const resultado = await cobrar({ monto, metodo });
      if (resultado.tipo === 'hecho') {
        alCobrar();
        return;
      }
      setError(resultado.mensaje);
    } catch (falla) {
      console.error('No se pudo guardar el cobro en la base local.', falla);
      setError('No se pudo guardar el cobro. Probá de nuevo y, si sigue pasando, avisale al encargado.');
    }
    setGuardando(false);
  }

  return (
    <form onSubmit={guardar} noValidate aria-label="Cobrar" className="mt-6 grid gap-2 rounded-lg border-2 border-sky-700 p-4">
      <p className="text-xl text-slate-800">Falta pagar {formatearBs(saldo)}.</p>
      <CampoTexto etiqueta="Cuánto paga (Bs)" value={monto} onChange={setMonto} inputMode="decimal" autoComplete="off" autoFocus />
      <ElegirMetodo value={metodo} onChange={setMetodo} pregunta="¿Cómo paga?" />
      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-xl text-red-800">
          {error}
        </p>
      )}
      <div className="mt-4 grid gap-3">
        <Boton type="submit" ocupado={guardando} textoOcupado="Guardando…">
          Guardar cobro
        </Boton>
        <Boton variante="secundario" onClick={alCancelar} disabled={guardando}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}
