import { useState, type FormEvent } from 'react';
import { Boton } from '../../../components/Boton';
import { CampoTexto } from '../../../components/CampoTexto';
import type { DatosSucursal, ErroresSucursal, ResultadoSucursal, Sucursal } from '../types';

type Props = {
  /** La que se edita, o null para una nueva. */
  sucursal: Sucursal | null;
  guardar: (datos: DatosSucursal) => Promise<ResultadoSucursal>;
  /** Con lo que pasó, salvo los errores de campo, que se muestran aquí. */
  alTerminar: (resultado: Exclude<ResultadoSucursal, { tipo: 'invalido' }>) => void;
  alCancelar: () => void;
  enLinea: boolean;
};

/** Alta y edición de una sucursal — SPEC-KRILINXI-017. */
export function FormularioSucursal({ sucursal, guardar, alTerminar, alCancelar, enLinea }: Props) {
  const [datos, setDatos] = useState<DatosSucursal>({
    nombre: sucursal?.nombre ?? '',
    direccion: sucursal?.direccion ?? '',
    telefono: sucursal?.telefono ?? '',
  });
  const [errores, setErrores] = useState<ErroresSucursal>({});
  const [guardando, setGuardando] = useState(false);
  const cambiar = (campo: keyof DatosSucursal) => (valor: string) => setDatos((d) => ({ ...d, [campo]: valor }));
  const titulo = sucursal ? `Cambiar datos de ${sucursal.nombre}` : 'Sucursal nueva';

  async function enviarFormulario(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (guardando) return;
    setGuardando(true);
    const resultado = await guardar(datos);
    setGuardando(false);
    if (resultado.tipo === 'invalido') setErrores(resultado.errores);
    else alTerminar(resultado);
  }

  return (
    <form onSubmit={enviarFormulario} noValidate aria-label={titulo} className="mt-6 grid gap-2 rounded-lg border-2 border-sky-700 p-4">
      <h2 className="text-2xl font-bold text-slate-900">{titulo}</h2>
      <CampoTexto etiqueta="Nombre" value={datos.nombre} onChange={cambiar('nombre')} error={errores.nombre} autoComplete="off" autoFocus />
      <CampoTexto etiqueta="Dirección (si la tiene)" value={datos.direccion} onChange={cambiar('direccion')} autoComplete="off" />
      <CampoTexto etiqueta="Teléfono (si lo tiene)" value={datos.telefono} onChange={cambiar('telefono')} inputMode="tel" autoComplete="off" />
      <div className="mt-6 grid gap-3">
        <Boton type="submit" ocupado={guardando} textoOcupado="Guardando…" disabled={!enLinea}>
          Guardar
        </Boton>
        <Boton variante="secundario" onClick={alCancelar} disabled={guardando}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}
