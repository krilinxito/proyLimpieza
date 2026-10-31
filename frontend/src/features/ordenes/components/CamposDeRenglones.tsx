import { Boton } from '../../../components/Boton';
import { CampoTexto } from '../../../components/CampoTexto';
import { formatearBs } from '../../../lib/money';
import { renglonNuevo, subtotalEscrito, totalEscrito, type CampoRenglon, type RenglonEscrito } from '../renglones';

type Props = {
  renglones: RenglonEscrito[];
  alCambiar: (renglones: RenglonEscrito[]) => void;
  /** Cómo se llama cada uno en pantalla: "Prenda" en la boleta, "Cargo" al entregar. */
  nombre: 'Prenda' | 'Cargo';
  /** El texto del botón que agrega otro: "Agregar otra prenda", "Agregar un cargo". */
  textoAgregar: string;
  /** Si la lista puede quedar vacía: los cargos sí (no hay ninguno), la boleta no (siempre tiene al menos uno). */
  puedeQuedarVacia?: boolean;
  /** El error de un campo de un renglón, si hay que mostrarlo. */
  errorDe?: (clave: string, campo: CampoRenglon) => string | undefined;
  /** Si un campo ya está bien (el visto de SPEC-KRILINXI-058). */
  correcto?: (clave: string, campo: CampoRenglon) => boolean;
  alSalirDe?: (clave: string, campo: CampoRenglon) => void;
  /** Cómo se dice la suma: "Total", "Cargos". */
  textoTotal: string;
  deshabilitado?: boolean;
};

/**
 * Los renglones de la boleta mientras se escriben — SPEC-KRILINXI-068: por cada uno, qué es, cuántas y el precio de cada
 * una, con su subtotal debajo; al final, la suma. Lo usan Registrar ropa (las prendas) y la entrega (los cargos).
 *
 * Cada renglón es un grupo con su nombre ("Prenda 1"), así sus tres campos se llaman igual en todos ("Qué es",
 * "Cuántas") sin confundirse: el lector de pantalla dice el grupo antes del campo, y los tests los buscan dentro de él.
 * La suma se anuncia sola (`aria-live`) cuando cambia. Todo se calcula con `../renglones.ts`, en centavos.
 */
export function CamposDeRenglones({
  renglones,
  alCambiar,
  nombre,
  textoAgregar,
  puedeQuedarVacia = false,
  errorDe = () => undefined,
  correcto = () => false,
  alSalirDe = () => undefined,
  textoTotal,
  deshabilitado = false,
}: Props) {
  const cambiar = (clave: string, campo: CampoRenglon) => (valor: string) =>
    alCambiar(renglones.map((r) => (r.clave === clave ? { ...r, [campo]: valor } : r)));
  const quitar = (clave: string) => alCambiar(renglones.filter((r) => r.clave !== clave));
  const sePuedeQuitar = puedeQuedarVacia || renglones.length > 1;

  return (
    <div className="grid gap-4">
      {renglones.map((renglon, i) => {
        const elSubtotal = subtotalEscrito(renglon);
        const titulo = `${nombre} ${i + 1}`;
        return (
          <fieldset key={renglon.clave} className="grid gap-1 rounded-lg border-2 border-borde p-4">
            <legend className="px-1 text-xl font-semibold text-texto">{titulo}</legend>
            <CampoTexto
              etiqueta="Qué es"
              value={renglon.descripcion}
              onChange={cambiar(renglon.clave, 'descripcion')}
              onBlur={() => alSalirDe(renglon.clave, 'descripcion')}
              error={errorDe(renglon.clave, 'descripcion')}
              correcto={correcto(renglon.clave, 'descripcion')}
              autoComplete="off"
              disabled={deshabilitado}
            />
            <div className="grid gap-x-3 sm:grid-cols-2">
              <CampoTexto
                etiqueta="Cuántas"
                value={renglon.cantidad}
                onChange={cambiar(renglon.clave, 'cantidad')}
                onBlur={() => alSalirDe(renglon.clave, 'cantidad')}
                error={errorDe(renglon.clave, 'cantidad')}
                correcto={correcto(renglon.clave, 'cantidad')}
                inputMode="decimal"
                autoComplete="off"
                disabled={deshabilitado}
              />
              <CampoTexto
                etiqueta="Precio de cada una (Bs)"
                value={renglon.precioUnitario}
                onChange={cambiar(renglon.clave, 'precioUnitario')}
                onBlur={() => alSalirDe(renglon.clave, 'precioUnitario')}
                error={errorDe(renglon.clave, 'precioUnitario')}
                correcto={correcto(renglon.clave, 'precioUnitario')}
                inputMode="decimal"
                autoComplete="off"
                disabled={deshabilitado}
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xl text-texto">
                Subtotal: <span className="font-semibold">{elSubtotal === null ? '—' : formatearBs(elSubtotal)}</span>
              </p>
              {sePuedeQuitar && (
                <Boton
                  variante="secundario"
                  tamano="compacto"
                  icono="cerrar"
                  onClick={() => quitar(renglon.clave)}
                  disabled={deshabilitado}
                >
                  {/* Dentro del grupo de su renglón: "Quitar" se lee después de "Prenda 2". */}
                  Quitar
                </Boton>
              )}
            </div>
          </fieldset>
        );
      })}
      <Boton variante="secundario" onClick={() => alCambiar([...renglones, renglonNuevo()])} disabled={deshabilitado}>
        {textoAgregar}
      </Boton>
      {renglones.length > 0 && (
        <p className="text-2xl text-texto" aria-live="polite">
          {textoTotal}: <span className="font-bold">{formatearBs(totalEscrito(renglones))}</span>
        </p>
      )}
    </div>
  );
}
