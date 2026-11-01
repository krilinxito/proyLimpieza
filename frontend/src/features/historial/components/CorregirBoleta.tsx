import { useState, type FormEvent } from 'react';
import { AvisoResultado, AvisoSinRed, TEXTOS_ADMIN } from '../../../components/AvisosAdmin';
import { Aviso } from '../../../components/Aviso';
import { Boton } from '../../../components/Boton';
import { CampoTexto, CampoTextoLargo } from '../../../components/CampoTexto';
import { Tarjeta } from '../../../components/Tarjeta';
import { useEnLinea } from '../../../hooks/useEnLinea';
import { formatearBs } from '../../../lib/money';
import { CamposDeRenglones } from '../../ordenes/components/CamposDeRenglones';
import { ListaDeRenglones } from '../../ordenes/components/ListaDeRenglones';
import { claveCampo, renglonNuevo, totalEscrito, type CampoRenglon } from '../../ordenes/renglones';
import { useSucursales } from '../../sucursales/hooks/useSucursales';
import {
  MENSAJES_CORRECCION,
  datosIniciales,
  revisarCorreccion,
  type DatosCorreccion,
  type ErroresCorreccion,
} from '../correccion';
import { guardarCorreccion } from '../hooks/useCorreccion';
import type { BoletaListada, OrigenDeLaBoleta } from '../types';

type Props = {
  boleta: BoletaListada;
  origen: OrigenDeLaBoleta;
  /** Se guardó: la pantalla vuelve al historial y lo pide de nuevo. */
  alGuardar: () => void;
  alCancelar: () => void;
};

/**
 * El admin corrige una boleta — SPEC-KRILINXI-071: el número, la sucursal, cuándo entró, para cuándo estará y las prendas
 * (y con ellas el total). Guarda directo a la API (`guardarCorreccion`), nunca por la cola, y sin internet no deja
 * guardar (`useEnLinea`), como Personal y Sucursales.
 *
 * Los cargos que se sumaron al entregar se muestran, pero no se tocan: se corrigen junto con el cobro y la entrega
 * (otra spec). Una boleta de antes de las prendas (SPEC-KRILINXI-068) tiene "Qué deja" y "Precio" escritos a mano, y
 * puede pasar a tener prendas con "Agregar una prenda".
 */
