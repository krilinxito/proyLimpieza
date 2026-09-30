import { useState } from 'react';
import { Boton } from '../../../components/Boton';
import { ModalConfirmacion } from '../../../components/ModalConfirmacion';
import { useSession } from '../../../hooks/useSession';

/**
 * Arriba de cada pantalla: quién está atendiendo, y cómo salir.
 *
 * Salir pide confirmación porque sin internet no tiene vuelta atrás: el login necesita al
 * servidor, así que quien sale sin conexión deja la tablet sin poder usarse.
 */
export function BarraSesion() {
  const { sesion, salir } = useSession();
  const [confirmando, setConfirmando] = useState(false);

  if (!sesion) return null;

  return (
    <header className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 pt-4">
      <p className="text-xl text-slate-700">
        Atiende: <strong className="text-slate-900">{sesion.usuario.nombreCompleto}</strong>
      </p>
      <div className="w-32">
        <Boton variante="secundario" onClick={() => setConfirmando(true)}>
          Salir
        </Boton>
      </div>
      <ModalConfirmacion
        abierto={confirmando}
        titulo="¿Salir del sistema?"
        mensaje="Para volver a entrar vas a necesitar tu usuario, tu contraseña y conexión a internet."
        textoConfirmar="Sí, salir"
        onConfirmar={salir}
        onCancelar={() => setConfirmando(false)}
      />
    </header>
  );
}
