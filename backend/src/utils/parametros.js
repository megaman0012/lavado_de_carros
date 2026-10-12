/**
 * Parámetros del negocio editables desde el panel (tabla Parametro) - Total Clean Car
 *
 * Se leen con un valor por defecto: si la fila no existe (base recién creada,
 * pruebas) el sistema se comporta como antes de que el parámetro existiera.
 */

const prisma = require('../db');

const leer = async (clave, porDefecto, db = prisma) => {
  const p = await db.parametro.findUnique({ where: { clave } });
  return p ? p.valor : porDefecto;
};

// Entero en [min, max]; fuera de rango o ilegible, el valor por defecto
const leerEntero = async (clave, porDefecto, { min = 0, max = Infinity } = {}, db = prisma) => {
  const n = Number(await leer(clave, String(porDefecto), db));
  return Number.isInteger(n) && n >= min && n <= max ? n : porDefecto;
};

module.exports = { leer, leerEntero };
