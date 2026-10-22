import { useEffect, useId, useState, type FormEvent } from 'react';
import { Aviso } from '../../../components/Aviso';
import { Boton } from '../../../components/Boton';
import { Tarjeta } from '../../../components/Tarjeta';
import { CampoTexto } from '../../../components/CampoTexto';
import { hoyEnBolivia } from '../../../lib/diaDelNegocio';
import { ElegirClienteDeLaRopa } from '../../clientes/components/ElegirClienteDeLaRopa';
import type { Cliente, ClienteElegido } from '../../clientes/types';
import type { DatosRopa, ErroresRopa, ResultadoRegistro, RopaRegistrada } from '../types';
import { atajosDeFecha } from './atajosDeFecha';
import { ElegirMetodo } from './ElegirMetodo';

const NO_SE_GUARDO = 'No se pudo guardar la ropa. Probá de nuevo y, si sigue pasando, avisale al encargado.';

type Props = {
  /** El cliente ya elegido (desde su ficha, en el Mostrador), o null para elegirlo acá. */
  clienteInicial: Cliente | null;
  registrar: (datos: DatosRopa) => Promise<ResultadoRegistro>;
  alRegistrar: (ropa: RopaRegistrada) => void;
  /**
   * Avisa si hay algo escrito que se perdería al salir (SPEC-KRILINXI-048): quien tiene el botón de
   * volver pregunta antes de descartarlo. Un cliente que ya venía elegido no cuenta como escrito.
   */
  alCambiarEscrito?: (hayEscrito: boolean) => void;
};

/**
 * La ropa que deja un cliente, con el cliente arriba en el mismo formulario — SPEC-KRILINXI-034:
 * se elige con el buscador o se da de alta ahí mismo, y se guarda todo junto. Valida quien guarda
 * (`api/ordenesLocal`); este formulario muestra lo que le contesta, campo por campo.
 */
