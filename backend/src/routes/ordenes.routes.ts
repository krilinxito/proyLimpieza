// Las rutas solo declaran endpoints y su middleware. Sin lógica.
import { Router } from 'express';
import { getOrdenes, patchOrden, postOrden } from '../controllers/ordenes.controller.js';
import { requireAuth, requireAuthDeLaCola } from '../middleware/auth.js';
import { requireRol } from '../middleware/roles.js';

export const ordenesRouter = Router();

// El historial es del ADMIN y es una lectura online (SPEC-KRILINXI-040). Va ANTES
// del `use` de abajo, con `requireAuth` a secas: la sesión de la cola acepta
// tokens vencidos, y eso es solo para subir lo que escribió el mostrador.
ordenesRouter.get('/', requireAuth, requireRol('ADMIN'), getOrdenes);

// Todo lo de órdenes exige sesión. Cualquier rol registra y edita: es trabajo
// del mostrador, y el admin también atiende. Qué sucursal puede tocar cada uno
// lo decide el controller, porque depende del rol y no solo de tenerlo.
// La sesión de la cola del mostrador (SPEC-ALE186-018): acepta un token vencido
// hace hasta 3 días y marca para el admin lo que suba una cuenta dada de baja.
ordenesRouter.use(requireAuthDeLaCola);

ordenesRouter.post('/', postOrden);
ordenesRouter.patch('/:id', patchOrden);
