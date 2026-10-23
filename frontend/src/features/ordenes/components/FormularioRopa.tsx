import { useEffect, useId, useState, type FormEvent } from 'react';
import { Aviso } from '../../../components/Aviso';
import { Boton } from '../../../components/Boton';
import { CampoTexto, CampoTextoLargo } from '../../../components/CampoTexto';
import { Tarjeta, type EstadoDeTarjeta } from '../../../components/Tarjeta';
import { hoyEnBolivia } from '../../../lib/diaDelNegocio';
import { ElegirClienteDeLaRopa } from '../../clientes/components/ElegirClienteDeLaRopa';
import type { Cliente, ClienteElegido } from '../../clientes/types';
import { useRevisionEnVivo } from '../hooks/useRevisionEnVivo';
import type { DatosRopa, ErroresRopa, ResultadoRegistro, RevisionDeRopa, RopaRegistrada } from '../types';
import { atajosDeFecha } from './atajosDeFecha';
import { ElegirMetodo } from './ElegirMetodo';

const NO_SE_GUARDO = 'No se pudo guardar la ropa. Prueba de nuevo y, si sigue pasando, avísale al encargado.';
const FALTA_ADELANTO = 'Escribe cuánto deja de adelanto, o elige «No deja adelanto».';

/** Los datos que se escriben en este formulario, uno por uno: de cada uno se sabe si ya se tocó y si está bien. */
type Campo =
  | 'numeroBoleta'
  | 'descripcion'
  | 'precio'
  | 'fechaEstimada'
  | 'adelanto'
  | 'metodoAdelanto'
  | 'clienteNombre'
  | 'clienteTelefono'
  | 'clienteCarnet';

