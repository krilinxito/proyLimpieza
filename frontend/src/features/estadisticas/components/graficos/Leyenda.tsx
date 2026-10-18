/**
 * Qué color es qué — SPEC-KRILINXI-026. Con dos o más series siempre hay leyenda: el color nunca
 * dice algo solo. El texto va en el color del texto, y el cuadradito de al lado lleva la serie.
 */
export function Leyenda({ nombre, series }: { nombre: string; series: readonly { clave: string; texto: string; muestra: string }[] }) {
  return (
    <ul aria-label={nombre} className="flex flex-wrap gap-x-6 gap-y-2">
      {series.map(({ clave, texto, muestra }) => (
        <li key={clave} className="flex items-center gap-2 text-lg text-texto">
          <span aria-hidden="true" className={`size-4 shrink-0 rounded ${muestra}`} />
          {texto}
        </li>
      ))}
    </ul>
  );
}