export function CorregirBoleta({ boleta, origen, alGuardar, alCancelar }: Props) {
  const enLinea = useEnLinea();
  // Las abiertas, y la suya aunque esté cerrada: que se vea dónde está.
  const sucursales = (useSucursales() ?? []).filter((s) => s.activa || s.id === origen.sucursalId);
  const [datos, setDatos] = useState<DatosCorreccion>(() => datosIniciales(boleta, origen));
  const [errores, setErrores] = useState<ErroresCorreccion>({});
  const [aviso, setAviso] = useState<{ tipo: 'bien' | 'mal'; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargos = boleta.renglones.filter((r) => r.momento === 'ENTREGA');
  const conPrendas = datos.prendas.length > 0;
  const cambiar = <K extends keyof DatosCorreccion>(campo: K) => (valor: DatosCorreccion[K]) =>
    setDatos((d) => ({ ...d, [campo]: valor }));
  const errorDeRenglon = (clave: string, campo: CampoRenglon) => errores[claveCampo(clave, campo)];

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    setAviso(null);
    const revision = revisarCorreccion(boleta, origen, datos);
    if (revision.tipo === 'invalida') {
      setErrores(revision.errores);
      return;
    }
    setErrores({});
    if (revision.tipo === 'sin-cambios') {
      setAviso({ tipo: 'bien', texto: MENSAJES_CORRECCION.sinCambios });
      return;
    }
    setGuardando(true);
    const resultado = await guardarCorreccion(boleta.id, revision.cuerpo);
    setGuardando(false);
    if (resultado.tipo === 'guardado') alGuardar();
    else setAviso({ tipo: 'mal', texto: resultado.tipo === 'rechazado' ? resultado.mensaje : TEXTOS_ADMIN.sinConexion });
  }

  return (
    <div className="mt-6">
      <Tarjeta titulo={`Corregir la boleta ${boleta.numeroBoleta}`}>
        <p className="text-xl text-texto-suave">
          {boleta.clienteNombre} · {boleta.clienteTelefono}
        </p>
        {!enLinea && <AvisoSinRed />}
        <form noValidate onSubmit={guardar} className="mt-4 grid gap-4">
          <CampoTexto
            etiqueta="Número de boleta"
            value={datos.numeroBoleta}
            onChange={cambiar('numeroBoleta')}
            error={errores.numeroBoleta}
            autoComplete="off"
          />

          <fieldset>
            <legend className="text-xl font-semibold text-texto">¿En qué sucursal quedó?</legend>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {sucursales.map((s) => (
                <label
                  key={s.id}
                  className={`flex min-h-14 items-center gap-3 rounded-lg border-2 px-4 text-xl ${
                    datos.sucursalId === s.id ? 'border-marca bg-marca-suave font-semibold' : 'border-borde bg-superficie'
                  }`}
                >
                  <input
                    type="radio"
                    name="sucursal-de-la-boleta"
                    className="size-6"
                    checked={datos.sucursalId === s.id}
                    onChange={() => cambiar('sucursalId')(s.id)}
                  />
                  {s.nombre}
                  {!s.activa && ' (cerrada)'}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-x-3 sm:grid-cols-2">
            <CampoTexto etiqueta="Día que entró" type="date" value={datos.dia} onChange={cambiar('dia')} error={errores.dia} />
            <CampoTexto etiqueta="Hora" type="time" value={datos.hora} onChange={cambiar('hora')} error={errores.hora} />
          </div>
          <CampoTexto
            etiqueta="Para cuándo estará lista"
            type="date"
            value={datos.fechaEstimada}
            onChange={cambiar('fechaEstimada')}
          />

          <section aria-label="Lo que dejó">
            <h3 className="text-xl font-semibold text-texto">Lo que dejó</h3>
            {conPrendas ? (
              <div className="mt-2">
                <CamposDeRenglones
                  renglones={datos.prendas}
                  alCambiar={cambiar('prendas')}
                  nombre="Prenda"
                  textoAgregar="Agregar otra prenda"
                  puedeQuedarVacia
                  errorDe={errorDeRenglon}
                  textoTotal="Total"
                />
              </div>
            ) : (
              <div className="mt-2 grid gap-4">
                <CampoTextoLargo
                  etiqueta="Qué deja"
                  value={datos.descripcion}
                  onChange={cambiar('descripcion')}
                  error={errores.descripcion}
                />
                <CampoTexto
                  etiqueta="Precio (Bs)"
                  inputMode="decimal"
                  value={datos.precio}
                  onChange={cambiar('precio')}
                  error={errores.precio}
                  autoComplete="off"
                />
                <div>
                  <Boton variante="secundario" onClick={() => cambiar('prendas')([renglonNuevo()])}>
                    Agregar una prenda
                  </Boton>
                </div>
              </div>
            )}
            {conPrendas && errores.precio && (
              <div className="mt-3">
                <Aviso tipo="error">{errores.precio}</Aviso>
              </div>
            )}
          </section>

          {cargos.length > 0 && (
            <section aria-label="Cargos al entregar">
              <ListaDeRenglones renglones={cargos} />
              <p className="mt-2 text-lg text-texto-suave">
                Los cargos que se sumaron al entregar no se cambian aquí: se corrigen junto con el cobro y la entrega.
              </p>
            </section>
          )}

          {boleta.precioFinal !== null && conPrendas && totalEscrito(datos.prendas) !== boleta.precioTotal && (
            <Aviso tipo="informacion">
              Esta ropa ya salió: cambiar las prendas no cambia lo que se cobró al entregar ({formatearBs(boleta.precioFinal)}).
            </Aviso>
          )}

          <AvisoResultado aviso={aviso} />

          <div className="flex flex-wrap gap-3">
            <Boton type="submit" disabled={!enLinea || guardando}>
              {guardando ? 'Guardando…' : 'Guardar la corrección'}
            </Boton>
            <Boton variante="navegacion" onClick={alCancelar}>
              Volver sin guardar
            </Boton>
          </div>
        </form>
      </Tarjeta>
    </div>
  );
}
