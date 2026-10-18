import { useCallback, useEffect, useState } from 'react';
import { aplicarTema, guardarEleccion, seguirAlSistema, temaVigente, type Tema } from '../lib/tema';

/**
 * El tema de la app y cómo cambiarlo — SPEC-KRILINXI-030. Lo usa el marco para el botón de la
 * cabecera. Cambiar guarda la elección en la tablet y la aplica al momento; sin elección, sigue
 * al sistema en vivo (`lib/tema`).
 */
export function useTema(): { tema: Tema; cambiar: () => void } {
  const [tema, setTema] = useState<Tema>(temaVigente);

  useEffect(
    () =>
      seguirAlSistema((nuevo) => {
        aplicarTema(nuevo);
        setTema(nuevo);
      }),
    [],
  );

  const cambiar = useCallback(() => {
    const nuevo: Tema = temaVigente() === 'oscuro' ? 'claro' : 'oscuro';
    guardarEleccion(nuevo);
    aplicarTema(nuevo);
    setTema(nuevo);
  }, []);

  return { tema, cambiar };
}
