// Las rutas solo declaran endpoints y su middleware. Sin lógica.
import { Router } from 'express';
import { patchSucursal, postSucursal } from '../controllers/sucursales.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRol } from '../middleware/roles.js';

export const sucursalesRouter = Router();

// Abrir, corregir y cerrar sucursales es cosa del administrador (SPEC-ALE186-011).
sucursalesRouter.use(requireAuth, requireRol('ADMIN'));

sucursalesRouter.post('/', postSucursal);
sucursalesRouter.patch('/:id', patchSucursal);
