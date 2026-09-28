// Las rutas solo declaran endpoints y su middleware. Sin lógica.
import { Router } from 'express';
import { patchCliente, postCliente } from '../controllers/clientes.controller.js';
import { requireAuth } from '../middleware/auth.js';

export const clientesRouter = Router();

// Todo lo de clientes exige sesión. Cualquier rol puede dar de alta y editar:
// es trabajo del mostrador, y el admin también atiende.
clientesRouter.use(requireAuth);

clientesRouter.post('/', postCliente);
clientesRouter.patch('/:id', patchCliente);
