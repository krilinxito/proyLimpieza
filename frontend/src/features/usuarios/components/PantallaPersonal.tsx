import { useState } from 'react';
import { AvisoResultado, AvisoSinRed, avisoDe } from '../../../components/AvisosAdmin';
import { Boton } from '../../../components/Boton';
import { Insignia, type TonoInsignia } from '../../../components/Insignia';
import { ModalConfirmacion } from '../../../components/ModalConfirmacion';
import { Tarjeta } from '../../../components/Tarjeta';
import { useEnLinea } from '../../../hooks/useEnLinea';
import { useSession } from '../../../hooks/useSession';
import { TEXTO_ROL } from '../../../lib/dominio';
import { useSucursalesAbiertas } from '../../sucursales/hooks/useSucursales';
import { cambiosDeCuenta, useCuentas } from '../hooks/useCuentas';
import type { Cuenta } from '../types';
import { FormularioCuenta } from './FormularioCuenta';

type Edicion = { tipo: 'nueva' } | { tipo: 'editar'; cuenta: Cuenta } | null;

/**
 * Cómo se ve si la cuenta puede entrar — SPEC-KRILINXI-027. Activa en verde: es lo normal y lo que
 * se busca. Dada de baja en neutro: no es un error, es una cuenta que ya no se usa.
 */
const ESTADO_CUENTA: Record<'activa' | 'baja', { texto: string; tono: TonoInsignia }> = {
  activa: { texto: 'Activa', tono: 'exito' },
  baja: { texto: 'Dada de baja', tono: 'neutro' },
};

const estadoDe = (cuenta: Cuenta) => ESTADO_CUENTA[cuenta.activo ? 'activa' : 'baja'];

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

  if (cuentas === null) return <p className="mt-6 text-xl text-texto-suave">Buscando…</p>;

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
          <li key={c.id}>
            <Tarjeta titulo={c.nombreCompleto}>
              <Insignia tono={estadoDe(c).tono}>{estadoDe(c).texto}</Insignia>
              <p className="mt-2 text-xl text-texto">
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
            </Tarjeta>
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
