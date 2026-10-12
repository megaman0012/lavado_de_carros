/**
 * Alcance por ciudad de quien hace la petición - Total Clean Car
 *
 * La operación es nacional y cada ciudad tiene su operador. Un operador CON
 * ciudad solo ve y gestiona lo de ella (reservas, agenda, sitios, lavadores,
 * pagos, reportes); el admin y el operador SIN ciudad tienen alcance nacional y
 * pueden filtrar por la que quieran con ?id_ciudad=.
 *
 * La ciudad del usuario no viaja en el token: la carga authenticate() desde la
 * base en cada petición, así que cambiarle la ciudad a un operador rige en su
 * siguiente clic y no cuando le venza la sesión.
 */

const aEntero = (v) => {
  const n = parseInt(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

// Ciudad fija del usuario: la del operador o la del lavador; null = nacional.
const ciudadFija = (usuario) => {
  if (!usuario) return null;
  if (usuario.rol === 'operador' || usuario.rol === 'lavador') return usuario.id_ciudad || null;
  return null;
};

const esNacional = (usuario) => ['admin', 'operador'].includes(usuario?.rol) && !ciudadFija(usuario);

/**
 * Ciudad por la que filtrar: la fija del usuario manda (un operador de Quito no
 * puede pedir Guayaquil cambiando la URL); si no tiene, la que pidió, o null
 * para todo el país.
 */
const ciudadFiltro = (req) => ciudadFija(req.usuario) || aEntero(req.query?.id_ciudad);

/**
 * ¿Puede el usuario operar sobre algo de esta ciudad? Lo nacional puede todo.
 * `idCiudad` null (un bloqueo nacional, por ejemplo) solo lo toca lo nacional.
 */
const puedeVer = (usuario, idCiudad) => {
  const fija = ciudadFija(usuario);
  return !fija || fija === idCiudad;
};

// Respuesta estándar cuando el registro existe pero es de otra ciudad
const fueraDeAlcance = (res) =>
  res.status(403).json({ success: false, message: 'Ese registro pertenece a otra ciudad' });

// Middleware: catálogos que valen para todo el país (servicios, precios, planes,
// ciudades) solo los modifica quien tiene alcance nacional.
const requireNacional = (req, res, next) => {
  if (!esNacional(req.usuario)) {
    return res.status(403).json({
      success: false,
      message: 'Solo el administrador o un operador nacional pueden modificar este catálogo'
    });
  }
  next();
};

/**
 * ¿Es un trabajo de este lavador? Lo tiene asignado en la agenda, o es una
 * visita a domicilio de su equipo móvil (todo el equipo va a la visita).
 * La reserva tiene que venir con `asignaciones` y `visita` (al menos id_unidad).
 */
const esTrabajoDelLavador = (reserva, usuario) =>
  (reserva.asignaciones || []).some((a) => a.id_lavador === usuario.id_lavador) ||
  (!!usuario.id_unidad && reserva.visita?.id_unidad === usuario.id_unidad);

module.exports = { esTrabajoDelLavador, aEntero, ciudadFija, esNacional, ciudadFiltro, puedeVer, fueraDeAlcance, requireNacional };
