/**
 * Utilidades de credenciales - Sistema de Lavado de Carros
 *
 * El panel da de alta clientes atendidos en sitio y lavadores, y en ambos casos
 * hace falta entregarle a la persona una contraseña provisional que pueda leer
 * en voz alta o anotar. Se genera legible a propósito (sin caracteres ambiguos)
 * y se devuelve UNA sola vez en la respuesta: en la BD queda solo el hash.
 */

const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// Sin 0/O/1/l/I para que no se confundan al dictarla por teléfono
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

const generarPasswordTemporal = (largo = 10) => {
  const bytes = crypto.randomBytes(largo);
  let salida = '';
  for (let i = 0; i < largo; i += 1) {
    salida += ALFABETO[bytes[i] % ALFABETO.length];
  }
  return salida;
};

const hashear = (password) => bcrypt.hash(password, 10);

module.exports = { generarPasswordTemporal, hashear };
