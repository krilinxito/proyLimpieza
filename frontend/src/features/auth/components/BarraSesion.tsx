import { useState } from 'react';
import { Boton } from '../../../components/Boton';
import { ModalConfirmacion } from '../../../components/ModalConfirmacion';
import { useConexion } from '../../../hooks/useConexion';
import { useSession } from '../../../hooks/useSession';

const PARA_VOLVER = 'Para volver a entrar vas a necesitar tu usuario, tu contraseña y conexión a internet.';

/**
 * Salir borra lo que hay en la tablet, también lo que todavía no llegó al servidor (CLAUDE.md
 * §13). Si queda algo, el aviso lo dice antes, con el número: SPEC-KRILINXI-010.
 */
function avisoDeSalida(pendientes: number): string {
  if (pendientes === 0) return PARA_VOLVER;
  const cuantos = pendientes === 1 ? 'Hay 1 registro que todavía no se guardó' : `Hay ${pendientes} registros que todavía no se guardaron`;
  const perder = pendientes === 1 ? 'se va a perder' : 'se van a perder';
  return `${cuantos} en el sistema. Si sales ahora, ${perder}. Espera a tener internet para que se guarden. ${PARA_VOLVER}`;
}

/**
 * Cómo salir. Va dentro de la cabecera del marco (SPEC-KRILINXI-023), por eso no es un `<header>` propio: dos
 * cabeceras serían dos "banner" para el lector de pantalla. Quién atiende (el círculo con la inicial) ya no se dibuja
 * acá: desde SPEC-KRILINXI-066 lo pone `MenuPerfil`, que en un celular esconde Salir tras ese círculo.
 *
 * Salir pide confirmación porque sin internet no tiene vuelta atrás: el login necesita al
 * servidor, así que quien sale sin conexión deja la tablet sin poder usarse.
 */
export function BarraSesion() {
  const { sesion, salir } = useSession();
  const pendientes = useConexion()?.pendientes ?? 0;
  const [confirmando, setConfirmando] = useState(false);

  if (!sesion) return null;

  return (
    // `contents`: la barra no hace caja propia, para que Salir se acomode como un hijo más de la cabecera o del panel.
    <div className="contents">
      <Boton variante="secundario" tamano="compacto" icono="salir" onClick={() => setConfirmando(true)}>
        Salir
      </Boton>
      <ModalConfirmacion
        abierto={confirmando}
        titulo="¿Salir del sistema?"
        mensaje={avisoDeSalida(pendientes)}
        textoConfirmar="Sí, salir"
        onConfirmar={salir}
        onCancelar={() => setConfirmando(false)}
      />
    </div>
  );
}
