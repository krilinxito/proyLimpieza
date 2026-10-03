import { useState, type FormEvent } from 'react';
import { Boton } from '../../../components/Boton';
import { CampoTexto } from '../../../components/CampoTexto';
import { useClientes } from '../hooks/useClientes';
import { normalizarTelefono } from '../telefono';
import type { Cliente } from '../types';
import { FormularioAltaCliente } from './FormularioAltaCliente';
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
  | { tipo: 'telefono-ocupado'; cliente: Cliente };

/**
 * Buscar un cliente por teléfono y, si no está, darlo de alta. Todo sobre la base local:
 * funciona igual con o sin internet (CLAUDE.md §6).
 */
export function PantallaClientes() {
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
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-xl text-red-800">
          {errorGeneral}
        </p>
      )}

      <section aria-live="polite" className="mt-6">
        {paso.tipo === 'encontrado' && <TarjetaCliente cliente={paso.cliente} />}

        {paso.tipo === 'no-encontrado' && (
          <>
            <p className="text-xl text-slate-900">No hay ningún cliente con el teléfono {paso.telefono}.</p>
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
            <p role="status" className="rounded-lg bg-green-50 p-4 text-xl text-green-900">
              Cliente registrado.
            </p>
            <TarjetaCliente cliente={paso.cliente} />
          </>
        )}

        {paso.tipo === 'telefono-ocupado' && (
          <>
            <p role="alert" className="rounded-lg bg-amber-50 p-4 text-xl text-amber-900">
              Ese teléfono ya está registrado a nombre de {paso.cliente.nombre}. No hace falta registrarlo otra vez.
            </p>
            <TarjetaCliente cliente={paso.cliente} />
          </>
        )}
      </section>
    </div>
  );
}
