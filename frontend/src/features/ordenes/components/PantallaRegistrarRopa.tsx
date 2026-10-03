import { useState } from 'react';
import { PantallaClientes } from '../../clientes/components/PantallaClientes';
import type { Cliente } from '../../clientes/types';
import { useRegistrarRopa } from '../hooks/useRegistrarRopa';
import type { RopaRegistrada } from '../types';
import { FormularioRopa } from './FormularioRopa';
import { ResumenRopa } from './ResumenRopa';

/** Tres pasos, siempre en el mismo orden: quién deja la ropa, qué deja, y el resumen. */
type Paso = { tipo: 'cliente' } | { tipo: 'ropa'; cliente: Cliente } | { tipo: 'listo'; ropa: RopaRegistrada };

/**
 * Registrar la ropa que deja un cliente. Todo se guarda en la tablet: funciona igual con o
 * sin internet (CLAUDE.md §6).
 */
export function PantallaRegistrarRopa() {
  const registro = useRegistrarRopa();
  const [paso, setPaso] = useState<Paso>({ tipo: 'cliente' });

  if (paso.tipo === 'cliente') {
    return (
      <>
        <p className="mt-4 text-xl text-slate-700">Buscá al cliente por su teléfono.</p>
        <PantallaClientes alElegir={(cliente) => setPaso({ tipo: 'ropa', cliente })} />
      </>
    );
  }

  if (paso.tipo === 'listo') {
    return <ResumenRopa ropa={paso.ropa} alRegistrarOtra={() => setPaso({ tipo: 'cliente' })} />;
  }

  if (!registro.lista) return <p className="mt-6 text-xl text-slate-700">Preparando…</p>;

  return (
    <FormularioRopa
      cliente={paso.cliente}
      registrar={registro.registrar}
      alRegistrar={(ropa) => setPaso({ tipo: 'listo', ropa })}
      alCambiarCliente={() => setPaso({ tipo: 'cliente' })}
    />
  );
}
