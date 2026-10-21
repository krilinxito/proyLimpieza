import { useEffect, useState } from 'react';
import { tamanoDePagina } from '../lib/tamanoDePagina';

/**
 * Cuántas filas entran en una página en esta pantalla — SPEC-KRILINXI-041. Se vuelve a calcular si
 * la ventana cambia de tamaño (una tablet que se gira), pero solo hay un nuevo render cuando cambia
 * el resultado: arrastrar el borde de la ventana dentro del mismo rango no hace nada.
 */
export function useTamanoDePagina(): number {
  const [tamano, setTamano] = useState(() => tamanoDePagina(window.innerWidth));

  useEffect(() => {
    const ajustar = () => setTamano(tamanoDePagina(window.innerWidth));
    ajustar();
    window.addEventListener('resize', ajustar);
    return () => window.removeEventListener('resize', ajustar);
  }, []);

  return tamano;
}
