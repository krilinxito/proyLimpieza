import { Paginas } from '../../../components/Paginas';
import { usePaginado } from '../../../hooks/usePaginado';
import { useProductividad } from '../hooks/useProductividad';
import type { Filtro } from '../periodo';
import type { Productividad } from '../types';
import { BarrasHorizontales } from './graficos/BarrasHorizontales';
import { COLOR_UNICO } from './graficos/colores';
import { masRecibidasPrimero } from './graficos/escalas';
import { Grafico } from './graficos/Grafico';
import { Detalle } from './Detalle';
import { AvisoDeTarjeta, Esqueleto } from './Esqueleto';
import { bs, veces } from './montos';
import { SeccionPanel } from './SeccionPanel';

type Fila = Productividad['porEmpleado'][number];

const clave = (f: Fila) => `${f.usuario.id}-${f.sucursal.id}`;
const quien = (f: Fila) => `${f.usuario.nombreCompleto} — ${f.sucursal.nombre}`;
const resumen = (f: Fila) => `Recibió ${f.ordenesRecibidas} · Cobró ${veces(f.cobros)} (${bs(f.montoCobrado)}) · Entregó ${f.entregas}`;

/**
 * ¿Cuánto atendió cada persona? — SPEC-KRILINXI-016, por sucursal; el detalle va plegado en "Ver el detalle"
 * (SPEC-KRILINXI-042). Quien trabajó en dos sucursales
 * aparece dos veces: cada registro cuenta en la sucursal donde se hizo (SPEC-ALE186-012).
 *
 * Desde SPEC-KRILINXI-026, arriba va un gráfico de cuánta ropa recibió cada uno, de más a menos.
 * Las personas no son un orden ni series distintas: todas las barras llevan el mismo color.
 *
 * Desde SPEC-KRILINXI-050 pide su propio dato (`useProductividad`) cuando se despliega "Ver más estadísticas",
 * y por eso tiene su propio esqueleto y su propio aviso si falla.
 */
export function SeccionProductividad({ filtro, periodo }: { filtro: Filtro; periodo: string }) {
  const { estado, recargar } = useProductividad(filtro);
  return (
    <SeccionPanel nombre="Lo que hizo cada persona" pregunta="¿Cuánto atendió cada persona?" periodo={periodo}>
      {estado.tipo === 'cargando' && <Esqueleto texto="Buscando lo que hizo cada persona…" />}
      {(estado.tipo === 'sin-conexion' || estado.tipo === 'error') && <AvisoDeTarjeta estado={estado} recargar={recargar} />}
      {estado.tipo === 'listo' && <PorPersona productividad={estado.datos} />}
    </SeccionPanel>
  );
}

function PorPersona({ productividad }: { productividad: Productividad }) {
  const filas = productividad.porEmpleado;
  const ordenadas = masRecibidasPrimero(filas);
  const paginas = usePaginado(filas, productividad);
  return (
    <>
      <Grafico
        nombre="Ropa recibida por cada persona"
        vacio={filas.length === 0}
        pista="Tocá una persona para ver todo lo que hizo."
        tabla={{
          encabezados: ['Persona', 'Sucursal', 'Recibió', 'Cobró', 'Monto cobrado', 'Entregó'],
          filas: ordenadas.map((f) => ({
            clave: clave(f),
            celdas: [f.usuario.nombreCompleto, f.sucursal.nombre, String(f.ordenesRecibidas), veces(f.cobros), bs(f.montoCobrado), String(f.entregas)],
          })),
        }}
      >
        {(elegir) => (
          <BarrasHorizontales
            maximo={Math.max(0, ...filas.map((f) => f.ordenesRecibidas))}
            elegir={elegir}
            barras={ordenadas.map((f) => ({
              clave: clave(f),
              etiqueta: `${f.usuario.nombreCompleto} (${f.sucursal.nombre})`,
              rotulo: `Recibió ${f.ordenesRecibidas}`,
              tramos: [{ clave: 'recibidas', valor: f.ordenesRecibidas, clase: COLOR_UNICO.marca }],
              detalle: `${quien(f)}: ${resumen(f)}`,
            }))}
          />
        )}
      </Grafico>
      {filas.length === 0 ? (
        <p className="mt-4 text-xl text-texto-suave">Nadie registró nada en este período.</p>
      ) : (
        <Detalle>
          <ul aria-label="Personas" className="mt-2 grid gap-3">
            {(paginas.visibles ?? []).map((f) => (
              <li key={clave(f)} className="rounded-xl border border-borde-suave p-4 text-xl">
                <p className="font-semibold text-texto">{quien(f)}</p>
                <p className="mt-1 text-texto-suave">{resumen(f)}</p>
              </li>
            ))}
          </ul>
          <Paginas pagina={paginas.pagina} total={paginas.total} porPagina={paginas.porPagina} irAPagina={paginas.irAPagina} nombre="Páginas de lo que hizo cada persona" />
        </Detalle>
      )}
    </>
  );
}