type Props = {
  /** El cliente ya elegido (desde su ficha, en el Mostrador), o null para elegirlo acá. */
  clienteInicial: Cliente | null;
  registrar: (datos: DatosRopa) => Promise<ResultadoRegistro>;
  /**
   * Cómo va lo escrito, sin guardar (SPEC-KRILINXI-058): las mismas validaciones que `registrar`. De acá salen el visto de
   * cada campo y de cada tarjeta.
   */
  revisar: (datos: DatosRopa) => Promise<RevisionDeRopa>;
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
 *
 * Son dos pasos en el mismo componente (SPEC-KRILINXI-057): **sin cliente elegido solo se ve el
 * buscador**, sin los datos de la boleta ni "Guardar"; con uno elegido (o dado de alta ahí mismo), la
 * boleta, con un único "Guardar" al final. Volver a elegir cliente no pierde lo ya escrito, porque
 * el estado de la boleta vive acá y no en los pasos.
 *
 * Mientras se escribe, una revisión en vivo (`useRevisionEnVivo`, SPEC-KRILINXI-058) pone un visto en cada campo que ya está
 * bien y una marca en la esquina de cada tarjeta. Un error solo se muestra cuando la persona salió del campo o intentó guardar:
 * no se regaña a quien todavía está escribiendo.
 */
export function FormularioRopa({ clienteInicial, registrar, revisar, alRegistrar, alCambiarEscrito }: Props) {
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
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  // Qué campos ya se tocaron (la persona salió de ellos), y si ya se intentó guardar: recién ahí se muestran los errores.
  const [tocados, setTocados] = useState<Partial<Record<Campo, true>>>({});
  const [intento, setIntento] = useState(false);
  // Lo que dijo el guardado la última vez: sirve mientras la revisión en vivo todavía no alcanzó a lo escrito.
  const [erroresDelGuardado, setErroresDelGuardado] = useState<ErroresRopa>({});

  const cambiar =
    (campo: 'numeroBoleta' | 'descripcion' | 'precio' | 'fechaEstimada' | 'adelanto') => (valor: string) =>
      setDatos((d) => ({ ...d, [campo]: valor }));
  const alSalirDe = (campo: Campo) => () => setTocados((t) => (t[campo] ? t : { ...t, [campo]: true }));

  const elClienteViene =
    clienteInicial !== null && cliente?.tipo === 'existente' && cliente.cliente.id === clienteInicial.id;
  const hayEscrito =
    (cliente !== null && !elClienteViene) ||
    [datos.numeroBoleta, datos.descripcion, datos.precio, datos.fechaEstimada, datos.adelanto].some((t) => t.trim() !== '');
  useEffect(() => {
    alCambiarEscrito?.(hayEscrito);
    return () => alCambiarEscrito?.(false);
  }, [hayEscrito, alCambiarEscrito]);

  const { revision, alDia } = useRevisionEnVivo(cliente === null ? null : { ...datos, cliente }, revisar);

  // "Deja adelanto" y el importe vacío: lo único que dice este formulario y no la revisión (que lee vacío como "no deja").
  const faltaElAdelanto = dejaAdelanto && datos.adelanto.trim() === '';

  /**
   * El error de un campo, o nada. Antes de intentar guardar, solo el de un campo que ya se tocó. Con la revisión al día
   * se usa esa (se va en cuanto se arregla el campo); si todavía no llegó, lo que dijo el guardado.
   */
  function errorDe(campo: Campo): string | undefined {
    if (!intento && !tocados[campo]) return undefined;
    if (campo === 'adelanto' && faltaElAdelanto) return FALTA_ADELANTO;
    return alDia && revision ? revision.errores[campo] : intento ? erroresDelGuardado[campo] : undefined;
  }

  /** El campo ya está bien: escrito, y sin nada que corregir según la revisión de lo que hay ahora. */
  const estaBien = (campo: Campo, escrito: boolean) =>
    escrito && alDia && revision !== null && revision.errores[campo] === undefined && !(campo === 'adelanto' && faltaElAdelanto);

  const hayDatos = (texto: string) => texto.trim() !== '';
  const clienteNuevo = cliente?.tipo === 'nuevo' ? cliente.datos : null;

  const bienLaRopa =
    estaBien('numeroBoleta', hayDatos(datos.numeroBoleta)) &&
    estaBien('descripcion', hayDatos(datos.descripcion)) &&
    estaBien('precio', hayDatos(datos.precio)) &&
    estaBien('fechaEstimada', true);
  const bienElAdelanto =
    dejaAdelanto && estaBien('adelanto', hayDatos(datos.adelanto)) && datos.metodoAdelanto !== null && estaBien('metodoAdelanto', true);
  const bienElClienteNuevo =
    clienteNuevo !== null &&
    estaBien('clienteNombre', hayDatos(clienteNuevo.nombre)) &&
    estaBien('clienteTelefono', hayDatos(clienteNuevo.telefono)) &&
    estaBien('clienteCarnet', true) &&
    revision?.telefonoOcupado === false;

  /** Una tarjeta marca el visto si todo lo suyo está bien, la equis si algún campo suyo ya muestra un error, y nada si no. */
  const estadoDe = (bien: boolean, campos: Campo[], extra = false): EstadoDeTarjeta =>
    bien ? 'completo' : extra || campos.some((c) => errorDe(c) !== undefined) ? 'con-errores' : null;
  const estadoLaRopa = estadoDe(bienLaRopa, ['numeroBoleta', 'descripcion', 'precio', 'fechaEstimada']);
  const estadoElAdelanto = dejaAdelanto ? estadoDe(bienElAdelanto, ['adelanto', 'metodoAdelanto']) : null;
  // Un teléfono que ya es de otro cliente no es un error de escritura, pero tampoco está bien: tras intentar guardar, es una equis.
  const estadoElClienteNuevo = estadoDe(bienElClienteNuevo, ['clienteNombre', 'clienteTelefono', 'clienteCarnet'], intento && revision?.telefonoOcupado === true);

  function elegirAdelanto(deja: boolean) {
    setDejaAdelanto(deja);
    // Si no deja, lo escrito del adelanto no se guarda ni se queda esperando.
    if (!deja) {
      setDatos((d) => ({ ...d, adelanto: '', metodoAdelanto: null }));
      setTocados(({ adelanto: _a, metodoAdelanto: _m, ...resto }) => resto);
    }
  }

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (guardando) return;
    setIntento(true);
    if (faltaElAdelanto) {
      setErroresDelGuardado({ adelanto: FALTA_ADELANTO });
      return;
    }
    setGuardando(true);
    setErrorGeneral(null);
    try {
      const resultado = await registrar({ ...datos, cliente });
      if (resultado.tipo === 'invalida') {
        setErroresDelGuardado(resultado.errores);
        setGuardando(false);
        return;
      }
      if (resultado.tipo === 'telefono-ocupado') {
        setOcupadoPor(resultado.cliente);
        setErroresDelGuardado({});
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

  const errores: ErroresRopa = {
    cliente: undefined,
    clienteNombre: errorDe('clienteNombre'),
    clienteTelefono: errorDe('clienteTelefono'),
    clienteCarnet: errorDe('clienteCarnet'),
  };

  // Paso 1: todavía no hay cliente. Solo el buscador: nada de la boleta, y nada que guardar.
  if (cliente === null) {
    return (
      <div className="mt-6">
        <ElegirClienteDeLaRopa
          valor={cliente}
          alCambiar={(valor) => {
            setCliente(valor);
            setOcupadoPor(null);
          }}
          errores={errores}
          deshabilitado={guardando}
        />
      </div>
    );
  }

  // Paso 2: la boleta, con el cliente arriba. Guardar está una sola vez, al final.
  return (
    <form onSubmit={guardar} noValidate aria-label="Datos de la ropa" className="mt-6 grid gap-2">
      <ElegirClienteDeLaRopa
        valor={cliente}
        alCambiar={(valor) => {
          setCliente(valor);
          setOcupadoPor(null);
        }}
        errores={errores}
        correctos={{
          nombre: clienteNuevo !== null && estaBien('clienteNombre', hayDatos(clienteNuevo.nombre)),
          telefono:
            clienteNuevo !== null &&
            estaBien('clienteTelefono', hayDatos(clienteNuevo.telefono)) &&
            revision?.telefonoOcupado === false,
          carnet: clienteNuevo !== null && estaBien('clienteCarnet', hayDatos(clienteNuevo.carnet)),
        }}
        estado={cliente.tipo === 'existente' ? 'completo' : estadoElClienteNuevo}
        alSalirDe={(campo) => alSalirDe(campo)()}
        deshabilitado={guardando}
      />
      {ocupadoPor && (
        <div className="mt-4 grid gap-3">
          <Aviso tipo="advertencia">
            Ese teléfono ya es de {ocupadoPor.nombre}. Si es la misma persona, elígela y guarda la ropa a su nombre.
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
        <Tarjeta titulo="La ropa" estado={estadoLaRopa}>
          <CampoTexto
            etiqueta="Número de la boleta"
            value={datos.numeroBoleta}
            onChange={cambiar('numeroBoleta')}
            onBlur={alSalirDe('numeroBoleta')}
            error={errorDe('numeroBoleta')}
            correcto={estaBien('numeroBoleta', hayDatos(datos.numeroBoleta))}
            autoComplete="off"
            // Con un cliente que ya existe se empieza por la boleta; con uno nuevo, por su nombre.
            autoFocus={cliente.tipo === 'existente'}
          />
          {/* Varias líneas (SPEC-KRILINXI-058): una boleta suele listar varias prendas. */}
          <CampoTextoLargo
            etiqueta="Qué deja"
            value={datos.descripcion}
            onChange={cambiar('descripcion')}
            onBlur={alSalirDe('descripcion')}
            error={errorDe('descripcion')}
            correcto={estaBien('descripcion', hayDatos(datos.descripcion))}
            autoComplete="off"
          />
          <CampoTexto
            etiqueta="Precio (Bs)"
            value={datos.precio}
            onChange={cambiar('precio')}
            onBlur={alSalirDe('precio')}
            error={errorDe('precio')}
            correcto={estaBien('precio', hayDatos(datos.precio))}
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
            onBlur={alSalirDe('fechaEstimada')}
            error={errorDe('fechaEstimada')}
          />
        </Tarjeta>
      </div>

      <div className="mt-4">
        <Tarjeta titulo="Adelanto" estado={estadoElAdelanto}>
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
                onBlur={alSalirDe('adelanto')}
                error={errorDe('adelanto')}
                correcto={estaBien('adelanto', hayDatos(datos.adelanto))}
                inputMode="decimal"
                autoComplete="off"
              />
              <ElegirMetodo
                value={datos.metodoAdelanto}
                onChange={(metodo) => setDatos((d) => ({ ...d, metodoAdelanto: metodo }))}
                error={errorDe('metodoAdelanto')}
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
