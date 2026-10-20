type Props = {
  /** Dónde va y cuánto ocupa, como atributos de SVG: números o porcentajes ("42%"), nunca un `style`. */
  x: string;
  y: string;
  width: string;
  height: string | number;
  /** Hacia dónde crece: la punta de ese lado va redondeada, la base sobre el cero queda recta. */
  hacia: 'derecha' | 'arriba';
  clase: string;
};

/**
 * Una barra de una sola pieza, con la punta redondeada y la base recta — SPEC-KRILINXI-036.
 *
 * Antes eran dos rectángulos: uno redondeado y otro recto encima que tapaba las esquinas del lado
 * del cero. El borde del segundo, suavizado por el navegador, dejaba una costura vertical en medio
 * de la barra. Acá es un solo rectángulo redondeado, más largo que la barra hacia el lado del cero,
 * dentro de un `<svg>` del tamaño de la barra: un `<svg>` anidado recorta lo que sale de él, así que
 * las esquinas sobrantes no se dibujan. Todo con atributos en porcentajes, sin `viewBox` ni `style`.
 */
export function PuntaRedondeada({ x, y, width, height, hacia, clase }: Props) {
  const rectangulo =
    hacia === 'derecha'
      ? { x: '-50%', y: '0', width: '150%', height: '100%' }
      : { x: '0', y: '0', width: '100%', height: '150%' };
  return (
    <svg data-barra="" x={x} y={y} width={width} height={height} className="overflow-hidden">
      <rect {...rectangulo} rx="4" className={clase} />
    </svg>
  );
}
