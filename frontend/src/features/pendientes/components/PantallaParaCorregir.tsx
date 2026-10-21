import { useState } from 'react';
import { Aviso } from '../../../components/Aviso';
import { Boton } from '../../../components/Boton';
import { EnlaceBoton } from '../../../components/EnlaceBoton';
import { ModalConfirmacion } from '../../../components/ModalConfirmacion';
import { Paginas } from '../../../components/Paginas';
import { Tarjeta } from '../../../components/Tarjeta';
import { usePaginado } from '../../../hooks/usePaginado';
import type { RegistroParaCorregir } from '../types';
import { useCorreccion } from '../hooks/useCorreccion';
import { useParaCorregir } from '../hooks/useParaCorregir';
import { FormularioCorreccion } from './FormularioCorreccion';
import { MismoCliente } from './MismoCliente';

/** "2026-10-03T14:05:00.000Z" → "03/10/2026 10:05", en la hora de la tablet. */
function cuando(fecha: string): string {
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return '';
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

/**
 * Lo que no se pudo guardar, con el motivo — SPEC-KRILINXI-007. Desde SPEC-KRILINXI-013,
 * cada registro se puede corregir y volver a guardar, o descartar con confirmación.
 */
export function PantallaParaCorregir() {
  const registros = useParaCorregir();
  const correccion = useCorreccion();
  const paginas = usePaginado(registros);
  const [corrigiendo, setCorrigiendo] = useState<RegistroParaCorregir | null>(null);
  const [descartando, setDescartando] = useState<RegistroParaCorregir | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (registros === null || !correccion.lista) return <p className="mt-6 text-xl text-texto-suave">Buscando…</p>;

  if (corrigiendo) {
    return (
      <FormularioCorreccion
        registro={corrigiendo}
        guardar={(valores) => correccion.guardar(corrigiendo, valores)}
        alGuardar={() => {
          setCorrigiendo(null);
          setAviso(
            'Listo: la corrección quedó guardada en esta tablet. Si no hay internet, se manda cuando vuelva la conexión.',
          );
        }}
        alVolver={() => setCorrigiendo(null)}
        antesDelFormulario={
          <MismoCliente
            registro={corrigiendo}
            buscar={correccion.buscarMismoCliente}
            usar={correccion.usarMismoCliente}
            alUsar={(existente, boletas) => {
              setCorrigiendo(null);
              setAviso(
                boletas === 1
                  ? `Listo: la ropa quedó a nombre de ${existente.nombre} y se va a guardar de nuevo.`
                  : boletas > 1
                    ? `Listo: ${boletas} boletas quedaron a nombre de ${existente.nombre} y se van a guardar de nuevo.`
                    : `Listo: se usa a ${existente.nombre}, que ya estaba registrado.`,
              );
            }}
          />
        }
      />
    );
  }

  async function descartar(registro: RegistroParaCorregir) {
    if (!correccion.lista) return;
    try {
      await correccion.descartar(registro);
      setAviso(`Se descartó: ${registro.que}.`);
    } catch (causa) {
      console.error('No se pudo descartar el registro.', causa);
      setError('No se pudo descartar. Probá de nuevo y, si sigue pasando, avisale al encargado.');
    }
    setDescartando(null);
  }

  const avisos = (
    <>
      {aviso && (
        <div className="mt-6">
          <Aviso tipo="exito">{aviso}</Aviso>
        </div>
      )}
      {error && (
        <div className="mt-6">
          <Aviso tipo="error">{error}</Aviso>
        </div>
      )}
    </>
  );

  if (registros.length === 0) {
    return (
      <>
        {avisos}
        <p className="mt-6 text-xl text-texto-suave">No hay nada para corregir. Todo se guardó bien.</p>
        <div className="mt-6">
          <EnlaceBoton a="/">Volver al inicio</EnlaceBoton>
        </div>
      </>
    );
  }

  return (
    <>
      {avisos}
      <p className="mt-4 text-xl text-texto-suave">
        Estos registros no se pudieron guardar. Leé el motivo de cada uno: corregí lo que está mal y volvé a guardarlo,
        o descartalo si no va.
      </p>
      <ul className="mt-6 grid gap-4">
        {(paginas.visibles ?? []).map((registro) => (
          <li key={registro.id}>
            <Tarjeta>
              <p className="text-xl font-semibold text-texto">{registro.que}</p>
              {/* Por qué no se guardó: es un error que el empleado tiene que resolver, y ninguno puede
                quedar en silencio (CLAUDE.md §6). */}
              <div className="mt-2">
                <Aviso tipo="error">{registro.mensaje}</Aviso>
              </div>
              {registro.fecha && <p className="mt-2 text-lg text-texto-suave">{cuando(registro.fecha)}</p>}
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Boton
                  onClick={() => {
                    setAviso(null);
                    setError(null);
                    setCorrigiendo(registro);
                  }}
                >
                  Corregir
                </Boton>
                <Boton variante="secundario" onClick={() => setDescartando(registro)}>
                  Descartar
                </Boton>
              </div>
            </Tarjeta>
          </li>
        ))}
      </ul>
      <Paginas pagina={paginas.pagina} total={paginas.total} porPagina={paginas.porPagina} irAPagina={paginas.irAPagina} nombre="Páginas de los registros para corregir" />
      <ModalConfirmacion
        abierto={descartando !== null}
        titulo={`¿Descartar «${descartando?.que ?? ''}»?`}
        mensaje="No se va a guardar nunca. Si la ropa, el cobro o el cliente siguen siendo de verdad, vas a tener que volver a cargarlos. Esto no se puede deshacer."
        textoConfirmar="Sí, descartar"
        peligroso
        onConfirmar={() => (descartando ? descartar(descartando) : undefined)}
        onCancelar={() => setDescartando(null)}
      />
    </>
  );
}
