import { useState, type FormEvent } from 'react';
import { Aviso } from '../../../components/Aviso';
import { Boton } from '../../../components/Boton';
import { CampoTextoLargo } from '../../../components/CampoTexto';
import { ModalConfirmacion } from '../../../components/ModalConfirmacion';
import { formatearBs } from '../../../lib/money';
import type { OrdenVista } from '../../ordenes/types';
import { useEntregar } from '../hooks/useEntregar';
import type { DatosReembolso, EntregaLista, ErroresReembolso } from '../types';
import { CamposDeRetiro } from './CamposDeRetiro';

const NO_SE_GUARDO = 'No se pudo guardar la entrega. Prueba de nuevo y, si sigue pasando, avísale al encargado.';

type Props = {
  orden: OrdenVista;
  alEntregar: (entrega: EntregaLista) => void;
  alCancelar: () => void;
};

/**
 * Entregar la ropa sin cobrar lo que falta — SPEC-KRILINXI-070. Es la salida para cuando el cliente no paga (se enojó, hubo un
 * problema): la ropa sale, la boleta pasa a REEMBOLSADO y queda anotado el motivo y quién lo hizo, para que el administrador lo
 * revise. No pide ningún monto: la entrega se guarda con lo que el cliente ya pagó.
 *
 * Cualquiera lo puede registrar, pero no es una salida cómoda: pide un motivo escrito y una confirmación que dice cuánto no se va a
 * cobrar y que no se puede deshacer. Valida quien guarda (`api/entregasLocal`); esto muestra lo que le contesta.
 */
export function FormularioReembolso({ orden, alEntregar, alCancelar }: Props) {
  const entregar = useEntregar();
  const [datos, setDatos] = useState<DatosReembolso>({
    traeBoleta: null,
    retiradoPorNombre: '',
    retiradoPorCarnet: '',
    motivoReembolso: '',
  });
  const [errores, setErrores] = useState<ErroresReembolso>({});
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<EntregaLista | null>(null);

  async function revisar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!entregar.lista) return;
    setAviso(null);
    try {
      const resultado = await entregar.prepararSinCobrar(orden.id, datos);
      if (resultado.tipo === 'invalida') setErrores(resultado.errores);
      else if (resultado.tipo === 'no-se-puede') setAviso(resultado.mensaje);
      else {
        setErrores({});
        setConfirmar(resultado.entrega);
      }
    } catch (error) {
      console.error('No se pudo revisar la entrega sin cobrar.', error);
      setAviso(NO_SE_GUARDO);
    }
  }

  async function guardar() {
    if (!entregar.lista) return;
    try {
      const resultado = await entregar.registrarSinCobrar(orden.id, datos);
      setConfirmar(null);
      if (resultado.tipo === 'lista') alEntregar(resultado.entrega);
      else if (resultado.tipo === 'no-se-puede') setAviso(resultado.mensaje);
      else setErrores(resultado.errores);
    } catch (error) {
      console.error('No se pudo guardar la entrega sin cobrar en la base local.', error);
      setConfirmar(null);
      setAviso(NO_SE_GUARDO);
    }
  }

  const noCobrado = confirmar?.reembolso?.noCobrado ?? orden.saldo;

  return (
    <form
      onSubmit={revisar}
      noValidate
      aria-label="Entregar sin cobrar"
      className="mt-2 grid gap-2 rounded-2xl border-2 border-peligro bg-superficie p-5 shadow-sm"
    >
      <Aviso tipo="advertencia">
        Vas a entregar la ropa sin cobrar los {formatearBs(orden.saldo)} que faltan. Queda anotado por qué y quién lo hizo, para
        que el administrador lo revise.
      </Aviso>

      <CamposDeRetiro
        traeBoleta={datos.traeBoleta}
        nombre={datos.retiradoPorNombre}
        carnet={datos.retiradoPorCarnet}
        alElegirBoleta={(traeBoleta) => setDatos((d) => ({ ...d, traeBoleta }))}
        alCambiarNombre={(valor) => setDatos((d) => ({ ...d, retiradoPorNombre: valor }))}
        alCambiarCarnet={(valor) => setDatos((d) => ({ ...d, retiradoPorCarnet: valor }))}
        errores={errores}
      />

      <CampoTextoLargo
        etiqueta="¿Por qué se entrega sin cobrar?"
        value={datos.motivoReembolso}
        onChange={(valor) => setDatos((d) => ({ ...d, motivoReembolso: valor }))}
        error={errores.motivoReembolso}
        autoComplete="off"
      />

      {aviso && (
        <div className="mt-4">
          <Aviso tipo="error">{aviso}</Aviso>
        </div>
      )}
      <div className="mt-4 grid gap-3">
        <Boton type="submit" variante="peligro" ocupado={!entregar.lista} textoOcupado="Preparando…">
          Entregar sin cobrar
        </Boton>
        <Boton variante="secundario" onClick={alCancelar}>
          Cancelar
        </Boton>
      </div>

      <ModalConfirmacion
        abierto={confirmar !== null}
        titulo={`¿Entregar la ropa de la boleta ${orden.numeroBoleta} sin cobrar?`}
        mensaje={`No se van a cobrar ${formatearBs(noCobrado)}. Queda anotado el motivo y quién lo hizo. Esta acción no se puede deshacer.`}
        textoConfirmar="Sí, entregar sin cobrar"
        peligroso
        onConfirmar={guardar}
        onCancelar={() => setConfirmar(null)}
      />
    </form>
  );
}
