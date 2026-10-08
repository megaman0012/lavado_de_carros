/**
 * Sesiones (refresh token) - Total Clean Car
 *
 * Problema que resuelve: antes el token de acceso duraba 24 horas y no había
 * forma de anularlo. Quien se quedaba con el token de un operador —un celular
 * prestado, un localStorage leído— tenía un día entero de acceso, y cerrar
 * sesión solo lo borraba del navegador propio.
 *
 * Ahora son dos piezas:
 *
 *   - Token de ACCESO: el JWT de siempre, pero de 15 minutos. No se guarda en
 *     ningún lado; vale por su firma. Robado, caduca solo.
 *   - Token de REFRESCO: una cadena aleatoria opaca (no un JWT: no dice nada ni
 *     vale por sí misma) de 7 días, guardada en la tabla RefreshToken. Es lo que
 *     permite pedir un acceso nuevo sin volver a escribir la contraseña, y es
 *     revocable: cerrar sesión o suspender a alguien la corta de verdad.
 *
 * En la tabla se guarda solo el SHA-256 del token. No hace falta bcrypt como con
 * las contraseñas: estos tokens son 48 bytes aleatorios, no palabras que se
 * puedan adivinar con un diccionario, así que no hay nada que un hash lento
 * proteja. Lo que importa es que, si alguien lee la tabla, no se lleve sesiones
 * usables.
 *
 * ROTACIÓN Y DETECCIÓN DE REUSO
 * Cada refresco quema el token usado y entrega otro de la misma `familia` (la
 * cadena de rotaciones de un mismo inicio de sesión). Si llega un token que ya
 * estaba revocado, hay dos copias dando vueltas: se revoca la familia entera. La
 * víctima vuelve a iniciar sesión; el atacante se queda sin nada.
 *
 * La consecuencia conocida: dos pestañas refrescando a la vez pueden parecer un
 * reuso y cerrar la sesión. Por eso el cliente serializa el refresco (una sola
 * llamada en vuelo, ver services/api.ts en el frontend).
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const prisma = require('../db');
const config = require('../config');

const DIA_MS = 24 * 60 * 60 * 1000;

const hashear = (token) => crypto.createHash('sha256').update(token).digest('hex');

// Datos del usuario que viajan dentro del JWT (lo que leen authenticate y los controladores)
const contenidoToken = (usuario) => ({
  id: usuario.id,
  username: usuario.username,
  rol: usuario.rol,
  id_cliente: usuario.id_cliente || null,
  id_lavador: usuario.id_lavador || null
});

const firmarAcceso = (usuario) =>
  jwt.sign(contenidoToken(usuario), config.JWT_SECRET, { expiresIn: config.JWT_EXPIRES_IN });

/**
 * Crea un refresh token para un usuario.
 * @param {number} idUsuario
 * @param {string} [familia] continuar una sesión existente; sin esto empieza una nueva
 * @param {object} [db] cliente Prisma o transacción
 */
const emitirRefresh = async (idUsuario, familia, db = prisma) => {
  const token = crypto.randomBytes(48).toString('hex');
  const expira = new Date(Date.now() + config.REFRESH_EXPIRA_DIAS * DIA_MS);
  await db.refreshToken.create({
    data: {
      token_hash: hashear(token),
      id_usuario: idUsuario,
      familia: familia || crypto.randomUUID(),
      expira
    }
  });
  return { token, expira };
};

// Borra las sesiones ya inservibles del usuario para que la tabla no crezca sin
// freno. Se llama al iniciar sesión: es el momento natural y cuesta un DELETE.
const purgarVencidas = (idUsuario, db = prisma) =>
  db.refreshToken.deleteMany({
    where: {
      id_usuario: idUsuario,
      OR: [
        { expira: { lt: new Date() } },
        // Las revocadas se conservan un día para poder detectar el reuso de una
        // copia robada; pasado eso ya no aportan nada.
        { revocado: true, createdAt: { lt: new Date(Date.now() - DIA_MS) } }
      ]
    }
  });

/** Inicio de sesión: token de acceso + refresh nuevo. */
const abrirSesion = async (usuario) => {
  await purgarVencidas(usuario.id);
  const refresh = await emitirRefresh(usuario.id);
  return {
    token: firmarAcceso(usuario),
    refresh_token: refresh.token,
    refresh_expira: refresh.expira
  };
};

