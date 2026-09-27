/**
 * Firma de URLs de archivos subidos - Total Clean Car
 *
 * /uploads se servía con express.static sin ninguna validación: cualquiera que
 * adivinara la ruta veía las fotos de los vehículos, y con los comprobantes de
 * transferencia el riesgo es mayor (llevan datos bancarios del cliente).
 *
 * No se puede exigir el header Authorization, porque estas rutas se consumen
 * desde <img src="..."> y el navegador no lo manda. La solución es firmar la
 * URL: la API entrega la ruta con ?exp=&sig=, y el handler de /uploads valida
 * ese HMAC. El enlace caduca solo, así que un link filtrado no sirve para siempre.
 */

const crypto = require('crypto');
const config = require('../config');

const VIGENCIA_MS = 8 * 60 * 60 * 1000; // 8h: cubre una jornada de trabajo

const calcularFirma = (ruta, exp) =>
  crypto.createHmac('sha256', config.JWT_SECRET).update(`${ruta}|${exp}`).digest('hex').slice(0, 32);

/** Agrega ?exp=&sig= a una ruta guardada en BD ("/uploads/..."). */
const firmar = (ruta) => {
  if (!ruta || typeof ruta !== 'string' || !ruta.startsWith('/uploads/')) return ruta;
  const exp = Date.now() + VIGENCIA_MS;
  return `${ruta}?exp=${exp}&sig=${calcularFirma(ruta, exp)}`;
};

/** Firma un JSON array de rutas tal como se guarda en RegistroLavado.fotos_*. */
const firmarListaJSON = (valor) => {
  if (!valor) return valor;
  try {
    const rutas = JSON.parse(valor);
    if (!Array.isArray(rutas)) return valor;
    return JSON.stringify(rutas.map(firmar));
  } catch (e) {
    return valor;
  }
};

/** Firma las rutas de archivos dentro de una reserva (evidencia y comprobantes). */
const firmarReserva = (reserva) => {
  if (!reserva) return reserva;
  return {
    ...reserva,
    ...(reserva.registro && {
      registro: {
        ...reserva.registro,
        fotos_antes: firmarListaJSON(reserva.registro.fotos_antes),
        fotos_despues: firmarListaJSON(reserva.registro.fotos_despues)
      }
    }),
    ...(reserva.pagos && {
      pagos: reserva.pagos.map((p) => ({ ...p, comprobante_url: firmar(p.comprobante_url) }))
    })
  };
};

const firmarReservas = (reservas) => reservas.map(firmarReserva);

/** Middleware de /uploads: exige una firma vigente. */
const verificarFirma = (req, res, next) => {
  const { exp, sig } = req.query;
  // req.path viene relativo al mount ("/evidencias/..."), la firma es sobre la ruta completa
  const ruta = `/uploads${decodeURIComponent(req.path)}`;

  if (!exp || !sig) {
    return res.status(403).json({ success: false, message: 'Enlace no autorizado' });
  }
  if (Number(exp) < Date.now()) {
    return res.status(403).json({ success: false, message: 'El enlace caducó, vuelva a cargar la página' });
  }

  const esperada = calcularFirma(ruta, exp);
  const a = Buffer.from(String(sig));
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(403).json({ success: false, message: 'Enlace no autorizado' });
  }

  next();
};

module.exports = { firmar, firmarListaJSON, firmarReserva, firmarReservas, verificarFirma };
