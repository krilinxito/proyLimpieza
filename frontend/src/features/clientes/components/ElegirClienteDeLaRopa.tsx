import { Boton } from '../../../components/Boton';
import { BuscadorVivo } from '../../../components/BuscadorVivo';
import { CampoTexto } from '../../../components/CampoTexto';
import { Tarjeta, type EstadoDeTarjeta } from '../../../components/Tarjeta';
import { useClientes } from '../hooks/useClientes';
import type { Cliente, ClienteElegido, DatosAlta } from '../types';
import { datosIniciales } from './FormularioAltaCliente';
import { TarjetaCliente } from './TarjetaCliente';

type Props = {
  valor: ClienteElegido | null;
  alCambiar: (valor: ClienteElegido | null) => void;
  /** Los del formulario de la ropa: falta el cliente, o lo que esté mal del cliente nuevo. */
  errores: { cliente?: string; clienteNombre?: string; clienteTelefono?: string; clienteCarnet?: string };
  /** Qué campos del cliente nuevo ya están bien (SPEC-KRILINXI-058): cada uno muestra su visto. */
  correctos?: { nombre?: boolean; telefono?: boolean; carnet?: boolean };
  /** La marca de la esquina de la tarjeta del cliente (SPEC-KRILINXI-058). */
  estado?: EstadoDeTarjeta;
  /** Avisa cuando se sale de un campo del cliente nuevo: recién ahí puede mostrar su error. */
  alSalirDe?: (campo: 'clienteNombre' | 'clienteTelefono' | 'clienteCarnet') => void;
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
 *  - uno nuevo: nombre, teléfono y carnet acá mismo, que se guardan junto con la ropa, con un
 *    "Atrás" que vuelve a elegir (SPEC-KRILINXI-057; antes decía "Buscar un cliente que ya existe" y
 *    parecía un paso que había que enviar).
 *
 * Desde SPEC-KRILINXI-057 el buscador es solo el primer paso: `FormularioRopa` no muestra a la vez
 * el buscador y los datos de la boleta.
 *
 * No guarda nada: le dice al formulario qué cliente es. Valida quien guarda (`registrarRopa`).
 */
export function ElegirClienteDeLaRopa({ valor, alCambiar, errores, correctos = {}, estado, alSalirDe, deshabilitado = false }: Props) {
  const clientes = useClientes();

  if (valor?.tipo === 'existente') {
    return (
      <TarjetaCliente cliente={valor.cliente} titulo="Cliente" estado={estado}>
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
        <Tarjeta titulo="Cliente nuevo" estado={estado}>
          <CampoTexto
            etiqueta="Nombre completo"
            value={valor.datos.nombre}
            onChange={cambiar('nombre')}
            onBlur={() => alSalirDe?.('clienteNombre')}
            error={errores.clienteNombre}
            correcto={correctos.nombre}
            autoComplete="off"
            autoFocus
          />
          <CampoTexto
            etiqueta="Teléfono"
            value={valor.datos.telefono}
            onChange={cambiar('telefono')}
            onBlur={() => alSalirDe?.('clienteTelefono')}
            error={errores.clienteTelefono}
            correcto={correctos.telefono}
            inputMode="tel"
            autoComplete="off"
          />
          <CampoTexto
            etiqueta="Carnet (si lo da)"
            value={valor.datos.carnet}
            onChange={cambiar('carnet')}
            onBlur={() => alSalirDe?.('clienteCarnet')}
            error={errores.clienteCarnet}
            correcto={correctos.carnet}
            autoComplete="off"
          />
          <div className="mt-4">
            <Boton variante="navegacion" onClick={() => alCambiar(null)} disabled={deshabilitado}>
              Atrás
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
          sinResultados="Ningún cliente coincide con eso. Si es la primera vez que viene, toca «Cliente nuevo»."
          deshabilitado={!clientes.lista || deshabilitado}
        />
        {errores.cliente && <p className="mt-2 text-lg font-semibold text-peligro-texto">{errores.cliente}</p>}
      </Tarjeta>
    </div>
  );
}
