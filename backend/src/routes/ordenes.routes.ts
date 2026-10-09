// Las rutas solo declaran endpoints y su middleware. Sin lógica.
import { Router } from 'express';
import { patchOrden, postOrden } from '../controllers/ordenes.controller.js';
import { requireAuthDeLaCola } from '../middleware/auth.js';

export const ordenesRouter = Router();

// Todo lo de órdenes exige sesión. Cualquier rol registra y edita: es trabajo
// del mostrador, y el admin también atiende. Qué sucursal puede tocar cada uno
// lo decide el controller, porque depende del rol y no solo de tenerlo.
// La sesión de la cola del mostrador (SPEC-ALE186-018): acepta un token vencido
// hace hasta 3 días y marca para el admin lo que suba una cuenta dada de baja.
ordenesRouter.use(requireAuthDeLaCola);

ordenesRouter.post('/', postOrden);
ordenesRouter.patch('/:id', patchOrden);
