import { useState, type FormEvent } from 'react';
import { Boton } from '../../../components/Boton';
import { CampoTexto } from '../../../components/CampoTexto';
import type { DatosAlta, ErroresAlta, ResultadoAlta } from '../types';

const NO_SE_GUARDO = 'No se pudo guardar el cliente. Probá de nuevo y, si sigue pasando, avisale al encargado.';

type Props = {
  /** El teléfono que se buscó y no apareció: ya viene escrito, para no teclearlo dos veces. */
  telefonoInicial: string;
  registrar: (datos: DatosAlta) => Promise<ResultadoAlta>;
  /** Se llama con el alta terminada, salga bien o el teléfono ya sea de otro. */
  alTerminar: (resultado: Exclude<ResultadoAlta, { tipo: 'invalido' }>) => void;
  alCancelar: () => void;
};

/**
 * El alta de un cliente: nombre, teléfono y carnet. Valida quien guarda
 * (`api/clientesLocal`); este formulario solo muestra lo que le contesta.
 */
export function FormularioAltaCliente({ telefonoInicial, registrar, alTerminar, alCancelar }: Props) {
  const [datos, setDatos] = useState<DatosAlta>({ nombre: '', telefono: telefonoInicial, carnet: '' });
  const [errores, setErrores] = useState<ErroresAlta>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cambiar = (campo: keyof DatosAlta) => (valor: string) => setDatos((d) => ({ ...d, [campo]: valor }));

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    // Un segundo Enter mientras se guarda no da de alta dos veces.
    if (guardando) return;
    setGuardando(true);
    setErrorGeneral(null);
    try {
      const resultado = await registrar(datos);
      if (resultado.tipo === 'invalido') {
        setErrores(resultado.errores);
        setGuardando(false);
        return;
      }
      alTerminar(resultado);
    } catch (error) {
      console.error('No se pudo guardar el cliente en la base local.', error);
      setErrorGeneral(NO_SE_GUARDO);
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={guardar} noValidate aria-label="Registrar cliente nuevo" className="mt-6 grid gap-2">
      <h2 className="text-2xl font-bold text-slate-900">Registrar cliente nuevo</h2>
      <CampoTexto
        etiqueta="Nombre completo"
        value={datos.nombre}
        onChange={cambiar('nombre')}
        error={errores.nombre}
        autoComplete="off"
        autoFocus
      />
      <CampoTexto
        etiqueta="Teléfono"
        value={datos.telefono}
        onChange={cambiar('telefono')}
        error={errores.telefono}
        inputMode="tel"
        autoComplete="off"
      />
      <CampoTexto
        etiqueta="Carnet (si lo da)"
        value={datos.carnet}
        onChange={cambiar('carnet')}
        autoComplete="off"
      />
      {errorGeneral && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-xl text-red-800">
          {errorGeneral}
        </p>
      )}
      <div className="mt-6 grid gap-3">
        <Boton type="submit" ocupado={guardando} textoOcupado="Guardando…">
          Guardar cliente
        </Boton>
        <Boton variante="secundario" onClick={alCancelar} disabled={guardando}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}
