type Serie = { clave: string; texto: string; muestra: string };

type Props = {
  nombre: string;
  series: readonly Serie[];
  /**
   * Solo en la vista grande (SPEC-KRILINXI-065): con `alAlternar`, cada serie es un botón que la apaga o la prende, y
   * `apagadas` dice cuáles están apagadas. Sin él, la leyenda es la lista de siempre.
   */
  apagadas?: ReadonlySet<string>;
  alAlternar?: (clave: string) => void;
};

/**
 * Qué color es qué — SPEC-KRILINXI-026. Con dos o más series siempre hay leyenda: el color nunca
 * dice algo solo. El texto va en el color del texto, y el cuadradito de al lado lleva la serie.
 *
 * En la vista grande (SPEC-KRILINXI-065) se puede **apagar y prender** cada serie, con el teclado y con el dedo. Una serie
 * apagada lo dice en palabras ("Efectivo (apagada)") y con el texto tachado: no depende solo de que el cuadradito se
 * vea más pálido. El botón avisa su estado con `aria-pressed` (prendida = presionado).
 */
export function Leyenda({ nombre, series, apagadas, alAlternar }: Props) {
  return (
    <ul aria-label={nombre} className="flex flex-wrap gap-x-6 gap-y-2">
      {series.map(({ clave, texto, muestra }) => {
        const apagada = apagadas?.has(clave) ?? false;
        const cuadrito = <span aria-hidden="true" className={`size-4 shrink-0 rounded ${muestra} ${apagada ? 'opacity-30' : ''}`} />;
        return (
          <li key={clave} className="text-lg text-texto">
            {alAlternar ? (
              <button
                type="button"
                aria-pressed={!apagada}
                onClick={() => alAlternar(clave)}
                className="flex min-h-12 items-center gap-2 rounded-lg border-2 border-borde px-3 hover:bg-fondo focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-foco"
              >
                {cuadrito}
                <span className={apagada ? 'line-through' : ''}>
                  {texto}
                  {apagada ? ' (apagada)' : ''}
                </span>
              </button>
            ) : (
              <span className="flex items-center gap-2">
                {cuadrito}
                {texto}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
