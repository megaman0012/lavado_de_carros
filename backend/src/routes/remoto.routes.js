/**
 * Rutas de Lavado remoto - Total Clean Car
 *
 *   /api/sectores    zonas con traslado y recargo (admin/operador; de su ciudad)
 *   /api/unidades    equipos móviles y sus lavadores (admin/operador; de su ciudad)
 *   /api/visitas     operación del día; el lavador opera las de su equipo
 *   /api/parametros  cargo por visita fallida (lee el panel, cambia el admin)
 */

const express = require('express');
const remoto = require('../controllers/remoto.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');

const interno = [authenticate, requireRole('admin', 'operador')];

const sectores = express.Router();
sectores.use(...interno);
sectores.get('/', remoto.listarSectores);
sectores.post('/', remoto.crearSector);
sectores.put('/:id', remoto.actualizarSector);

const unidades = express.Router();
unidades.use(...interno);
unidades.get('/', remoto.listarUnidades);
unidades.post('/', remoto.crearUnidad);
unidades.put('/:id', remoto.actualizarUnidad);

const visitas = express.Router();
visitas.use(authenticate, requireRole('admin', 'operador', 'lavador'));
visitas.get('/', remoto.listarVisitas);
visitas.get('/reporte', requireRole('admin', 'operador'), remoto.reporte);
visitas.put('/:id/en-camino', remoto.enCamino);
visitas.put('/:id/llegada', remoto.llegada);
visitas.put('/:id/fallida', remoto.fallida);

const parametros = express.Router();
parametros.use(...interno);
parametros.get('/', remoto.listarParametros);
parametros.put('/:clave', requireRole('admin'), remoto.guardarParametro);

module.exports = { sectores, unidades, visitas, parametros };
