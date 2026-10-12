/**
 * Rutas de Empresas - Total Clean Car
 *
 *   /api/empresas    panel: tarifas y cortes (admin y operador nacional; la
 *                    facturación es de todo el país, no de una ciudad)
 *   /api/cortes      un corte: ver, facturar, pagar, anular, exportar
 *   /api/mi-empresa  el gestor de flota de la empresa logueada
 */

const express = require('express');
const empresa = require('../controllers/empresa.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');
const { requireNacional } = require('../utils/alcance');
const { limitadorReportes } = require('../middleware/rateLimit.middleware');

const panel = [authenticate, requireRole('admin', 'operador'), requireNacional];

const empresas = express.Router();
empresas.use(...panel);
empresas.get('/', empresa.listar);
empresas.get('/:id/tarifas', empresa.verTarifas);
empresas.put('/:id/tarifas', empresa.guardarTarifas);
empresas.get('/:id/corte-previo', empresa.previo);
empresas.get('/:id/cortes', empresa.listarCortes);
empresas.post('/:id/cortes', empresa.cerrarCorte);

const cortes = express.Router();
cortes.use(...panel);
cortes.get('/:id', empresa.verCorte);
cortes.get('/:id/excel', limitadorReportes, empresa.excelCorte);
cortes.put('/:id/facturar', empresa.facturarCorte);
cortes.put('/:id/pagar', empresa.pagarCorte);
cortes.put('/:id/anular', empresa.anularCorte);

const miEmpresa = express.Router();
miEmpresa.use(authenticate, requireRole('cliente'), empresa.soloEmpresa);
miEmpresa.get('/resumen', empresa.miResumen);
miEmpresa.get('/cortes', empresa.misCortes);
miEmpresa.get('/cortes/:id/excel', limitadorReportes, empresa.miCorteExcel);
miEmpresa.get('/sitios', empresa.misSitios);
miEmpresa.get('/tarifas', empresa.misTarifas);

module.exports = { empresas, cortes, miEmpresa };
