import { useState, type FormEvent } from 'react';
import { Aviso } from '../../../components/Aviso';
import { Boton } from '../../../components/Boton';
import { CampoTexto } from '../../../components/CampoTexto';
import { ModalConfirmacion } from '../../../components/ModalConfirmacion';
import { aDecimal, formatearBs, parsearMonto } from '../../../lib/money';
import { CamposDeRenglones } from '../../ordenes/components/CamposDeRenglones';
import { ElegirMetodo } from '../../ordenes/components/ElegirMetodo';
import { claveCampo, sumaDeCargos, totalEscrito, type RenglonEscrito } from '../../ordenes/renglones';
import type { OrdenVista } from '../../ordenes/types';
import { calcularSaldo } from '../../pagos/saldo';
import { useEntregar } from '../hooks/useEntregar';
import type { DatosEntrega, EntregaLista, ErroresEntrega } from '../types';
import { CamposDeRetiro } from './CamposDeRetiro';

const NO_SE_GUARDO = 'No se pudo guardar la entrega. Prueba de nuevo y, si sigue pasando, avísale al encargado.';

type Props = {
  orden: OrdenVista;
  alEntregar: (entrega: EntregaLista) => void;
  alCancelar: () => void;
};

/**
 * El precio final con los cargos que se van escribiendo — SPEC-KRILINXI-068: el de la boleta, más los cargos que ya tenga y
 * los nuevos que ya tienen cantidad y precio. Es lo que muestra el formulario; el que se guarda lo calcula `entregasLocal`.
 */
function precioConCargos(orden: OrdenVista, cargos: readonly RenglonEscrito[]): number {
  return orden.precioTotal + sumaDeCargos(orden.renglones) + totalEscrito(cargos);
}

/** Lo que falta pagar con ese precio final. */
function saldoConPrecio(orden: OrdenVista, precioFinal: number): number {
  return calcularSaldo({ precioTotal: orden.precioTotal, precioFinal, pagos: orden.pagos.map((p) => p.monto) });
}

/** Lo que dice el renglón del saldo: cuánto falta, y cuánto faltaría después de lo que se escribió en "Cuánto paga ahora". */
function mensajeDeSaldo(saldo: number, pagoAhora: number): string {
  if (saldo <= 0) return 'No falta pagar nada.';
  if (pagoAhora <= 0) return `Falta pagar ${formatearBs(saldo)}.`;
  const despues = saldo - pagoAhora;
  return despues > 0 ? `Con este cobro todavía falta pagar ${formatearBs(despues)}.` : 'Con este cobro queda todo pagado.';
}

/** El monto escrito en centavos; vacío o mal escrito, cero. */
function montoOCero(texto: string): number {
  try {
    return texto.trim() === '' ? 0 : parsearMonto(texto);
  } catch {
    return 0;
  }
}

/** Lo que arranca escrito en "Cuánto paga ahora": todo el saldo, en el formato de siempre ("30.00"); vacío si no falta nada. */
function pagoSugerido(saldo: number): string {
  return saldo > 0 ? aDecimal(saldo) : '';
}

/**
 * Entregar la ropa — SPEC-KRILINXI-009. Valida quien guarda (`api/entregasLocal`); esto
 * muestra lo que le contesta y, antes de escribir, pide confirmación.
 *
 * Desde SPEC-KRILINXI-056 la ropa solo sale con la boleta pagada por completo: el botón "Entregar" se
 * habilita cuando lo que se paga ahora cubre lo que falta, y el texto de arriba dice cuánto falta todavía.
 *
 * Desde SPEC-KRILINXI-068 el precio final no se escribe: "Agregar un cargo" suma renglones (un recargo por
 * almacenamiento, con la descripción que el empleado quiera), y el precio final es el de la boleta más ellos. Al
 * entregar solo se puede sumar: para no cobrar lo que falta está el reembolso (SPEC-KRILINXI-070).
 *
 * Desde SPEC-KRILINXI-069 "Cuánto paga ahora" arranca con lo que falta (`pagoSugerido`) y sigue al saldo cuando se agrega o
 * se quita un cargo, mientras el empleado no lo haya tocado. Apenas escribe (o borra) algo, ese texto es suyo y no se pisa:
 * el formulario no lo corrige, y "Entregar" sigue apagado hasta que cubra lo que falta. "¿Cómo paga?" no se preselecciona.
 *
 * Si la boleta **ya está pagada** (lo pagado cubre su precio) no pide ningún monto — SPEC-KRILINXI-046:
 * ni cargos ni cuánto paga ahora ni cómo paga. Un campo de dinero en una boleta sin deuda da a
 * entender que hay que escribir algo, y no hay nada que cobrar. En su lugar dice "Ya está todo pagado", y
 * la entrega se guarda con el precio de la boleta y sin pago final (ver `datosAEnviar`).
 */
