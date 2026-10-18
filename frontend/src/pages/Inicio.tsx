import { useId } from 'react';
import { Link } from 'react-router-dom';
import { Icono } from '../components/iconos';
import { AtenderEnUnaSucursal } from '../features/atencion/components/AtenderEnUnaSucursal';
import { useSucursalDeTrabajo } from '../features/atencion/hooks/useSucursalDeTrabajo';
import { useSession } from '../hooks/useSession';
import { Pantalla } from './Pantalla';
import { destinosDelMenu, type Destino } from './rutas';

/**
 * Una tarea del Inicio: una tarjeta entera que se toca (SPEC-KRILINXI-024).
 *
 * Toda la tarjeta es el enlace, para que no haya que apuntar a un texto chico. Su nombre (lo
 * que anuncia el lector de pantalla, y con lo que la encuentran los tests) es solo el título:
 * la descripción va aparte, como descripción del enlace (`aria-describedby`). Si no, el nombre
 * sería "Registrar ropa Cuando el cliente deja ropa: se anota…", demasiado largo para elegir.
 */
function TarjetaTarea({ destino }: { destino: Destino }) {
  const id = useId();
  return (
    <Link
      to={destino.camino}
      aria-labelledby={`${id}-titulo`}
      aria-describedby={`${id}-descripcion`}
      className="flex min-h-24 items-center gap-4 rounded-2xl border-2 border-borde-suave bg-superficie p-5 shadow-sm transition-colors hover:border-marca focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-foco"
    >
      <span className="rounded-xl bg-marca-suave p-3 text-marca">
        <Icono nombre={destino.icono} tamano="size-10" />
      </span>
      <span className="min-w-0">
        <span id={`${id}-titulo`} className="block text-2xl font-bold text-texto">
          {destino.titulo}
        </span>
        <span id={`${id}-descripcion`} className="mt-1 block text-lg text-texto-suave">
          {destino.descripcion}
        </span>
      </span>
    </Link>
  );
}

/**
 * El Inicio: las tareas de quien entró, en palabras del negocio (CLAUDE.md §9). Cada uno ve
 * solo lo que puede abrir, en el mismo orden que el menú, porque salen de la misma lista
 * (`destinosDelMenu`, sin el propio Inicio).
 *
 * El ADMIN, además, puede elegir una sucursal para atender el mostrador (SPEC-KRILINXI-029):
 * mientras atiende, las tareas del mostrador aparecen con las suyas.
 */
export function Inicio() {
  const { sesion } = useSession();
  const usuario = sesion?.usuario;
  const conSucursal = useSucursalDeTrabajo() !== null;
  const tareas = usuario ? destinosDelMenu(usuario.rol, conSucursal).filter((d) => d.camino !== '/') : [];

  return (
    <Pantalla titulo="Lavandería">
      {usuario && <p className="mt-2 text-2xl text-texto-suave">Hola, {usuario.nombreCompleto}</p>}
      <AtenderEnUnaSucursal />
      <nav aria-label="Tareas" className="mt-8">
        <ul className="grid gap-4 lg:grid-cols-2">
          {tareas.map((destino) => (
            <li key={destino.camino}>
              <TarjetaTarea destino={destino} />
            </li>
          ))}
        </ul>
      </nav>
    </Pantalla>
  );
}