export function FormularioRopa({ clienteInicial, registrar, alRegistrar, alCambiarEscrito }: Props) {
  const [cliente, setCliente] = useState<ClienteElegido | null>(
    clienteInicial ? { tipo: 'existente', cliente: clienteInicial } : null,
  );
  // El cliente nuevo tenía el teléfono de uno que ya existe: se ofrece elegir a ese.
  const [ocupadoPor, setOcupadoPor] = useState<Cliente | null>(null);
  const [datos, setDatos] = useState<Omit<DatosRopa, 'cliente'>>({
    numeroBoleta: '',
    descripcion: '',
    precio: '',
    fechaEstimada: '',
    adelanto: '',
    metodoAdelanto: null,
  });
  // El adelanto se pregunta primero (SPEC-KRILINXI-048): sus campos aparecen solo si deja.
  const [dejaAdelanto, setDejaAdelanto] = useState(false);
  const grupoAdelanto = useId();
  const [errores, setErrores] = useState<ErroresRopa>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cambiar =
    (campo: 'numeroBoleta' | 'descripcion' | 'precio' | 'fechaEstimada' | 'adelanto') => (valor: string) =>
      setDatos((d) => ({ ...d, [campo]: valor }));

  const elClienteViene =
    clienteInicial !== null && cliente?.tipo === 'existente' && cliente.cliente.id === clienteInicial.id;
  const hayEscrito =
    (cliente !== null && !elClienteViene) ||
    [datos.numeroBoleta, datos.descripcion, datos.precio, datos.fechaEstimada, datos.adelanto].some((t) => t.trim() !== '');
  useEffect(() => {
    alCambiarEscrito?.(hayEscrito);
    return () => alCambiarEscrito?.(false);
  }, [hayEscrito, alCambiarEscrito]);

  function elegirAdelanto(deja: boolean) {
    setDejaAdelanto(deja);
    // Si no deja, lo escrito del adelanto no se guarda ni se queda esperando.
    if (!deja) {
      setDatos((d) => ({ ...d, adelanto: '', metodoAdelanto: null }));
      setErrores((e) => ({ ...e, adelanto: undefined, metodoAdelanto: undefined }));
    }
  }

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (guardando) return;
    if (dejaAdelanto && datos.adelanto.trim() === '') {
      setErrores({ adelanto: 'Escribí cuánto deja de adelanto, o elegí «No deja adelanto».' });
      return;
    }
    setGuardando(true);
    setErrorGeneral(null);
    try {
      const resultado = await registrar({ ...datos, cliente });
      if (resultado.tipo === 'invalida') {
        setErrores(resultado.errores);
        setGuardando(false);
        return;
      }
      if (resultado.tipo === 'telefono-ocupado') {
        setOcupadoPor(resultado.cliente);
        setErrores({});
        setGuardando(false);
        return;
      }
      alRegistrar(resultado.ropa);
    } catch (error) {
      console.error('No se pudo guardar la ropa en la base local.', error);
      setErrorGeneral(NO_SE_GUARDO);
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={guardar} noValidate aria-label="Datos de la ropa" className="mt-6 grid gap-2">
      <ElegirClienteDeLaRopa
        valor={cliente}
        alCambiar={(valor) => {
          setCliente(valor);
          setOcupadoPor(null);
        }}
        errores={errores}
        deshabilitado={guardando}
      />
      {ocupadoPor && (
        <div className="mt-4 grid gap-3">
          <Aviso tipo="advertencia">
            Ese teléfono ya es de {ocupadoPor.nombre}. Si es la misma persona, elegila y guardá la ropa a su nombre.
          </Aviso>
          <Boton
            variante="secundario"
            onClick={() => {
              setCliente({ tipo: 'existente', cliente: ocupadoPor });
              setOcupadoPor(null);
            }}
          >
            Es {ocupadoPor.nombre}
          </Boton>
        </div>
      )}

      <div className="mt-4">
        <Tarjeta titulo="La ropa">
          <CampoTexto
            etiqueta="Número de la boleta"
            value={datos.numeroBoleta}
            onChange={cambiar('numeroBoleta')}
            error={errores.numeroBoleta}
            autoComplete="off"
            // Con el cliente ya elegido se empieza por la boleta; si no, por el buscador del cliente.
            autoFocus={clienteInicial !== null}
          />
          <CampoTexto
            etiqueta="Qué ropa deja"
            value={datos.descripcion}
            onChange={cambiar('descripcion')}
            error={errores.descripcion}
            autoComplete="off"
          />
          <CampoTexto
            etiqueta="Precio (Bs)"
            value={datos.precio}
            onChange={cambiar('precio')}
            error={errores.precio}
            inputMode="decimal"
            autoComplete="off"
          />
          <div role="group" aria-label="Para cuándo, en un toque" className="mt-4 flex flex-wrap gap-3">
            {atajosDeFecha(hoyEnBolivia()).map(({ texto, fecha }) => (
              <Boton key={texto} variante="secundario" tamano="compacto" onClick={() => cambiar('fechaEstimada')(fecha)}>
                {texto}
              </Boton>
            ))}
          </div>
          <CampoTexto
            etiqueta="Para cuándo estará lista (si se sabe)"
            type="date"
            value={datos.fechaEstimada}
            onChange={cambiar('fechaEstimada')}
            error={errores.fechaEstimada}
          />
        </Tarjeta>
      </div>

      <div className="mt-4">
        <Tarjeta titulo="Adelanto">
          <fieldset>
            <legend className="text-xl font-semibold text-texto">¿Deja adelanto?</legend>
            <div className="mt-2 grid grid-cols-2 gap-3">
              {[
                { deja: false, texto: 'No deja adelanto' },
                { deja: true, texto: 'Deja adelanto' },
              ].map(({ deja, texto }) => (
                <label
                  key={texto}
                  className={`flex min-h-14 items-center gap-3 rounded-lg border-2 px-4 text-xl ${
                    dejaAdelanto === deja ? 'border-marca bg-marca-suave font-semibold' : 'border-borde bg-superficie'
                  }`}
                >
                  <input
                    type="radio"
                    name={grupoAdelanto}
                    className="size-6"
                    checked={dejaAdelanto === deja}
                    onChange={() => elegirAdelanto(deja)}
                  />
                  {texto}
                </label>
              ))}
            </div>
          </fieldset>
          {dejaAdelanto && (
            <>
              <CampoTexto
                etiqueta="Cuánto deja de adelanto (Bs)"
                value={datos.adelanto}
                onChange={cambiar('adelanto')}
                error={errores.adelanto}
                inputMode="decimal"
                autoComplete="off"
              />
              <ElegirMetodo
                value={datos.metodoAdelanto}
                onChange={(metodo) => setDatos((d) => ({ ...d, metodoAdelanto: metodo }))}
                error={errores.metodoAdelanto}
              />
            </>
          )}
        </Tarjeta>
      </div>

      {errorGeneral && (
        <div className="mt-4">
          <Aviso tipo="error">{errorGeneral}</Aviso>
        </div>
      )}
      <div className="mt-6">
        <Boton type="submit" ocupado={guardando} textoOcupado="Guardando…">
          Guardar
        </Boton>
      </div>
    </form>
  );
}
