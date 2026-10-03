import { useState, type FormEvent } from 'react';
import { Boton } from '../../../components/Boton';
import { CampoTexto } from '../../../components/CampoTexto';
import { TarjetaCliente } from '../../clientes/components/TarjetaCliente';
import type { Cliente } from '../../clientes/types';
import type { DatosRopa, ErroresRopa, ResultadoRegistro, RopaRegistrada } from '../types';
import { ElegirMetodo } from './ElegirMetodo';

const NO_SE_GUARDO = 'No se pudo guardar la ropa. Probá de nuevo y, si sigue pasando, avisale al encargado.';

type Props = {
  cliente: Cliente;
  registrar: (datos: DatosRopa) => Promise<ResultadoRegistro>;
  alRegistrar: (ropa: RopaRegistrada) => void;
  alCambiarCliente: () => void;
};

/**
 * Los datos de la ropa que deja el cliente ya elegido. Valida quien guarda
 * (`api/ordenesLocal`); este formulario muestra lo que le contesta, campo por campo.
 */
export function FormularioRopa({ cliente, registrar, alRegistrar, alCambiarCliente }: Props) {
  const [datos, setDatos] = useState<Omit<DatosRopa, 'cliente'>>({
    numeroBoleta: '',
    descripcion: '',
    precio: '',
    fechaEstimada: '',
    adelanto: '',
    metodoAdelanto: null,
  });
  const [errores, setErrores] = useState<ErroresRopa>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cambiar = (campo: 'numeroBoleta' | 'descripcion' | 'precio' | 'fechaEstimada' | 'adelanto') => (valor: string) =>
    setDatos((d) => ({ ...d, [campo]: valor }));

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (guardando) return;
    setGuardando(true);
    setErrorGeneral(null);
    try {
      const resultado = await registrar({ ...datos, cliente });
      if (resultado.tipo === 'invalida') {
        setErrores(resultado.errores);
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
      <h2 className="text-2xl font-bold text-slate-900">Cliente</h2>
      <TarjetaCliente cliente={cliente} />
      <div className="mt-2">
        <Boton variante="secundario" onClick={alCambiarCliente} disabled={guardando}>
          Cambiar de cliente
        </Boton>
      </div>

      <h2 className="mt-6 text-2xl font-bold text-slate-900">La ropa</h2>
      <CampoTexto
        etiqueta="Número de la boleta"
        value={datos.numeroBoleta}
        onChange={cambiar('numeroBoleta')}
        error={errores.numeroBoleta}
        autoComplete="off"
        autoFocus
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
      <CampoTexto
        etiqueta="Para cuándo estará lista (si se sabe)"
        type="date"
        value={datos.fechaEstimada}
        onChange={cambiar('fechaEstimada')}
        error={errores.fechaEstimada}
      />

      <h2 className="mt-6 text-2xl font-bold text-slate-900">Adelanto</h2>
      <CampoTexto
        etiqueta="Cuánto deja de adelanto (Bs, si deja)"
        value={datos.adelanto}
        onChange={cambiar('adelanto')}
        error={errores.adelanto}
        inputMode="decimal"
        autoComplete="off"
      />
      {datos.adelanto.trim() !== '' && (
        <ElegirMetodo
          value={datos.metodoAdelanto}
          onChange={(metodo) => setDatos((d) => ({ ...d, metodoAdelanto: metodo }))}
          error={errores.metodoAdelanto}
        />
      )}

      {errorGeneral && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-xl text-red-800">
          {errorGeneral}
        </p>
      )}
      <div className="mt-6">
        <Boton type="submit" ocupado={guardando} textoOcupado="Guardando…">
          Guardar
        </Boton>
      </div>
    </form>
  );
}
