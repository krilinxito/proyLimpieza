import { useState } from 'react';
import { Aviso } from '../../../components/Aviso';
import { Boton } from '../../../components/Boton';
import { BuscadorVivo } from '../../../components/BuscadorVivo';
import { EnlaceBoton } from '../../../components/EnlaceBoton';
import { useSucursalDeTrabajo } from '../../atencion/hooks/useSucursalDeTrabajo';
import { enlaceABoletasDe } from '../../historial/components/BoletasDelCliente';
import { useClientes } from '../hooks/useClientes';
import type { Cliente } from '../types';
import { FormularioAltaCliente } from './FormularioAltaCliente';
import { FormularioEditarCliente } from './FormularioEditarCliente';
import { ListaDeRecientes } from './ListaDeRecientes';
import { TarjetaCliente } from './TarjetaCliente';

/** En qué punto está el empleado. Un solo camino: buscar y, si no aparece, registrar. */
type Paso =
  | { tipo: 'inicio' }
  | { tipo: 'encontrado'; cliente: Cliente }
  /** Lo que estaba escrito en el buscador al tocar "Cliente nuevo" (SPEC-KRILINXI-032). */
  | { tipo: 'alta'; escrito: string }
  | { tipo: 'registrado'; cliente: Cliente }
  | { tipo: 'telefono-ocupado'; cliente: Cliente }
  /** SPEC-KRILINXI-014: cambiando sus datos, y cómo terminó. */
  | { tipo: 'editando'; cliente: Cliente }
  | { tipo: 'editado'; cliente: Cliente; aviso: string };


/** Lo que muestra cada resultado del buscador: el nombre grande y, debajo, cómo distinguirlo. */
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
 * Buscar un cliente mientras se escribe (por nombre, parte del teléfono o carnet,
 * SPEC-KRILINXI-032) y, si no está, darlo de alta. Todo sobre la base local: funciona igual con
 * o sin internet (CLAUDE.md §6).
 */
