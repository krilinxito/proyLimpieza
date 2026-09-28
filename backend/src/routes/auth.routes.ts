// Las rutas solo declaran endpoints y su middleware. Sin lógica.
import { Router } from 'express';
import { postLogin, postRenovar } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';

export const authRouter = Router();

// Pública: es la única puerta de entrada de quien todavía no tiene token.
authRouter.post('/login', postLogin);

// Con token: renovar no es volver a entrar, es estirar una sesión que ya
// existe. Si el token está vencido, la app pide la contraseña.
authRouter.post('/renovar', requireAuth, postRenovar);
