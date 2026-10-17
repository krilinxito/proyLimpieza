import { useState, type FormEvent } from 'react';
import { Aviso } from '../../../components/Aviso';
import { Boton } from '../../../components/Boton';
import { CampoTexto } from '../../../components/CampoTexto';
import { useClientes } from '../hooks/useClientes';
import { normalizarTelefono } from '../telefono';
import type { Cliente } from '../types';
import { FormularioAltaCliente } from './FormularioAltaCliente';
import { FormularioEditarCliente } from './FormularioEditarCliente';
import { TarjetaCliente } from './TarjetaCliente';

const FALTA_TELEFONO = 'Escribí el número de teléfono del cliente.';
const NO_SE_PUDO_BUSCAR = 'No se pudo buscar el cliente. Probá de nuevo y, si sigue pasando, avisale al encargado.';

/** En qué punto está el empleado. Un solo camino: buscar y, si no aparece, registrar. */
type Paso =
  | { tipo: 'inicio' }
  | { tipo: 'encontrado'; cliente: Cliente }
  | { tipo: 'no-encontrado'; telefono: string }
  | { tipo: 'alta'; telefono: string }
  | { tipo: 'registrado'; cliente: Cliente }
  | { tipo: 'telefono-ocupado'; cliente: Cliente }
  /** SPEC-KRILINXI-014: cambiando sus datos, y cómo terminó. */
  | { tipo: 'editando'; cliente: Cliente }
  | { tipo: 'editado'; cliente: Cliente; aviso: string };

type Props = {
  /**
   * Para usar la búsqueda dentro de otra tarea, como registrar ropa (SPEC-KRILINXI-006):
   * si viene, junto a cada cliente encontrado o registrado aparece "Es este cliente".
   */
  alElegir?: (cliente: Cliente) => void;
};

/**
 * Buscar un cliente por teléfono y, si no está, darlo de alta. Todo sobre la base local:
 * funciona igual con o sin internet (CLAUDE.md §6).
 */
export function PantallaClientes({ alElegir }: Props = {}) {
  const clientes = useClientes();
  const [telefono, setTelefono] = useState('');
  const [errorTelefono, setErrorTelefono] = useState<string | undefined>();
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [paso, setPaso] = useState<Paso>({ tipo: 'inicio' });

  async function buscar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!clientes.lista) return;
    setErrorGeneral(null);
    if (normalizarTelefono(telefono) === '') {
      setErrorTelefono(FALTA_TELEFONO);
      return;
    }
    setErrorTelefono(undefined);
    try {
      const cliente = await clientes.buscar(telefono);
      setPaso(cliente ? { tipo: 'encontrado', cliente } : { tipo: 'no-encontrado', telefono: telefono.trim() });
    } catch (error) {
      console.error('No se pudo buscar el cliente en la base local.', error);
      setErrorGeneral(NO_SE_PUDO_BUSCAR);
    }
  }

  return (
    <div className="mt-6">
      <form onSubmit={buscar} noValidate aria-label="Buscar cliente" className="grid gap-2">
        <CampoTexto
          etiqueta="Teléfono del cliente"
          value={telefono}
          onChange={setTelefono}
          error={errorTelefono}
          inputMode="tel"
          autoComplete="off"
        />
        <div className="mt-4">
          <Boton type="submit" ocupado={!clientes.lista} textoOcupado="Preparando…">
            Buscar cliente
          </Boton>
        </div>
      </form>

      {errorGeneral && (
        <div className="mt-4">
          <Aviso tipo="error">{errorGeneral}</Aviso>
        </div>
      )}

      <section aria-live="polite" className="mt-6">
        {paso.tipo === 'encontrado' && (
          <>
            <TarjetaCliente cliente={paso.cliente} />
            <Acciones
              cliente={paso.cliente}
              alElegir={alElegir}
              alEditar={() => setPaso({ tipo: 'editando', cliente: paso.cliente })}
            />
          </>
        )}

        {paso.tipo === 'no-encontrado' && (
          <>
            <p className="text-xl text-texto">No hay ningún cliente con el teléfono {paso.telefono}.</p>
            <div className="mt-4">
              <Boton onClick={() => setPaso({ tipo: 'alta', telefono: paso.telefono })}>Registrar cliente nuevo</Boton>
            </div>
          </>
        )}

        {paso.tipo === 'alta' && clientes.lista && (
          <FormularioAltaCliente
            telefonoInicial={paso.telefono}
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
              alElegir={alElegir}
              alEditar={() => setPaso({ tipo: 'editando', cliente: paso.cliente })}
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
              alElegir={alElegir}
              alEditar={() => setPaso({ tipo: 'editando', cliente: paso.cliente })}
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
              alElegir={alElegir}
              alEditar={() => setPaso({ tipo: 'editando', cliente: paso.cliente })}
            />
          </>
        )}
      </section>
    </div>
  );
}

/**
 * Lo que se puede hacer con un cliente en pantalla: "Cambiar datos" siempre
 * (SPEC-KRILINXI-014) y "Es este cliente" solo cuando la búsqueda se usa para elegir.
 */
function Acciones({
  cliente,
  alElegir,
  alEditar,
}: {
  cliente: Cliente;
  alElegir: Props['alElegir'];
  alEditar: () => void;
}) {
  return (
    <div className="mt-4 grid gap-3">
      {alElegir && <Boton onClick={() => alElegir(cliente)}>Es este cliente</Boton>}
      <Boton variante="secundario" onClick={alEditar}>
        Cambiar datos
      </Boton>
    </div>
  );
}
