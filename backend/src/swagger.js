/**
 * Configuración de Swagger - Sistema de Lavado de Carros
 */

const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'API Lavado de Carros',
      version: '1.0.0',
      description: 'API REST para reservas de lavado de vehículos en estacionamientos (servicios expresos y limpieza profunda)',
      contact: { name: 'Equipo de Desarrollo' }
    },
    servers: [
      { url: 'http://localhost:3042/api', description: 'Servidor de desarrollo' }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        TipoServicio: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            nombre: { type: 'string' },
            descripcion: { type: 'string' },
            modalidad: { type: 'string', enum: ['expreso', 'profunda'] },
            duracion_min: { type: 'integer' },
            precio: { type: 'number' },
            activo: { type: 'boolean' }
          }
        },
        Estacionamiento: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            nombre: { type: 'string' },
            direccion: { type: 'string' },
            ciudad: { type: 'string' },
            horario_apertura: { type: 'string' },
            horario_cierre: { type: 'string' },
            admite_expreso: { type: 'boolean' }
          }
        },
        Reserva: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            codigo: { type: 'string', example: 'RES-2026-00001' },
            id_cliente: { type: 'integer' },
            id_vehiculo: { type: 'integer' },
            id_tipo_servicio: { type: 'integer' },
            modalidad: { type: 'string', enum: ['expreso', 'profunda'] },
            fecha: { type: 'string', format: 'date' },
            hora_inicio: { type: 'string', example: '09:00' },
            hora_fin: { type: 'string', example: '10:00' },
            estado: { type: 'string', enum: ['solicitada', 'confirmada', 'en_proceso', 'completada', 'cancelada', 'no_asistio'] },
            precio_final: { type: 'number' }
          }
        },
        FranjaDisponibilidad: {
          type: 'object',
          properties: {
            hora_inicio: { type: 'string' },
            hora_fin: { type: 'string' },
            capacidad: { type: 'integer' },
            ocupadas: { type: 'integer' },
            cupos: { type: 'integer' },
            disponible: { type: 'boolean' }
          }
        }
      }
    },
    security: [{ bearerAuth: [] }]
  },
  apis: ['./src/routes/*.js']
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = { swaggerSpec };
