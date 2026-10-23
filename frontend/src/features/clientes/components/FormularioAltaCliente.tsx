import { useState, type FormEvent } from 'react';
import { Aviso } from '../../../components/Aviso';
import { Boton } from '../../../components/Boton';
import { Tarjeta } from '../../../components/Tarjeta';
import { CampoTexto } from '../../../components/CampoTexto';
import type { DatosAlta, ErroresAlta, ResultadoAlta } from '../types';

const NO_SE_GUARDO = 'No se pudo guardar el cliente. Prueba de nuevo y, si sigue pasando, avísale al encargado.';

type Props = {
  /**
   * Lo que se escribió en el buscador antes de tocar "Cliente nuevo" (SPEC-KRILINXI-032): ya viene
   * puesto, para no teclearlo dos veces. Si son números va al teléfono; si tiene letras, al nombre.
   */
  escrito: string;
  registrar: (datos: DatosAlta) => Promise<ResultadoAlta>;
  /** Se llama con el alta terminada, salga bien o el teléfono ya sea de otro. */
  alTerminar: (resultado: Exclude<ResultadoAlta, { tipo: 'invalido' }>) => void;
  alCancelar: () => void;
};

/** Dónde va lo escrito en el buscador: "70123456" es un teléfono, "Rosa Qu" es un nombre. */
export function datosIniciales(escrito: string): DatosAlta {
  const limpio = escrito.trim();
  const esTelefono = limpio !== '' && !/\p{L}/u.test(limpio);
  return { nombre: esTelefono ? '' : limpio, telefono: esTelefono ? limpio : '', carnet: '' };
}

/**
 * El alta de un cliente: nombre, teléfono y carnet. Valida quien guarda
 * (`api/clientesLocal`); este formulario solo muestra lo que le contesta.
 */
export function FormularioAltaCliente({ escrito, registrar, alTerminar, alCancelar }: Props) {
  const [datos, setDatos] = useState<DatosAlta>(() => datosIniciales(escrito));
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
    <div className="mt-6">
      <Tarjeta titulo="Registrar cliente nuevo">
        <form onSubmit={guardar} noValidate aria-label="Registrar cliente nuevo" className="grid gap-2">
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
            <div className="mt-4">
              <Aviso tipo="error">{errorGeneral}</Aviso>
            </div>
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
      </Tarjeta>
    </div>
  );
}
