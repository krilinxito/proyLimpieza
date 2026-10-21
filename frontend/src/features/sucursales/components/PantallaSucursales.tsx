import { useState } from 'react';
import { AvisoResultado, AvisoSinRed, avisoDe } from '../../../components/AvisosAdmin';
import { Boton } from '../../../components/Boton';
import { Icono } from '../../../components/iconos';
import { Insignia, type TonoInsignia } from '../../../components/Insignia';
import { ModalConfirmacion } from '../../../components/ModalConfirmacion';
import { Paginas } from '../../../components/Paginas';
import { Tarjeta } from '../../../components/Tarjeta';
import { useEnLinea } from '../../../hooks/useEnLinea';
import { usePaginado } from '../../../hooks/usePaginado';
import { cambiosDeSucursal, usePersonasPorSucursal, useSucursales } from '../hooks/useSucursales';
import type { Sucursal } from '../types';
import { FormularioSucursal } from './FormularioSucursal';

type Edicion = { tipo: 'nueva' } | { tipo: 'editar'; sucursal: Sucursal } | null;

/**
 * Cómo se ve si la sucursal recibe ropa — SPEC-KRILINXI-027. Abierta en verde: lo normal. Cerrada
 * en advertencia, porque es algo excepcional (CLAUDE.md §2) y no recibe ropa ni personal nuevo.
 */
const ESTADO_SUCURSAL: Record<'abierta' | 'cerrada', { texto: string; tono: TonoInsignia }> = {
  abierta: { texto: 'Abierta', tono: 'exito' },
  cerrada: { texto: 'Cerrada', tono: 'advertencia' },
};

const estadoDe = (sucursal: Sucursal) => ESTADO_SUCURSAL[sucursal.activa ? 'abierta' : 'cerrada'];

/** "Nadie trabaja acá" / "1 persona trabaja acá" / "3 personas trabajan acá" — SPEC-KRILINXI-039. */
export function textoPersonas(cuantas: number): string {
  if (cuantas === 0) return 'Nadie trabaja acá';
  return cuantas === 1 ? '1 persona trabaja acá' : `${cuantas} personas trabajan acá`;
}

/**
 * Las sucursales para el admin — SPEC-KRILINXI-017: verlas (de la base local), darlas de alta,
 * cambiar sus datos, cerrarlas y volver a abrirlas (directo a la API).
 *
 * Desde SPEC-KRILINXI-039 es una grilla de tarjetas (una por fila en angosto, dos desde 1024px), y cada
 * una dice cuántas personas trabajan ahí, contadas en la base local.
 */
export function PantallaSucursales() {
  const sucursales = useSucursales();
  const personas = usePersonasPorSucursal();
  const enLinea = useEnLinea();
  const paginas = usePaginado(sucursales);
  const [edicion, setEdicion] = useState<Edicion>(null);
  const [apertura, setApertura] = useState<Sucursal | null>(null);
  const [aviso, setAviso] = useState<ReturnType<typeof avisoDe> | null>(null);

  if (sucursales === null) return <p className="mt-6 text-xl text-texto-suave">Buscando…</p>;

  async function cambiarApertura(sucursal: Sucursal) {
    const resultado = await cambiosDeSucursal.cambiarApertura(sucursal, !sucursal.activa);
    setApertura(null);
    setAviso(resultado.tipo === 'invalido' ? null : avisoDe(resultado));
  }

  if (edicion) {
    const sucursal = edicion.tipo === 'editar' ? edicion.sucursal : null;
    return (
      <>
        {!enLinea && <AvisoSinRed />}
        <FormularioSucursal
          sucursal={sucursal}
          enLinea={enLinea}
          guardar={(datos) => (sucursal ? cambiosDeSucursal.editar(sucursal, datos) : cambiosDeSucursal.crear(datos))}
          alTerminar={(resultado) => {
            setAviso(avisoDe(resultado));
            // Si el servidor dijo que no, el formulario queda abierto para corregir.
            if (resultado.tipo === 'guardado' || resultado.tipo === 'sin-cambios') setEdicion(null);
          }}
          alCancelar={() => setEdicion(null)}
        />
        <AvisoResultado aviso={aviso?.tipo === 'mal' ? aviso : null} />
      </>
    );
  }

  return (
    <>
      {!enLinea && <AvisoSinRed />}
      <AvisoResultado aviso={aviso} />
      <div className="mt-6">
        <Boton
          disabled={!enLinea}
          onClick={() => {
            setAviso(null);
            setEdicion({ tipo: 'nueva' });
          }}
        >
          Agregar sucursal
        </Boton>
      </div>
      <ul className="mt-6 grid gap-4 lg:grid-cols-2">
        {(paginas.visibles ?? []).map((s) => (
          // `grid` en el renglón: la tarjeta se estira, y las de una misma fila quedan del mismo alto.
          <li key={s.id} className="grid">
            <Tarjeta titulo={s.nombre}>
              <Insignia tono={estadoDe(s).tono}>{estadoDe(s).texto}</Insignia>
              {s.direccion && <p className="mt-2 text-xl text-texto">{s.direccion}</p>}
              {s.telefono && <p className="mt-1 text-xl text-texto">Teléfono: {s.telefono}</p>}
              {personas && (
                <p className="mt-2 flex items-center gap-2 text-xl text-texto-suave">
                  <Icono nombre="personal" />
                  {textoPersonas(personas.get(s.id) ?? 0)}
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-3">
                <Boton
                  variante="secundario"
                  tamano="compacto"
                  icono="editar"
                  disabled={!enLinea}
                  onClick={() => {
                    setAviso(null);
                    setEdicion({ tipo: 'editar', sucursal: s });
                  }}
                >
                  Cambiar datos
                </Boton>
                <Boton
                  variante={s.activa ? 'peligro' : 'secundario'}
                  tamano="compacto"
                  icono={s.activa ? 'candado' : 'candado-abierto'}
                  disabled={!enLinea}
                  onClick={() => setApertura(s)}
                >
                  {s.activa ? 'Cerrar sucursal' : 'Volver a abrir'}
                </Boton>
              </div>
            </Tarjeta>
          </li>
        ))}
      </ul>
      <Paginas pagina={paginas.pagina} total={paginas.total} porPagina={paginas.porPagina} irAPagina={paginas.irAPagina} nombre="Páginas de las sucursales" />
      <ModalConfirmacion
        abierto={apertura !== null}
        titulo={
          apertura?.activa
            ? `¿Cerrar la sucursal ${apertura.nombre}?`
            : `¿Volver a abrir la sucursal ${apertura?.nombre ?? ''}?`
        }
        mensaje={
          apertura?.activa
            ? 'No va a poder recibir ropa nueva ni personal nuevo. Se puede volver a abrir después.'
            : 'Va a poder recibir ropa y personal otra vez.'
        }
        textoConfirmar={apertura?.activa ? 'Sí, cerrar' : 'Sí, volver a abrir'}
        peligroso={apertura?.activa ?? false}
        onConfirmar={() => (apertura ? cambiarApertura(apertura) : undefined)}
        onCancelar={() => setApertura(null)}
      />
    </>
  );
}
