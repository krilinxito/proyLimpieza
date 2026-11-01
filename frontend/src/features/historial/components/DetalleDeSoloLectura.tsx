import type { ReactNode } from 'react';
import { AvisoSinRed } from '../../../components/AvisosAdmin';
import { Boton } from '../../../components/Boton';
import { Icono } from '../../../components/iconos';
import { Insignia } from '../../../components/Insignia';
import { Tarjeta } from '../../../components/Tarjeta';
import { TEXTO_ESTADO_ORDEN } from '../../../lib/dominio';
import { formatearBs } from '../../../lib/money';
import { fechaCorta } from '../../ordenes/components/fechas';
import { ListaDeRenglones } from '../../ordenes/components/ListaDeRenglones';
import { TONO_ESTADO } from '../../ordenes/estado';
import { paresDelReembolso, textoDelRetiro } from '../../ordenes/retiro';
import { useEnLinea } from '../../../hooks/useEnLinea';
import type { BoletaListada } from '../types';
import { textoDelSaldo } from './FilaDeBoleta';

/** Pares dato/valor, uno debajo del otro (como el detalle de una boleta del Mostrador). */
function Datos({ pares }: { pares: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-6 gap-y-2 text-xl">
      {pares.map(([dato, valor]) => (
        <div key={dato} className="contents">
          <dt className="font-semibold text-texto-suave">{dato}</dt>
          <dd className="text-texto whitespace-pre-line">{valor}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Una boleta de otra sucursal, para mirar y nada más — SPEC-KRILINXI-041. Es lo que ve el admin que
 * no está atendiendo: no tiene la ropa en la tablet, así que no hay con qué cobrar, entregar ni
 * anular, y por eso no se ofrece ninguna acción. Para tocarla tiene que atender en esa sucursal.
 *
 * Desde SPEC-KRILINXI-071 tiene una: "Corregir esta boleta" (`alCorregir`), que arregla lo que se registró mal. Va
 * directo a la API, así que sin internet el botón se apaga y se dice por qué.
 */
export function DetalleDeSoloLectura({
  boleta,
  alVolver,
  alCorregir,
}: {
  boleta: BoletaListada;
  alVolver: () => void;
  /** Sin él (o sin los datos para corregirla), no se ofrece corregir. */
  alCorregir?: () => void;
}) {
  const enLinea = useEnLinea();
  const sePuedeCorregir = alCorregir !== undefined && boleta.origen !== null;
  return (
    <div className="mt-6">
      <Tarjeta titulo={`Boleta ${boleta.numeroBoleta}`}>
        <Datos
          pares={[
            ['Estado', <Insignia key="estado" tono={TONO_ESTADO[boleta.estado]}>{TEXTO_ESTADO_ORDEN[boleta.estado]}</Insignia>],
            ['Cliente', boleta.clienteNombre],
            ['Teléfono', boleta.clienteTelefono],
            ['Sucursal', boleta.sucursalNombre ?? ''],
            // Con renglones (SPEC-KRILINXI-068) se listan debajo; una boleta de antes muestra su descripción.
            ...(boleta.renglones.length > 0 ? [] : ([['Ropa', boleta.descripcion]] as [string, ReactNode][])),
            ['Entró', boleta.dia ? fechaCorta(boleta.dia) : 'Sin fecha'],
            ...(boleta.retiro ? ([['Retiró', textoDelRetiro(boleta.retiro)]] as [string, ReactNode][]) : []),
            ...paresDelReembolso(boleta.reembolso),
            ['Precio', formatearBs(boleta.precioTotal)],
            ...(boleta.precioFinal === null ? [] : ([['Precio final', formatearBs(boleta.precioFinal)]] as [string, ReactNode][])),
            ['Pagado', formatearBs(boleta.pagado)],
            ['Cuenta', textoDelSaldo(boleta)],
          ]}
        />
        <ListaDeRenglones renglones={boleta.renglones} />
      </Tarjeta>
      {sePuedeCorregir && (
        <div className="mt-6">
          {!enLinea && <AvisoSinRed />}
          <div className="mt-4">
            <Boton variante="secundario" onClick={alCorregir} disabled={!enLinea}>
              <Icono nombre="editar" />
              Corregir esta boleta
            </Boton>
          </div>
        </div>
      )}
      <div className="mt-6">
        <Boton variante="navegacion" onClick={alVolver}>
          Volver al historial
        </Boton>
      </div>
    </div>
  );
}
