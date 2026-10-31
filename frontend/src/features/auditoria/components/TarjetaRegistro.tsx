import { Insignia } from '../../../components/Insignia';
import { Tarjeta } from '../../../components/Tarjeta';
import { antes, cuando, motivoDelReembolso, queHizo, sobreQue, textoRevision } from '../describir';
import type { NombresConocidos, RegistroAuditoria } from '../types';

/**
 * Un registro: quién, qué hizo, sobre qué, dónde y cuándo; y lo que había antes, si cambió algo.
 * Desde SPEC-KRILINXI-027 es una `Tarjeta`, y lo que hay que revisar lleva arriba una `Insignia`
 * de advertencia: se encuentra de un vistazo al recorrer la lista, y la explicación sigue abajo.
 */
export function TarjetaRegistro({ registro, nombres }: { registro: RegistroAuditoria; nombres: NombresConocidos }) {
  const que = sobreQue(registro, nombres);
  const sucursal = registro.sucursalId ? nombres.sucursales.get(registro.sucursalId) : null;
  const { paso, llego } = cuando(registro);
  const cambios = antes(registro, nombres);
  const revision = textoRevision(registro.revision);
  const motivo = motivoDelReembolso(registro);

  return (
    <li>
      <Tarjeta>
        {revision && (
          <p className="mb-2">
            <Insignia tono="advertencia">Hay que revisar</Insignia>
          </p>
        )}
        <p className="text-xl font-semibold text-texto">
          {registro.usuario.nombreCompleto}: {queHizo(registro)}
          {que && ` — ${que}`}
        </p>
        <p className="mt-1 text-xl text-texto">
          {paso}
          {sucursal && ` · ${sucursal}`}
        </p>
        {llego && (
          <p className="mt-1 text-lg text-texto-suave">
            Se guardó en el sistema el {llego} (la tablet estaba sin internet).
          </p>
        )}
        {motivo && <p className="mt-2 text-xl text-texto">{motivo}</p>}
        {cambios.length > 0 && (
          <ul className="mt-2 grid gap-1 text-lg text-texto-suave">
            {cambios.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        )}
        {revision && <p className="mt-2 text-lg font-semibold text-advertencia-texto">{revision}</p>}
      </Tarjeta>
    </li>
  );
}
