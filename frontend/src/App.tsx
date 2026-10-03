import { Route, Routes } from 'react-router-dom';
import { AvisoSoloAdministrador } from './features/auth/components/AvisoSoloAdministrador';
import { BarraSesion } from './features/auth/components/BarraSesion';
import { RutaProtegida } from './features/auth/components/RutaProtegida';
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
      <BarraSesion />
      {ruta.elemento}
    </RutaProtegida>
  );
}

/**
 * Solo compone: recorre el registro de rutas y monta una <Route> por cada una. Añadir una
 * pantalla es añadir una entrada en `pages/rutas.tsx`, no tocar este archivo.
 */
export function App() {
  return (
    <Routes>
      {RUTAS.map((ruta) => (
        <Route key={ruta.camino} path={ruta.camino} element={elementoDe(ruta)} />
      ))}
      <Route path="*" element={<NoEncontrada />} />
    </Routes>
  );
}
