import { Boton } from '../../../components/Boton';
import { BuscadorVivo } from '../../../components/BuscadorVivo';
import { CampoTexto } from '../../../components/CampoTexto';
import { Tarjeta } from '../../../components/Tarjeta';
import { useClientes } from '../hooks/useClientes';
import type { Cliente, ClienteElegido, DatosAlta } from '../types';
import { datosIniciales } from './FormularioAltaCliente';
import { TarjetaCliente } from './TarjetaCliente';

type Props = {
  valor: ClienteElegido | null;
  alCambiar: (valor: ClienteElegido | null) => void;
  /** Los del formulario de la ropa: falta el cliente, o lo que esté mal del cliente nuevo. */
  errores: { cliente?: string; clienteNombre?: string; clienteTelefono?: string };
  deshabilitado?: boolean;
};

/** Cómo se ve cada resultado: el nombre y, debajo, con qué distinguirlo (como en /clientes). */
function ResultadoCliente({ cliente }: { cliente: Cliente }) {
  return (
    <span className="grid">
      <span className="font-semibold">{cliente.nombre}</span>
      <span className="text-lg text-texto-suave">
        Tel. {cliente.telefono}
        {cliente.carnet && ` · Carnet ${cliente.carnet}`}
      </span>
    </span>
  );
}

/**
 * Quién deja la ropa, dentro del mismo formulario — SPEC-KRILINXI-034. Tres momentos, sin cambiar
 * de pantalla:
 *  - todavía nadie: el buscador vivo (SPEC-KRILINXI-032), con "Cliente nuevo" al final;
 *  - uno que ya existe: su tarjeta, con "Cambiar de cliente";
 *  - uno nuevo: nombre, teléfono y carnet acá mismo, que se guardan junto con la ropa.
 *
 * No guarda nada: le dice al formulario qué cliente es. Valida quien guarda (`registrarRopa`).
 */
export function ElegirClienteDeLaRopa({ valor, alCambiar, errores, deshabilitado = false }: Props) {
  const clientes = useClientes();

  if (valor?.tipo === 'existente') {
    return (
      <TarjetaCliente cliente={valor.cliente} titulo="Cliente">
        <Boton variante="secundario" onClick={() => alCambiar(null)} disabled={deshabilitado}>
          Cambiar de cliente
        </Boton>
      </TarjetaCliente>
    );
  }

  if (valor?.tipo === 'nuevo') {
    const cambiar = (campo: keyof DatosAlta) => (texto: string) =>
      alCambiar({ tipo: 'nuevo', datos: { ...valor.datos, [campo]: texto } });
    return (
      <div className="mt-4">
        <Tarjeta titulo="Cliente nuevo">
          <CampoTexto
            etiqueta="Nombre completo"
            value={valor.datos.nombre}
            onChange={cambiar('nombre')}
            error={errores.clienteNombre}
            autoComplete="off"
            autoFocus
          />
          <CampoTexto
            etiqueta="Teléfono"
            value={valor.datos.telefono}
            onChange={cambiar('telefono')}
            error={errores.clienteTelefono}
            inputMode="tel"
            autoComplete="off"
          />
          <CampoTexto etiqueta="Carnet (si lo da)" value={valor.datos.carnet} onChange={cambiar('carnet')} autoComplete="off" />
          <div className="mt-4">
            <Boton variante="secundario" onClick={() => alCambiar(null)} disabled={deshabilitado}>
              Buscar un cliente que ya existe
            </Boton>
          </div>
        </Tarjeta>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <Tarjeta titulo="Cliente">
        <BuscadorVivo<Cliente>
          etiqueta="Buscar cliente por nombre, teléfono o carnet"
          buscar={(texto) => (clientes.lista ? clientes.buscarVivo(texto) : Promise.resolve({ resultados: [], hayMas: false }))}
          claveDe={(cliente) => cliente.id}
          mostrar={(cliente) => <ResultadoCliente cliente={cliente} />}
          alElegir={(cliente) => alCambiar({ tipo: 'existente', cliente })}
          accion={{
            texto: 'Cliente nuevo',
            icono: 'clientes',
            alElegir: (escrito) => alCambiar({ tipo: 'nuevo', datos: datosIniciales(escrito) }),
          }}
          sinResultados="Ningún cliente coincide con eso. Si es la primera vez que viene, tocá «Cliente nuevo»."
          deshabilitado={!clientes.lista || deshabilitado}
        />
        {errores.cliente && <p className="mt-2 text-lg font-semibold text-peligro-texto">{errores.cliente}</p>}
      </Tarjeta>
    </div>
  );
}
