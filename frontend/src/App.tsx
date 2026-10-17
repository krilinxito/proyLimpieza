import { Route, Routes } from 'react-router-dom';
import { AvisoSoloAdministrador } from './features/auth/components/AvisoSoloAdministrador';
import { RutaProtegida } from './features/auth/components/RutaProtegida';
import { Marco } from './pages/Marco';
import { NoEncontrada } from './pages/NoEncontrada';
import { Pantalla } from './pages/Pantalla';
import { RUTAS, type Ruta } from './pages/rutas';

/** Lo que se monta para una ruta: tal cual si es pública, detrás del portero si no. */
function elementoDe(ruta: Ruta) {
  if (ruta.acceso === 'publica') return ruta.elemento;
  return (
    <RutaProtegida
      roles={ruta.acceso}
      sinPermiso={
        ruta.sinPermiso ?? (
          <Pantalla titulo={ruta.titulo}>
            <AvisoSoloAdministrador />
          </Pantalla>
        )
      }
    >
      {ruta.elemento}
    </RutaProtegida>
  );
}

/**
 * Solo compone: recorre el registro de rutas y monta una <Route> por cada una. Añadir una
 * pantalla es añadir una entrada en `pages/rutas.tsx`, no tocar este archivo.
 *
 * Todas cuelgan del marco (SPEC-KRILINXI-023): una ruta sin `path` que solo pone cabecera, menú
 * y pie alrededor de la pantalla que toque.
 */
export function App() {
  return (
    <Routes>
      <Route element={<Marco />}>
        {RUTAS.map((ruta) => (
          <Route key={ruta.camino} path={ruta.camino} element={elementoDe(ruta)} />
        ))}
        <Route path="*" element={<NoEncontrada />} />
      </Route>
    </Routes>
  );
}
