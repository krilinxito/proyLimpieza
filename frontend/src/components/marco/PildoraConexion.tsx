import { useEffect, useId, useRef, useState } from 'react';
import { Icono } from '../iconos';
import { fraseConexion, resumenConexion, type EstadoConexion } from '../textoConexion';

/**
 * El estado de la conexión, discreto, en una esquina de la cabecera — SPEC-KRILINXI-031.
 *
 * Sigue diciéndolo en palabras (CLAUDE.md §9), solo que corto: "Con internet", "Sin internet ·
 * 3 por guardar". Sin internet cambia de color, pero el texto es el que lo dice: el color solo
 * acompaña. Al tocarla se despliega la frase completa de siempre; Escape o tocar fuera la cierran.
 *
 * Va dentro de un `role="status"`: cuando se corta o vuelve la conexión, el lector de pantalla lo
 * anuncia sin interrumpir (como el aviso grande, que el marco muestra solo si hay algo para
 * corregir). Recibe los números por props: quien los saca de la base es `useConexion`.
 */
export function PildoraConexion(estado: EstadoConexion) {
  const [abierta, setAbierta] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!abierta) return;
    function alTocarFuera(evento: PointerEvent) {
      if (!contenedor.current?.contains(evento.target as Node)) setAbierta(false);
    }
    function alTeclear(evento: KeyboardEvent) {
      if (evento.key !== 'Escape') return;
      setAbierta(false);
      boton.current?.focus();
    }
    document.addEventListener('pointerdown', alTocarFuera);
    document.addEventListener('keydown', alTeclear);
    return () => {
      document.removeEventListener('pointerdown', alTocarFuera);
      document.removeEventListener('keydown', alTeclear);
    };
  }, [abierta]);

  const color = estado.conectado
    ? 'border-borde-suave bg-superficie text-texto-suave'
    : 'border-advertencia-borde bg-advertencia-fondo text-advertencia-texto';

  return (
    <div ref={contenedor} className="relative">
      <div role="status">
        <button
          ref={boton}
          type="button"
          aria-expanded={abierta}
          aria-controls={id}
          onClick={() => setAbierta((a) => !a)}
          className={`inline-flex min-h-12 items-center gap-2 rounded-full border-2 px-4 text-base font-semibold whitespace-nowrap focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-foco ${color}`}
        >
          <Icono nombre={estado.conectado ? 'informacion' : 'advertencia'} tamano="size-5" />
          {resumenConexion(estado)}
        </button>
      </div>
      {abierta && (
        <p
          id={id}
          className={`absolute right-0 z-40 mt-2 w-72 rounded-xl border-2 px-4 py-3 text-lg shadow-md ${color}`}
        >
          {fraseConexion(estado)}
        </p>
      )}
    </div>
  );
}
