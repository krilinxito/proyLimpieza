import { useState, type FormEvent } from 'react';
import { Aviso } from '../../../components/Aviso';
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
    return calcularSaldo({
      precioTotal: orden.precioTotal,
      precioFinal: precio,
      pagos: orden.pagos.map((p) => p.monto),
    });
  } catch {
    return null;
  }
}

/**
 * Entregar la ropa — SPEC-KRILINXI-009. Valida quien guarda (`api/entregasLocal`); esto
 * muestra lo que le contesta y, antes de escribir, pide confirmación diciendo cuánto queda
 * debiendo el cliente si queda algo.
 *
 * Si la boleta **ya está pagada** (lo pagado cubre su precio) no pide ningún monto — SPEC-KRILINXI-046:
 * ni el precio final ni cuánto paga ahora ni cómo paga. Un campo de dinero en una boleta sin deuda da a
 * entender que hay que escribir algo, y no hay nada que cobrar. En su lugar dice "Ya está todo pagado", y
 * la entrega se guarda con el precio de la boleta y sin pago final (ver `datosAEnviar`).
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

  // `orden.saldo` ya es precio de la boleta − pagos (la ropa todavía no tiene entrega): cero o menos, no hay nada que cobrar.
  const yaPagada = orden.saldo <= 0;
  const saldo = saldoConPrecio(orden, datos.precioFinal);

  /**
   * Lo que se manda a validar y guardar. En una boleta ya pagada, el precio final es el de la boleta y no hay pago
   * ni método, **aunque el estado del formulario diga otra cosa**: si algo se había escrito antes de que la boleta
   * quedara pagada (por ejemplo, un cobro que bajó de otra tablet), esos campos ya no se ven y no pueden contar.
   */
  const datosAEnviar: DatosEntrega = yaPagada
    ? { ...datos, precioFinal: aDecimal(orden.precioTotal), pagoFinal: '', metodoPago: null }
    : datos;

  async function revisar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!entregar.lista) return;
    setAviso(null);
    try {
      const resultado = await entregar.preparar(orden.id, datosAEnviar);
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
      const resultado = await entregar.registrar(orden.id, datosAEnviar);
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

  const debe =
    confirmar && confirmar.saldoDespues > 0 ? ` El cliente queda debiendo ${formatearBs(confirmar.saldoDespues)}.` : '';

  return (
    <form
      onSubmit={revisar}
      noValidate
      aria-label="Entregar la ropa"
      className="mt-2 grid gap-2 rounded-2xl border-2 border-marca bg-superficie p-5 shadow-sm"
    >
      <fieldset aria-describedby={errores.traeBoleta ? 'trae-boleta-error' : undefined}>
        <legend className="text-xl font-semibold text-texto">¿El cliente trae la boleta?</legend>
        <div className="mt-2 grid grid-cols-2 gap-3">
          {[
            { valor: true, texto: 'Trae la boleta' },
            { valor: false, texto: 'No trae la boleta' },
          ].map(({ valor, texto }) => (
            <label
              key={texto}
              className={`flex min-h-14 items-center gap-3 rounded-lg border-2 px-4 text-xl ${
                datos.traeBoleta === valor ? 'border-marca bg-marca-suave font-semibold' : 'border-borde bg-superficie'
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
          <p id="trae-boleta-error" className="mt-2 text-lg font-semibold text-peligro-texto">
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

      {yaPagada ? (
        <div className="mt-2">
          <Aviso tipo="exito">Ya está todo pagado: no hay nada que cobrar.</Aviso>
        </div>
      ) : (
        <>
          <CampoTexto
            etiqueta="Precio final (Bs)"
            value={datos.precioFinal}
            onChange={cambiar('precioFinal')}
            error={errores.precioFinal}
            inputMode="decimal"
            autoComplete="off"
          />
          <p className="text-xl text-texto" aria-live="polite">
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
        </>
      )}

      {aviso && (
        <div className="mt-4">
          <Aviso tipo="error">{aviso}</Aviso>
        </div>
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
