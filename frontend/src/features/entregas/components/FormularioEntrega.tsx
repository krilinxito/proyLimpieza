import { useState, type FormEvent } from 'react';
import { Boton } from '../../../components/Boton';
import { CampoTexto } from '../../../components/CampoTexto';
import { ModalConfirmacion } from '../../../components/ModalConfirmacion';
import { aDecimal, formatearBs, parsearMonto } from '../../../lib/money';
import { ElegirMetodo } from '../../ordenes/components/ElegirMetodo';
import type { OrdenVista } from '../../ordenes/types';
import { calcularSaldo } from '../../pagos/saldo';
import { useEntregar } from '../hooks/useEntregar';
import type { DatosEntrega, EntregaLista, ErroresEntrega } from '../types';

const NO_SE_GUARDO = 'No se pudo guardar la entrega. Probá de nuevo y, si sigue pasando, avisale al encargado.';

type Props = {
  orden: OrdenVista;
  alEntregar: (entrega: EntregaLista) => void;
  alCancelar: () => void;
};

/** Lo que falta pagar con el precio final escrito, mientras se escribe. Null si no es un monto. */
function saldoConPrecio(orden: OrdenVista, precioFinal: string): number | null {
  try {
    const precio = parsearMonto(precioFinal);
    return calcularSaldo({ precioTotal: orden.precioTotal, precioFinal: precio, pagos: orden.pagos.map((p) => p.monto) });
  } catch {
    return null;
  }
}

/**
 * Entregar la ropa — SPEC-KRILINXI-009. Valida quien guarda (`api/entregasLocal`); esto
 * muestra lo que le contesta y, antes de escribir, pide confirmación diciendo cuánto queda
 * debiendo el cliente si queda algo.
 */
export function FormularioEntrega({ orden, alEntregar, alCancelar }: Props) {
  const entregar = useEntregar();
  const [datos, setDatos] = useState<DatosEntrega>({
    traeBoleta: null,
    retiradoPorNombre: '',
    retiradoPorCarnet: '',
    // El precio de la orden, en el formato que se puede volver a leer ("50.00").
    precioFinal: aDecimal(orden.precioTotal),
    pagoFinal: '',
    metodoPago: null,
  });
  const [errores, setErrores] = useState<ErroresEntrega>({});
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<EntregaLista | null>(null);

  const cambiar = (campo: 'retiradoPorNombre' | 'retiradoPorCarnet' | 'precioFinal' | 'pagoFinal') => (valor: string) =>
    setDatos((d) => ({ ...d, [campo]: valor }));

  const saldo = saldoConPrecio(orden, datos.precioFinal);

  async function revisar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!entregar.lista) return;
    setAviso(null);
    try {
      const resultado = await entregar.preparar(orden.id, datos);
      if (resultado.tipo === 'invalida') setErrores(resultado.errores);
      else if (resultado.tipo === 'no-se-puede') setAviso(resultado.mensaje);
      else {
        setErrores({});
        setConfirmar(resultado.entrega);
      }
    } catch (error) {
      console.error('No se pudo revisar la entrega.', error);
      setAviso(NO_SE_GUARDO);
    }
  }

  async function guardar() {
    if (!entregar.lista) return;
    try {
      const resultado = await entregar.registrar(orden.id, datos);
      setConfirmar(null);
      if (resultado.tipo === 'lista') alEntregar(resultado.entrega);
      else if (resultado.tipo === 'no-se-puede') setAviso(resultado.mensaje);
      else setErrores(resultado.errores);
    } catch (error) {
      console.error('No se pudo guardar la entrega en la base local.', error);
      setConfirmar(null);
      setAviso(NO_SE_GUARDO);
    }
  }

  const debe = confirmar && confirmar.saldoDespues > 0 ? ` El cliente queda debiendo ${formatearBs(confirmar.saldoDespues)}.` : '';

  return (
    <form onSubmit={revisar} noValidate aria-label="Entregar la ropa" className="mt-2 grid gap-2 rounded-lg border-2 border-sky-700 p-4">
      <fieldset aria-describedby={errores.traeBoleta ? 'trae-boleta-error' : undefined}>
        <legend className="text-xl font-semibold text-slate-900">¿El cliente trae la boleta?</legend>
        <div className="mt-2 grid grid-cols-2 gap-3">
          {[
            { valor: true, texto: 'Trae la boleta' },
            { valor: false, texto: 'No trae la boleta' },
          ].map(({ valor, texto }) => (
            <label
              key={texto}
              className={`flex min-h-14 items-center gap-3 rounded-lg border-2 px-4 text-xl ${
                datos.traeBoleta === valor ? 'border-sky-700 bg-sky-50' : 'border-slate-400 bg-white'
              }`}
            >
              <input
                type="radio"
                name="trae-boleta"
                className="size-6"
                checked={datos.traeBoleta === valor}
                onChange={() => setDatos((d) => ({ ...d, traeBoleta: valor }))}
              />
              {texto}
            </label>
          ))}
        </div>
        {errores.traeBoleta && (
          <p id="trae-boleta-error" className="mt-2 text-lg text-red-700">
            {errores.traeBoleta}
          </p>
        )}
      </fieldset>

      {datos.traeBoleta === false && (
        <>
          <CampoTexto
            etiqueta="Nombre de quien retira"
            value={datos.retiradoPorNombre}
            onChange={cambiar('retiradoPorNombre')}
            error={errores.retiradoPorNombre}
            autoComplete="off"
          />
          <CampoTexto
            etiqueta="Carnet de quien retira"
            value={datos.retiradoPorCarnet}
            onChange={cambiar('retiradoPorCarnet')}
            error={errores.retiradoPorCarnet}
            autoComplete="off"
          />
        </>
      )}

      <CampoTexto
        etiqueta="Precio final (Bs)"
        value={datos.precioFinal}
        onChange={cambiar('precioFinal')}
        error={errores.precioFinal}
        inputMode="decimal"
        autoComplete="off"
      />
      <p className="text-xl text-slate-800" aria-live="polite">
        {saldo === null ? ' ' : saldo > 0 ? `Falta pagar ${formatearBs(saldo)}.` : 'No falta pagar nada.'}
      </p>

      <CampoTexto
        etiqueta="Cuánto paga ahora (Bs, si paga)"
        value={datos.pagoFinal}
        onChange={cambiar('pagoFinal')}
        error={errores.pagoFinal}
        inputMode="decimal"
        autoComplete="off"
      />
      {datos.pagoFinal.trim() !== '' && (
        <ElegirMetodo
          value={datos.metodoPago}
          onChange={(metodo) => setDatos((d) => ({ ...d, metodoPago: metodo }))}
          error={errores.metodoPago}
          pregunta="¿Cómo paga?"
        />
      )}

      {aviso && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-xl text-red-800">
          {aviso}
        </p>
      )}
      <div className="mt-4 grid gap-3">
        <Boton type="submit" ocupado={!entregar.lista} textoOcupado="Preparando…">
          Entregar
        </Boton>
        <Boton variante="secundario" onClick={alCancelar}>
          Cancelar
        </Boton>
      </div>

      <ModalConfirmacion
        abierto={confirmar !== null}
        titulo={`¿Entregar la ropa de la boleta ${orden.numeroBoleta}?`}
        mensaje={`Esta acción no se puede deshacer.${debe}`}
        textoConfirmar="Sí, entregar"
        onConfirmar={guardar}
        onCancelar={() => setConfirmar(null)}
      />
    </form>
  );
}