const error401 = (mensaje) => Object.assign(new Error(mensaje), { statusCode: 401 });

/**
 * Canjea un refresh token por uno de acceso nuevo, rotándolo.
 * Lanza un error con statusCode 401 si el token no sirve (inexistente, vencido,
 * reusado) o si la cuenta dejó de estar activa.
 */
const refrescar = async (tokenPlano) => {
  if (!tokenPlano || typeof tokenPlano !== 'string') {
    throw error401('Falta el token de refresco');
  }
  const hash = hashear(tokenPlano);

  const guardado = await prisma.refreshToken.findUnique({ where: { token_hash: hash } });
  if (!guardado) throw error401('Sesión no válida. Inicie sesión de nuevo.');

  if (guardado.revocado) {
    // Alguien está reusando una copia: se corta la sesión completa.
    await prisma.refreshToken.updateMany({
      where: { familia: guardado.familia, revocado: false },
      data: { revocado: true }
    });
    throw error401('Se detectó un uso indebido de la sesión. Inicie sesión de nuevo.');
  }
  if (guardado.expira < new Date()) {
    throw error401('La sesión expiró. Inicie sesión de nuevo.');
  }

  // La cuenta pudo suspenderse mientras la sesión seguía viva: el refresco es
  // justo donde eso tiene que notarse, igual que lo revisa auth.middleware.
  const usuario = await prisma.usuario.findUnique({
    where: { id: guardado.id_usuario },
    include: {
      cliente: { select: { id: true, nombre: true, estado: true } },
      lavador: { select: { id: true, nombre: true, estado: true } }
    }
  });
  const suspendido = !usuario || usuario.estado !== 'activo' ||
    (usuario.cliente && usuario.cliente.estado !== 'activo') ||
    (usuario.lavador && usuario.lavador.estado !== 'activo');
  if (suspendido) {
    await prisma.refreshToken.updateMany({
      where: { familia: guardado.familia, revocado: false },
      data: { revocado: true }
    });
    throw error401('Esta cuenta está suspendida. Comuníquese con nosotros.');
  }

  // El UPDATE condicional (revocado: false) es lo que hace atómica la rotación:
  // si dos refrescos del mismo token llegan a la vez, solo uno marca la fila y
  // el otro ve 0 filas afectadas y queda tratado como reuso.
  const quemado = await prisma.refreshToken.updateMany({
    where: { id: guardado.id, revocado: false },
    data: { revocado: true }
  });
  if (quemado.count === 0) {
    await prisma.refreshToken.updateMany({
      where: { familia: guardado.familia, revocado: false },
      data: { revocado: true }
    });
    throw error401('Se detectó un uso indebido de la sesión. Inicie sesión de nuevo.');
  }

  const nuevo = await emitirRefresh(usuario.id, guardado.familia);
  return {
    usuario,
    token: firmarAcceso(usuario),
    refresh_token: nuevo.token,
    refresh_expira: nuevo.expira
  };
};

/**
 * Cierre de sesión: revoca la familia del token entregado.
 * No falla si el token no existe — cerrar sesión siempre "funciona" desde la
 * vista del usuario, y responder distinto delataría qué tokens son válidos.
 */
const cerrarSesion = async (tokenPlano) => {
  if (!tokenPlano) return;
  const guardado = await prisma.refreshToken.findUnique({ where: { token_hash: hashear(tokenPlano) } });
  if (!guardado) return;
  await prisma.refreshToken.updateMany({
    where: { familia: guardado.familia, revocado: false },
    data: { revocado: true }
  });
};

/** Corta TODAS las sesiones de un usuario (suspensión, cambio de contraseña). */
const revocarUsuario = (idUsuario, db = prisma) =>
  db.refreshToken.updateMany({
    where: { id_usuario: idUsuario, revocado: false },
    data: { revocado: true }
  });

module.exports = {
  abrirSesion,
  refrescar,
  cerrarSesion,
  revocarUsuario,
  emitirRefresh,
  purgarVencidas,
  firmarAcceso,
  contenidoToken,
  hashear
};
