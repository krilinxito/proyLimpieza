import { useEffect, useState } from 'react';
import { Boton } from '../../../components/Boton';
import { ModalConfirmacion } from '../../../components/ModalConfirmacion';
import type { Cliente } from '../../clientes/types';
import type { RegistroParaCorregir } from '../types';

type Props = {
  registro: RegistroParaCorregir;
  buscar: (registro: RegistroParaCorregir) => Promise<Cliente | null>;
  usar: (registro: RegistroParaCorregir, existente: Cliente) => Promise<{ boletas: number }>;
  /** Con el cliente al que pasó la ropa, para el aviso. */
  alUsar: (existente: Cliente, boletas: number) => void;
};

/**
 * "Es el mismo cliente" — SPEC-KRILINXI-021. Si un cliente se rechazó porque su teléfono ya era
 * de otro, y la tablet conoce a ese otro, lo muestra para que el empleado compare y, si es la
 * misma persona, pase la ropa a su nombre. Si la tablet no lo conoce, no muestra nada y queda la
 * corrección de siempre.
 */
export function MismoCliente({ registro, buscar, usar, alUsar }: Props) {
  const [existente, setExistente] = useState<Cliente | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    buscar(registro)
      .then((cliente) => vigente && setExistente(cliente))
      .catch((causa: unknown) => console.error('No se pudo buscar el cliente con ese teléfono.', causa));
    return () => {
      vigente = false;
    };
  }, [buscar, registro]);

  if (!existente) return null;

  async function confirmar(cliente: Cliente) {
    try {
      const { boletas } = await usar(registro, cliente);
      alUsar(cliente, boletas);
    } catch (causa) {
      console.error('No se pudo pasar la ropa al cliente que ya existe.', causa);
      setError('No se pudo guardar. Probá de nuevo y, si sigue pasando, avisale al encargado.');
      setConfirmando(false);
    }
  }

  return (
    <section aria-label="Es el mismo cliente" className="mt-4 rounded-lg border-2 border-sky-700 bg-sky-50 p-4 text-xl">
      <p className="font-semibold text-slate-900">Ya hay un cliente con ese teléfono:</p>
      <p className="mt-1 text-slate-900">
        {existente.nombre} ({existente.telefono})
      </p>
      <p className="mt-2 text-slate-800">Si es la misma persona, su ropa pasa a ese cliente y este se descarta.</p>
      {error && (
        <p role="alert" className="mt-2 text-red-700">
          {error}
        </p>
      )}
      <div className="mt-4">
        <Boton onClick={() => setConfirmando(true)}>Es el mismo cliente</Boton>
      </div>
      <ModalConfirmacion
        abierto={confirmando}
        titulo={`¿Es ${existente.nombre}?`}
        mensaje={`La ropa de este registro pasa a nombre de ${existente.nombre} y se vuelve a guardar. Este cliente repetido se descarta.`}
        textoConfirmar="Sí, es la misma persona"
        onConfirmar={() => confirmar(existente)}
        onCancelar={() => setConfirmando(false)}
      />
    </section>
  );
}
