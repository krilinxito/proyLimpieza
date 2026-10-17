import { useState, type FormEvent } from 'react';
import { Boton } from '../../../components/Boton';
import { CampoTexto } from '../../../components/CampoTexto';
import type { Cliente, DatosEdicion, ErroresAlta, ResultadoEdicion } from '../types';

const NO_SE_GUARDO = 'No se pudieron guardar los cambios. Probá de nuevo y, si sigue pasando, avisale al encargado.';

type Props = {
  cliente: Cliente;
  editar: (cliente: Cliente, datos: DatosEdicion) => Promise<ResultadoEdicion>;
  /** Se llama con la edición terminada: guardada, o sin nada que guardar. */
  alTerminar: (resultado: Exclude<ResultadoEdicion, { tipo: 'invalido' }>) => void;
  alCancelar: () => void;
};

/**
 * Cambiar el nombre o el teléfono de un cliente — SPEC-KRILINXI-014. Arranca con los datos
 * actuales. Valida quien guarda (`api/clientesLocal`); este formulario muestra lo que le
 * contesta, igual que el del alta.
 */
export function FormularioEditarCliente({ cliente, editar, alTerminar, alCancelar }: Props) {
  const [datos, setDatos] = useState<DatosEdicion>({ nombre: cliente.nombre, telefono: cliente.telefono });
  const [errores, setErrores] = useState<ErroresAlta>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cambiar = (campo: keyof DatosEdicion) => (valor: string) => setDatos((d) => ({ ...d, [campo]: valor }));

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (guardando) return;
    setGuardando(true);
    setErrorGeneral(null);
    try {
      const resultado = await editar(cliente, datos);
      if (resultado.tipo === 'invalido') {
        setErrores(resultado.errores);
        setGuardando(false);
        return;
      }
      alTerminar(resultado);
    } catch (error) {
      console.error('No se pudo guardar la edición del cliente en la base local.', error);
      setErrorGeneral(NO_SE_GUARDO);
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={guardar} noValidate aria-label="Cambiar datos del cliente" className="mt-6 grid gap-2">
      <h2 className="text-2xl font-bold text-slate-900">Cambiar datos del cliente</h2>
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
      {errorGeneral && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-xl text-red-800">
          {errorGeneral}
        </p>
      )}
      <div className="mt-6 grid gap-3">
        <Boton type="submit" ocupado={guardando} textoOcupado="Guardando…">
          Guardar cambios
        </Boton>
        <Boton variante="secundario" onClick={alCancelar} disabled={guardando}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}
