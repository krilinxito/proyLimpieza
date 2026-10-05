// Las rutas solo declaran endpoints y su middleware. Sin lógica.
import { Router } from 'express';
import { patchUsuario, postUsuario } from '../controllers/usuarios.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRol } from '../middleware/roles.js';

export const usuariosRouter = Router();

// Dar de alta y de baja al personal es cosa del administrador (SPEC-ALE186-009).
usuariosRouter.use(requireAuth, requireRol('ADMIN'));

usuariosRouter.post('/', postUsuario);
usuariosRouter.patch('/:id', patchUsuario);
