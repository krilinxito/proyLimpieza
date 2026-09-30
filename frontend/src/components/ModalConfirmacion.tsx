import { useEffect, useId } from 'react';
import { Boton } from './Boton';

type Props = {
  abierto: boolean;
  /** La pregunta: "¿Anular la orden 001234?" */
  titulo: string;
  /** Qué va a pasar, con palabras: "Esta acción no se puede deshacer." */
  mensaje: string;
  /** El verbo de la acción, no "Aceptar": "Sí, anular". */
  textoConfirmar: string;
  textoCancelar?: string;
  onConfirmar: () => void | Promise<void>;
  onCancelar: () => void;
  /** Pinta el botón de confirmar en rojo, para lo que no tiene vuelta atrás. */
  peligroso?: boolean;
};

/**
 * Confirmación explícita antes de una acción irreversible (CLAUDE.md §9).
 *
 * Solo `onConfirmar` ejecuta la acción. Cancelar, la tecla Escape o tocar fuera del cuadro
 * llaman a `onCancelar` y nada más. El foco empieza en "Cancelar": un Enter apurado no
 * puede anular una orden.
 *
 * Es controlado: no se cierra solo. Quien lo abre decide cuándo cerrarlo, normalmente en
 * `onConfirmar` después de que la acción termine.
 */
export function ModalConfirmacion({
  abierto,
  titulo,
  mensaje,
  textoConfirmar,
  textoCancelar = 'Cancelar',
  onConfirmar,
  onCancelar,
  peligroso = false,
}: Props) {
  const id = useId();

  useEffect(() => {
    if (!abierto) return;
    const alPresionar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') onCancelar();
    };
    document.addEventListener('keydown', alPresionar);
    return () => document.removeEventListener('keydown', alPresionar);
  }, [abierto, onCancelar]);

  if (!abierto) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-slate-900/60 p-4"
      onClick={(evento) => {
        // Solo el fondo: un click dentro del cuadro también burbujea hasta aquí.
        if (evento.target === evento.currentTarget) onCancelar();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-titulo`}
        aria-describedby={`${id}-mensaje`}
        className="w-full max-w-lg rounded-lg bg-white p-6"
      >
        <h2 id={`${id}-titulo`} className="text-2xl font-bold text-slate-900">
          {titulo}
        </h2>
        <p id={`${id}-mensaje`} className="mt-3 text-xl text-slate-700">
          {mensaje}
        </p>
        <div className="mt-6 grid gap-3">
          <Boton variante={peligroso ? 'peligro' : 'primario'} onClick={onConfirmar}>
            {textoConfirmar}
          </Boton>
          <Boton variante="secundario" autoFocus onClick={onCancelar}>
            {textoCancelar}
          </Boton>
        </div>
      </div>
    </div>
  );
}

