import { useEffect, useState } from 'react';

export type RangoDeDias = { desde: string; hasta: string };

/**
 * El rango de días que se acerca en la vista grande de un gráfico por día — SPEC-KRILINXI-065. Trabaja con las fechas
 * (`2026-10-15`) de los días **ya cargados**: acercar no pide nada a la API.
 *
 * Guarda dos cosas: lo que la persona **eligió** (puede estar al revés mientras escribe) y lo que se **aplica**, que solo
 * cambia cuando lo elegido tiene sentido (`desde` no pasa de `hasta`). Con las fechas al revés, `invalido` es `true` para
 * que la pantalla lo diga en palabras, y el gráfico se queda como estaba. Las fechas ISO se comparan como texto: ordenan
 * igual que los días.
 *
 * Si cambian los días cargados (otro período en el filtro), vuelve a ver todos.
 */
export function useRangoDeDias(fechas: readonly string[]) {
  const primera = fechas[0] ?? '';
  const ultima = fechas.at(-1) ?? '';
  const todos: RangoDeDias = { desde: primera, hasta: ultima };

  const [elegido, setElegido] = useState<RangoDeDias>(todos);
  const [aplicado, setAplicado] = useState<RangoDeDias>(todos);

  useEffect(() => {
    setElegido({ desde: primera, hasta: ultima });
    setAplicado({ desde: primera, hasta: ultima });
  }, [primera, ultima]);

  function cambiar(nuevo: RangoDeDias) {
    setElegido(nuevo);
    if (nuevo.desde <= nuevo.hasta) setAplicado(nuevo);
  }

  return {
    elegido,
    invalido: elegido.desde > elegido.hasta,
    /** ¿Se está viendo todo el período? Entonces "Ver todos" no tiene nada que hacer. */
    verTodo: aplicado.desde === primera && aplicado.hasta === ultima && elegido.desde === primera && elegido.hasta === ultima,
    cambiarDesde: (desde: string) => cambiar({ ...elegido, desde }),
    cambiarHasta: (hasta: string) => cambiar({ ...elegido, hasta }),
    verTodos: () => cambiar(todos),
    /** Lo de los días dentro del rango aplicado, en su orden. */
    recortar: <T extends { fecha: string }>(dias: readonly T[]): T[] => dias.filter((d) => d.fecha >= aplicado.desde && d.fecha <= aplicado.hasta),
  };
}
