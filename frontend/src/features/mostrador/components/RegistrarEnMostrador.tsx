import { useEffect, useState } from 'react';
import type { Cliente } from '../../clientes/types';
import { FormularioRopa } from '../../ordenes/components/FormularioRopa';
import { useRegistrarRopa } from '../../ordenes/hooks/useRegistrarRopa';
import type { RopaRegistrada } from '../../ordenes/types';
import { useMostrador } from '../hooks/useMostrador';

type Props = {
  /** El cliente de la ficha que estaba abierta, o null para elegirlo en el formulario. */
  clienteId: string | null;
  alRegistrar: (ropa: RopaRegistrada) => void;
};

/**
 * "Registrar ropa" dentro del Mostrador — SPEC-KRILINXI-034. Si se abrió desde la ficha de un
 * cliente, lo lee y lo pone ya elegido; si no, el formulario empieza por el buscador. Guardar es lo
 * de siempre (`useRegistrarRopa`, en la sucursal de trabajo), ahora con el cliente nuevo incluido.
 */
export function RegistrarEnMostrador({ clienteId, alRegistrar }: Props) {
  const mostrador = useMostrador();
  const registro = useRegistrarRopa();
  // undefined mientras se lee el cliente de la ficha; null si no hay ninguno elegido.
  const [cliente, setCliente] = useState<Cliente | null | undefined>(clienteId ? undefined : null);

  useEffect(() => {
    if (!clienteId || !mostrador.lista) return;
    let vigente = true;
    mostrador
      .cliente(clienteId)
      .then((leido) => vigente && setCliente(leido))
      .catch((error: unknown) => console.error('No se pudo leer el cliente.', error));
    return () => {
      vigente = false;
    };
  }, [clienteId, mostrador]);

  if (cliente === undefined || !registro.lista) return <p className="mt-6 text-xl text-texto-suave">Preparando…</p>;
  return <FormularioRopa clienteInicial={cliente} registrar={registro.registrar} alRegistrar={alRegistrar} />;
}
