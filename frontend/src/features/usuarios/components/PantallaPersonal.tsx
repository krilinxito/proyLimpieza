import { useState } from 'react';
import { AvisoResultado, AvisoSinRed, avisoDe } from '../../../components/AvisosAdmin';
import { Boton } from '../../../components/Boton';
import { ModalConfirmacion } from '../../../components/ModalConfirmacion';
import { useEnLinea } from '../../../hooks/useEnLinea';
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
 */
export function PantallaPersonal() {
  const cuentas = useCuentas();
  const sucursales = useSucursalesAbiertas();
  const enLinea = useEnLinea();
  const { sesion } = useSession();
  const [edicion, setEdicion] = useState<Edicion>(null);
  const [baja, setBaja] = useState<Cuenta | null>(null);
  const [aviso, setAviso] = useState<ReturnType<typeof avisoDe> | null>(null);

  if (cuentas === null) return <p className="mt-6 text-xl text-slate-700">Buscando…</p>;

  async function darDeBaja(cuenta: Cuenta) {
    const resultado = await cambiosDeCuenta.darDeBaja(cuenta);
    setBaja(null);
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
      <ul className="mt-6 grid gap-4">
        {cuentas.map((c) => (
          <li key={c.id} className="rounded-lg border-2 border-slate-300 bg-white p-4 text-xl">
            <p className="font-semibold text-slate-900">
              {c.nombreCompleto}
              {!c.activo && ' — dada de baja'}
            </p>
            <p className="mt-1 text-slate-800">
              Entra como «{c.username}» · {TEXTO_ROL[c.rol]}
              {c.sucursal && ` · ${c.sucursal}`}
            </p>
            {c.activo && (
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Boton
                  variante="secundario"
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
                  <Boton variante="peligro" disabled={!enLinea} onClick={() => setBaja(c)}>
                    Dar de baja
                  </Boton>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      <ModalConfirmacion
        abierto={baja !== null}
        titulo={`¿Dar de baja a ${baja?.nombreCompleto ?? ''}?`}
        mensaje="No va a poder volver a entrar al sistema. Lo que ya registró queda guardado a su nombre."
        textoConfirmar="Sí, dar de baja"
        peligroso
        onConfirmar={() => (baja ? darDeBaja(baja) : undefined)}
        onCancelar={() => setBaja(null)}
      />
    </>
  );
}
