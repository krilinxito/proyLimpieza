import type { ReactNode } from 'react';
import { Tarjeta, type EstadoDeTarjeta } from '../../../components/Tarjeta';
import type { Cliente } from '../types';

type Props = {
  cliente: Cliente;
  /** Si va con encabezado ("Cliente", en Registrar ropa). */
  titulo?: string;
  /** Lo que va debajo de los datos, dentro de la misma tarjeta: "Cambiar de cliente". */
  children?: ReactNode;
  /** La marca de la esquina (SPEC-KRILINXI-058): en Registrar ropa, un cliente ya elegido es un visto. */
  estado?: EstadoDeTarjeta;
};

/**
 * Los datos de un cliente, grandes y en una lista que se lee de un vistazo. Una `Tarjeta` del
 * tema (SPEC-KRILINXI-025) con lugar para la acción que corresponda, así no quedan tarjetas
 * dentro de tarjetas.
 */
export function TarjetaCliente({ cliente, titulo, children, estado }: Props) {
  return (
    <div className="mt-4">
      <Tarjeta titulo={titulo} estado={estado}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-xl">
          <dt className="font-semibold text-texto-suave">Nombre</dt>
          <dd className="text-texto">{cliente.nombre}</dd>
          <dt className="font-semibold text-texto-suave">Teléfono</dt>
          <dd className="text-texto">{cliente.telefono}</dd>
          <dt className="font-semibold text-texto-suave">Carnet</dt>
          <dd className="text-texto">{cliente.carnet ?? 'No lo dio'}</dd>
        </dl>
        {children && <div className="mt-4">{children}</div>}
      </Tarjeta>
    </div>
  );
}
