import { useState } from 'react';
import { AvisoResultado, AvisoSinRed, avisoDe } from '../../../components/AvisosAdmin';
import { Boton } from '../../../components/Boton';
import { Insignia } from '../../../components/Insignia';
import { Paginas } from '../../../components/Paginas';
import { ModalConfirmacion } from '../../../components/ModalConfirmacion';
import { Avatar } from '../../../components/marco/Avatar';
import { Tarjeta } from '../../../components/Tarjeta';
import { useEnLinea } from '../../../hooks/useEnLinea';
import { usePaginado } from '../../../hooks/usePaginado';
import { useSession } from '../../../hooks/useSession';
import { TEXTO_ROL } from '../../../lib/dominio';
import { useSucursalesAbiertas } from '../../sucursales/hooks/useSucursales';
import { cambiosDeCuenta, useCuentas } from '../hooks/useCuentas';
import type { Cuenta } from '../types';
import { FormularioCuenta } from './FormularioCuenta';

type Edicion = { tipo: 'nueva' } | { tipo: 'editar'; cuenta: Cuenta } | null;

/**
 * El personal para el admin — SPEC-KRILINXI-017: las cuentas (de la base local), y darlas de
 * alta, cambiar sus datos y darlas de baja (directo a la API, nunca por la cola: llevan la
 * contraseña).
 *
 * Desde SPEC-KRILINXI-039 es una grilla de tarjetas: una por fila en angosto, dos desde 1024px. Cada
 * una con el círculo de la inicial (el de la cabecera), lo que importa en un renglón, y sus acciones
 * adentro, compactas y con su ícono.
 */
export function PantallaPersonal() {
  const cuentas = useCuentas();
  const sucursales = useSucursalesAbiertas();
  const enLinea = useEnLinea();
  const { sesion } = useSession();
  const paginas = usePaginado(cuentas);
  const [edicion, setEdicion] = useState<Edicion>(null);
  const [baja, setBaja] = useState<Cuenta | null>(null);
  const [alta, setAlta] = useState<Cuenta | null>(null);
  const [aviso, setAviso] = useState<ReturnType<typeof avisoDe> | null>(null);

  if (cuentas === null) return <p className="mt-6 text-xl text-texto-suave">Buscando…</p>;

  async function darDeBaja(cuenta: Cuenta) {
    const resultado = await cambiosDeCuenta.darDeBaja(cuenta);
    setBaja(null);
    setAviso(resultado.tipo === 'invalido' ? null : avisoDe(resultado));
  }

  async function darDeAlta(cuenta: Cuenta) {
    const resultado = await cambiosDeCuenta.darDeAlta(cuenta);
    setAlta(null);
    setAviso(resultado.tipo === 'invalido' ? null : avisoDe(resultado));
  }

  if (edicion) {
    const cuenta = edicion.tipo === 'editar' ? edicion.cuenta : null;
    return (
      <>
        {!enLinea && <AvisoSinRed />}
        <FormularioCuenta
          cuenta={cuenta}
          sucursales={sucursales}
          enLinea={enLinea}
          guardar={(datos) => (cuenta ? cambiosDeCuenta.editar(cuenta, datos) : cambiosDeCuenta.crear(datos))}
          alTerminar={(resultado) => {
            setAviso(avisoDe(resultado));
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
          Agregar una persona
        </Boton>
      </div>
      <ul className="mt-6 grid gap-4 lg:grid-cols-2">
        {(paginas.visibles ?? []).map((c) => (
          // `grid` en el renglón: la tarjeta se estira, y las de una misma fila quedan del mismo alto.
          <li key={c.id} className="grid">
            <Tarjeta titulo={c.nombreCompleto}>
              <div className="flex items-start gap-4">
                <Avatar nombre={c.nombreCompleto} decorativo />
                <div className="grid justify-items-start gap-2">
                  {/* La insignia marca solo la excepción (SPEC-KRILINXI-051): lo normal no lleva marca. */}
                  {!c.activo && <Insignia tono="neutro">Dada de baja</Insignia>}
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xl">
                    <dt className="font-semibold text-texto-suave">Usuario</dt>
                    <dd className="text-texto">«{c.username}»</dd>
                    <dt className="font-semibold text-texto-suave">Rol</dt>
                    <dd className="text-texto">{TEXTO_ROL[c.rol]}</dd>
                    {c.sucursal && (
                      <>
                        <dt className="font-semibold text-texto-suave">Sucursal</dt>
                        <dd className="text-texto">{c.sucursal}</dd>
                      </>
                    )}
                  </dl>
                </div>
              </div>
              {!c.activo && (
                <div className="mt-4 flex flex-wrap gap-3">
                  <Boton variante="secundario" tamano="compacto" icono="candado-abierto" disabled={!enLinea} onClick={() => setAlta(c)}>
                    Volver a dar de alta
                  </Boton>
                </div>
              )}
              {c.activo && (
                <div className="mt-4 flex flex-wrap gap-3">
                  <Boton
                    variante="secundario"
                    tamano="compacto"
                    icono="editar"
                    disabled={!enLinea}
                    onClick={() => {
                      setAviso(null);
                      setEdicion({ tipo: 'editar', cuenta: c });
                    }}
                  >
                    Cambiar datos
                  </Boton>
                  {/* Un admin no puede darse de baja a sí mismo (SPEC-ALE186-009). */}
                  {c.id !== sesion?.usuario.id && (
                    <Boton variante="peligro" tamano="compacto" icono="anular" disabled={!enLinea} onClick={() => setBaja(c)}>
                      Dar de baja
                    </Boton>
                  )}
                </div>
              )}
            </Tarjeta>
          </li>
        ))}
      </ul>
      <Paginas pagina={paginas.pagina} total={paginas.total} porPagina={paginas.porPagina} irAPagina={paginas.irAPagina} nombre="Páginas del personal" />
      <ModalConfirmacion
        abierto={baja !== null}
        titulo={`¿Dar de baja a ${baja?.nombreCompleto ?? ''}?`}
        mensaje="No va a poder volver a entrar al sistema. Lo que ya registró queda guardado a su nombre."
        textoConfirmar="Sí, dar de baja"
        peligroso
        onConfirmar={() => (baja ? darDeBaja(baja) : undefined)}
        onCancelar={() => setBaja(null)}
      />
      <ModalConfirmacion
        abierto={alta !== null}
        titulo={`¿Volver a dar de alta a ${alta?.nombreCompleto ?? ''}?`}
        mensaje="Va a poder volver a entrar al sistema con su usuario y su contraseña de siempre."
        textoConfirmar="Sí, dar de alta"
        onConfirmar={() => (alta ? darDeAlta(alta) : undefined)}
        onCancelar={() => setAlta(null)}
      />
    </>
  );
}
