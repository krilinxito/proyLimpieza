import { CampoTexto } from '../../../components/CampoTexto';

type Props = {
  /** `null` mientras no eligió. */
  traeBoleta: boolean | null;
  nombre: string;
  carnet: string;
  alElegirBoleta: (traeBoleta: boolean) => void;
  alCambiarNombre: (valor: string) => void;
  alCambiarCarnet: (valor: string) => void;
  errores: { traeBoleta?: string; retiradoPorNombre?: string; retiradoPorCarnet?: string };
};

/**
 * Quién retira la ropa: si trae la boleta y, si no la trae, su nombre y su carnet (CLAUDE.md §3). Lo usan la entrega
 * común (SPEC-KRILINXI-009) y la que sale sin cobrar (SPEC-KRILINXI-070), que piden lo mismo y por eso lo comparten.
 */
export function CamposDeRetiro({ traeBoleta, nombre, carnet, alElegirBoleta, alCambiarNombre, alCambiarCarnet, errores }: Props) {
  return (
    <>
      <fieldset aria-describedby={errores.traeBoleta ? 'trae-boleta-error' : undefined}>
        <legend className="text-xl font-semibold text-texto">¿El cliente trae la boleta?</legend>
        <div className="mt-2 grid grid-cols-2 gap-3">
          {[
            { valor: true, texto: 'Trae la boleta' },
            { valor: false, texto: 'No trae la boleta' },
          ].map(({ valor, texto }) => (
            <label
              key={texto}
              className={`flex min-h-14 items-center gap-3 rounded-lg border-2 px-4 text-xl ${
                traeBoleta === valor ? 'border-marca bg-marca-suave font-semibold' : 'border-borde bg-superficie'
              }`}
            >
              <input
                type="radio"
                name="trae-boleta"
                className="size-6"
                checked={traeBoleta === valor}
                onChange={() => alElegirBoleta(valor)}
              />
              {texto}
            </label>
          ))}
        </div>
        {errores.traeBoleta && (
          <p id="trae-boleta-error" className="mt-2 text-lg font-semibold text-peligro-texto">
            {errores.traeBoleta}
          </p>
        )}
      </fieldset>

      {traeBoleta === false && (
        <>
          <CampoTexto
            etiqueta="Nombre de quien retira"
            value={nombre}
            onChange={alCambiarNombre}
            error={errores.retiradoPorNombre}
            autoComplete="off"
          />
          <CampoTexto
            etiqueta="Carnet de quien retira"
            value={carnet}
            onChange={alCambiarCarnet}
            error={errores.retiradoPorCarnet}
            autoComplete="off"
          />
        </>
      )}
    </>
  );
}
