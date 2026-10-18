import { useState, type FormEvent } from 'react';
import { Aviso } from '../../../components/Aviso';
import { Boton } from '../../../components/Boton';
import { Tarjeta } from '../../../components/Tarjeta';
import { CampoTexto } from '../../../components/CampoTexto';
import { ElegirClienteDeLaRopa } from '../../clientes/components/ElegirClienteDeLaRopa';
import type { Cliente, ClienteElegido } from '../../clientes/types';
import type { DatosRopa, ErroresRopa, ResultadoRegistro, RopaRegistrada } from '../types';
import { ElegirMetodo } from './ElegirMetodo';

const NO_SE_GUARDO = 'No se pudo guardar la ropa. Probá de nuevo y, si sigue pasando, avisale al encargado.';

type Props = {
  /** El cliente ya elegido (desde su ficha, en el Mostrador), o null para elegirlo acá. */
  clienteInicial: Cliente | null;
  registrar: (datos: DatosRopa) => Promise<ResultadoRegistro>;
  alRegistrar: (ropa: RopaRegistrada) => void;
};

/**
 * La ropa que deja un cliente, con el cliente arriba en el mismo formulario — SPEC-KRILINXI-034:
 * se elige con el buscador o se da de alta ahí mismo, y se guarda todo junto. Valida quien guarda
 * (`api/ordenesLocal`); este formulario muestra lo que le contesta, campo por campo.
 */
export function FormularioRopa({ clienteInicial, registrar, alRegistrar }: Props) {
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
  const [errores, setErrores] = useState<ErroresRopa>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cambiar =
    (campo: 'numeroBoleta' | 'descripcion' | 'precio' | 'fechaEstimada' | 'adelanto') => (valor: string) =>
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
