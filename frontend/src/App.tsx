import { Route, Routes } from 'react-router-dom';
import { AvisoConexion } from './components/AvisoConexion';
import { AvisoSoloAdministrador } from './features/auth/components/AvisoSoloAdministrador';
import { BarraSesion } from './features/auth/components/BarraSesion';
import { RutaProtegida } from './features/auth/components/RutaProtegida';
import { useConexion } from './hooks/useConexion';
import { NoEncontrada } from './pages/NoEncontrada';
import { Pantalla } from './pages/Pantalla';
import { RUTAS, type Ruta } from './pages/rutas';

/** El aviso de conexión con los números de la base local (SPEC-KRILINXI-007). */
function EstadoConexion() {
  const estado = useConexion();
  return estado && <AvisoConexion {...estado} />;
}

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
      <EstadoConexion />
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