export function PantallaClientes() {
  const clientes = useClientes();
  const [paso, setPaso] = useState<Paso>({ tipo: 'inicio' });
  // Cambia cada vez que se elige un cliente: vuelve a montar el buscador, que queda vacío.
  const [vuelta, setVuelta] = useState(0);
  // SPEC-KRILINXI-061: con algo escrito en el buscador, sus resultados reemplazan la lista de recientes.
  const [buscando, setBuscando] = useState(false);

  function mostrarCliente(cliente: Cliente) {
    setPaso({ tipo: 'encontrado', cliente });
    setVuelta((v) => v + 1);
  }

  return (
    <div className="mt-6">
      <BuscadorVivo<Cliente>
        key={vuelta}
        etiqueta="Buscar cliente por nombre, teléfono o carnet"
        buscar={(texto) => (clientes.lista ? clientes.buscarVivo(texto) : Promise.resolve({ resultados: [], hayMas: false }))}
        claveDe={(cliente) => cliente.id}
        mostrar={(cliente) => <ResultadoCliente cliente={cliente} />}
        alElegir={mostrarCliente}
        accion={{ texto: 'Cliente nuevo', icono: 'clientes', alElegir: (escrito) => setPaso({ tipo: 'alta', escrito }) }}
        sinResultados="Ningún cliente coincide con eso. Si es la primera vez que viene, toca «Cliente nuevo»."
        deshabilitado={!clientes.lista}
        alCambiarEscrito={setBuscando}
      />

      <section aria-live="polite" className="mt-6">
        {paso.tipo === 'encontrado' && (
          <>
            <TarjetaCliente cliente={paso.cliente} />
            <Acciones
              cliente={paso.cliente}
              alEditar={() => setPaso({ tipo: 'editando', cliente: paso.cliente })}
              alVolver={() => setPaso({ tipo: 'inicio' })}
            />
          </>
        )}

        {paso.tipo === 'alta' && clientes.lista && (
          <FormularioAltaCliente
            key={paso.escrito}
            escrito={paso.escrito}
            registrar={clientes.registrar}
            alTerminar={(resultado) =>
              setPaso(
                resultado.tipo === 'registrado'
                  ? { tipo: 'registrado', cliente: resultado.cliente }
                  : { tipo: 'telefono-ocupado', cliente: resultado.cliente },
              )
            }
            alCancelar={() => setPaso({ tipo: 'inicio' })}
          />
        )}

        {paso.tipo === 'registrado' && (
          <>
            <Aviso tipo="exito">Cliente registrado.</Aviso>
            <TarjetaCliente cliente={paso.cliente} />
            <Acciones
              cliente={paso.cliente}
              alEditar={() => setPaso({ tipo: 'editando', cliente: paso.cliente })}
              alVolver={() => setPaso({ tipo: 'inicio' })}
            />
          </>
        )}

        {paso.tipo === 'editando' && clientes.lista && (
          <FormularioEditarCliente
            cliente={paso.cliente}
            editar={clientes.editar}
            alTerminar={(resultado) =>
              setPaso(
                resultado.tipo === 'editado'
                  ? {
                      tipo: 'editado',
                      cliente: resultado.cliente,
                      aviso: 'Datos del cliente guardados.',
                    }
                  : {
                      tipo: 'editado',
                      cliente: paso.cliente,
                      aviso: 'No cambiaste ningún dato: quedó como estaba.',
                    },
              )
            }
            alCancelar={() => setPaso({ tipo: 'encontrado', cliente: paso.cliente })}
          />
        )}

        {paso.tipo === 'editado' && (
          <>
            <Aviso tipo="exito">{paso.aviso}</Aviso>
            <TarjetaCliente cliente={paso.cliente} />
            <Acciones
              cliente={paso.cliente}
              alEditar={() => setPaso({ tipo: 'editando', cliente: paso.cliente })}
              alVolver={() => setPaso({ tipo: 'inicio' })}
            />
          </>
        )}

        {paso.tipo === 'telefono-ocupado' && (
          <>
            <Aviso tipo="advertencia">
              Ese teléfono ya está registrado a nombre de {paso.cliente.nombre}. No hace falta registrarlo otra vez.
            </Aviso>
            <TarjetaCliente cliente={paso.cliente} />
            <Acciones
              cliente={paso.cliente}
              alEditar={() => setPaso({ tipo: 'editando', cliente: paso.cliente })}
              alVolver={() => setPaso({ tipo: 'inicio' })}
            />
          </>
        )}
      </section>

      {/* Sin nada elegido: los últimos clientes, mientras no se escribe en el buscador (SPEC-KRILINXI-061). */}
      {paso.tipo === 'inicio' && !buscando && <ListaDeRecientes alElegir={mostrarCliente} />}
    </div>
  );
}

/**
 * Lo que se puede hacer con un cliente en pantalla: "Cambiar datos" (SPEC-KRILINXI-014), "Ver sus boletas" y volver a la lista (SPEC-KRILINXI-061). Hasta
 * SPEC-KRILINXI-034 había también "Es este cliente", para elegirlo al registrar ropa; ahora el
 * cliente se elige dentro del formulario de la ropa (`ElegirClienteDeLaRopa`).
 */
function Acciones({ cliente, alEditar, alVolver }: { cliente: Cliente; alEditar: () => void; alVolver: () => void }) {
  const conSucursal = useSucursalDeTrabajo() !== null;
  return (
    <div className="mt-4 grid gap-3">
      <Boton variante="secundario" onClick={alEditar}>
        Cambiar datos
      </Boton>
      {/* SPEC-KRILINXI-061: sus boletas son las de la sucursal de trabajo; sin una, no hay qué mostrar. */}
      {conSucursal && (
        <EnlaceBoton a={enlaceABoletasDe(cliente.id)} variante="secundario" icono="historial">
          Ver sus boletas
        </EnlaceBoton>
      )}
      <Boton variante="navegacion" onClick={alVolver}>
        Volver a la lista de clientes
      </Boton>
    </div>
  );
}