export function FormularioEntrega({ orden, alEntregar, alCancelar }: Props) {
  const entregar = useEntregar();
  const [datos, setDatos] = useState<DatosEntrega>({
    traeBoleta: null,
    retiradoPorNombre: '',
    retiradoPorCarnet: '',
    // Sin cargos: el precio final arranca siendo el de la boleta.
    cargos: [],
    pagoFinal: '',
    metodoPago: null,
  });
  // Lo que el empleado escribió en "Cuánto paga ahora"; `null` mientras no lo tocó (y entonces vale el saldo).
  const [pagoEscrito, setPagoEscrito] = useState<string | null>(null);
  const [errores, setErrores] = useState<ErroresEntrega>({});
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<EntregaLista | null>(null);

  const cambiar = (campo: 'retiradoPorNombre' | 'retiradoPorCarnet') => (valor: string) =>
    setDatos((d) => ({ ...d, [campo]: valor }));

  // `orden.saldo` ya es precio de la boleta − pagos (la ropa todavía no tiene entrega): cero o menos, no hay nada que cobrar.
  const yaPagada = orden.saldo <= 0;
  const precioFinal = precioConCargos(orden, datos.cargos);
  const saldo = saldoConPrecio(orden, precioFinal);
  // Lo que muestra "Cuánto paga ahora": lo escrito, o mientras no se tocó, todo lo que falta (SPEC-KRILINXI-069).
  const pagoFinal = pagoEscrito ?? pagoSugerido(saldo);
  // Lo que falta cobrar después del pago escrito (SPEC-KRILINXI-056). Un pago vacío o mal escrito cuenta como cero.
  const pagoAhora = montoOCero(pagoFinal);
  // En una boleta ya pagada no hay nada que cobrar; si no, hasta que lo escrito no cubra lo que falta, no se entrega.
  const faltaCobrar = !yaPagada && saldo - pagoAhora > 0;

  /**
   * Lo que se manda a validar y guardar. En una boleta ya pagada no hay cargos, ni pago ni método, **aunque el estado
   * del formulario diga otra cosa**: si algo se había escrito antes de que la boleta quedara pagada (por ejemplo, un
   * cobro que bajó de otra tablet), esos campos ya no se ven y no pueden contar.
   */
  const datosAEnviar: DatosEntrega = yaPagada ? { ...datos, cargos: [], pagoFinal: '', metodoPago: null } : { ...datos, pagoFinal };

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

  return (
    <form
      onSubmit={revisar}
      noValidate
      aria-label="Entregar la ropa"
      className="mt-2 grid gap-2 rounded-2xl border-2 border-marca bg-superficie p-5 shadow-sm"
    >
      <CamposDeRetiro
        traeBoleta={datos.traeBoleta}
        nombre={datos.retiradoPorNombre}
        carnet={datos.retiradoPorCarnet}
        alElegirBoleta={(traeBoleta) => setDatos((d) => ({ ...d, traeBoleta }))}
        alCambiarNombre={cambiar('retiradoPorNombre')}
        alCambiarCarnet={cambiar('retiradoPorCarnet')}
        errores={errores}
      />

      {yaPagada ? (
        <div className="mt-2">
          <Aviso tipo="exito">Ya está todo pagado: no hay nada que cobrar.</Aviso>
        </div>
      ) : (
        <>
          {/* Los cargos al entregar (SPEC-KRILINXI-068): renglones que se suman al precio de la boleta. */}
          <h3 className="mt-4 text-xl font-semibold text-texto">Cargos al entregar (si hay)</h3>
          <CamposDeRenglones
            renglones={datos.cargos}
            alCambiar={(cargos) => setDatos((d) => ({ ...d, cargos }))}
            nombre="Cargo"
            textoAgregar="Agregar un cargo"
            textoTotal="Cargos"
            puedeQuedarVacia
            errorDe={(clave, campo) => errores[claveCampo(clave, campo)]}
          />
          {errores.cargos && <Aviso tipo="error">{errores.cargos}</Aviso>}
          <p className="mt-2 text-xl text-texto">
            Precio final: <span className="font-semibold">{formatearBs(precioFinal)}</span>
          </p>
          <p className="text-xl text-texto" aria-live="polite">
            {mensajeDeSaldo(saldo, pagoAhora)}
          </p>

          <CampoTexto
            etiqueta="Cuánto paga ahora (Bs, si paga)"
            value={pagoFinal}
            onChange={setPagoEscrito}
            error={errores.pagoFinal}
            inputMode="decimal"
            autoComplete="off"
          />
          {pagoFinal.trim() !== '' && (
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
        <Boton type="submit" ocupado={!entregar.lista} textoOcupado="Preparando…" disabled={faltaCobrar}>
          Entregar
        </Boton>
        <Boton variante="secundario" onClick={alCancelar}>
          Cancelar
        </Boton>
      </div>

      <ModalConfirmacion
        abierto={confirmar !== null}
        titulo={`¿Entregar la ropa de la boleta ${orden.numeroBoleta}?`}
        mensaje="Esta acción no se puede deshacer."
        textoConfirmar="Sí, entregar"
        onConfirmar={guardar}
        onCancelar={() => setConfirmar(null)}
      />
    </form>
  );
}
