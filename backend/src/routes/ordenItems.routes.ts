// Las rutas solo declaran endpoints y su middleware. Sin lógica.
import { Router } from 'express';
import { postOrdenItem } from '../controllers/ordenItems.controller.js';
import { requireAuthDeLaCola } from '../middleware/auth.js';

export const ordenItemsRouter = Router();

// Los renglones de la boleta — SPEC-KRILINXI-068. Cualquier rol: es trabajo del mostrador, y el admin también atiende.
// Solo POST: el mostrador no corrige un renglón ya guardado (eso es del admin, SPEC-KRILINXI-071).
// La sesión de la cola del mostrador (SPEC-ALE186-018), como pagos y entregas: acepta un token vencido hace hasta
// 3 días y marca para el admin lo que suba una cuenta dada de baja.
ordenItemsRouter.use(requireAuthDeLaCola);

ordenItemsRouter.post('/', postOrdenItem);
