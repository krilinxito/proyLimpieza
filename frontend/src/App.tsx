import { Route, Routes } from 'react-router-dom';
import { NoEncontrada } from './pages/NoEncontrada';
import { RUTAS } from './pages/rutas';

/**
 * Solo compone: recorre el registro de rutas y monta una <Route> por cada una. Añadir una
 * pantalla es añadir una entrada en `pages/rutas.tsx`, no tocar este archivo.
 */
export function App() {
  return (
    <Routes>
      {RUTAS.map((ruta) => (
        <Route key={ruta.camino} path={ruta.camino} element={ruta.elemento} />
      ))}
      <Route path="*" element={<NoEncontrada />} />
    </Routes>
  );
}
