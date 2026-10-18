import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { SesionProvider } from './features/auth/SesionProvider';
import { aplicarTema } from './lib/tema';
import { registrarServiceWorker } from './pwa/registrar';
import './index.css';

// Antes de montar: la primera pantalla ya sale con el tema que corresponde (SPEC-KRILINXI-030).
aplicarTema();

const raiz = document.getElementById('root');
if (!raiz) throw new Error('No se encontró el elemento #root en index.html');

// El Router vive aquí y no dentro de App: así los tests pueden montar App en la ruta que
// quieran (con MemoryRouter) sin pelearse con la barra de direcciones del navegador.
// La sesión, por lo mismo: los tests montan su propio SesionProvider (test/render.tsx).
createRoot(raiz).render(
  <StrictMode>
    <BrowserRouter>
      <SesionProvider>
        <App />
      </SesionProvider>
    </BrowserRouter>
  </StrictMode>,
);

// Para que la app abra sin internet (SPEC-KRILINXI-011). Solo en la app compilada: en
// `npm run dev` y en los tests no hace nada.
void registrarServiceWorker({ produccion: import.meta.env.PROD, navegador: navigator, base: import.meta.env.BASE_URL });
