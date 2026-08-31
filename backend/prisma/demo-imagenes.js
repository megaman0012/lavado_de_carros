/**
 * Generador de imágenes de marcador de posición para el seed de demo.
 *
 * No son fotos reales: son PNG generados con zlib (sin dependencias) para que
 * el acta de servicio, la galería de evidencia y el comprobante de transferencia
 * tengan contenido durante una demostración. El "antes" usa tonos apagados y el
 * "después" tonos claros, de modo que la diferencia se lea de un vistazo.
 *
 * En operación real estas imágenes las suben los lavadores desde su teléfono.
 */

const zlib = require('zlib');

const trozo = (tipo, datos) => {
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo) >>> 0);
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  return Buffer.concat([largo, cuerpo, crc]);
};

let tablaCrc = null;
const crc32 = (buf) => {
  if (!tablaCrc) {
    tablaCrc = [];
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      tablaCrc[n] = c;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = tablaCrc[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
};

/** Arma un PNG RGB a partir de una función (x, y) -> [r, g, b]. */
const generarPNG = (ancho, alto, pixel) => {
  const filas = [];
  for (let y = 0; y < alto; y += 1) {
    const fila = Buffer.alloc(ancho * 3 + 1);
    fila[0] = 0; // filtro "none"
    for (let x = 0; x < ancho; x += 1) {
      const [r, g, b] = pixel(x, y);
      fila[1 + x * 3] = r;
      fila[2 + x * 3] = g;
      fila[3 + x * 3] = b;
    }
    filas.push(fila);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8;   // profundidad
  ihdr[9] = 2;   // color RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo('IHDR', ihdr),
    trozo('IDAT', zlib.deflateSync(Buffer.concat(filas))),
    trozo('IEND', Buffer.alloc(0))
  ]);
};

const mezclar = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

/** Vehículo sucio: tonos tierra, con manchas. */
const fotoAntes = (semilla = 0) => generarPNG(640, 420, (x, y) => {
  const base = mezclar([104, 96, 88], [142, 132, 118], y / 420);
  const mancha = Math.sin((x + semilla * 37) / 26) * Math.cos((y + semilla * 19) / 31);
  const suciedad = mancha > 0.45 ? 0.35 : 0;
  return mezclar(base, [78, 64, 48], suciedad);
});

/** Vehículo limpio: tonos claros con un brillo diagonal. */
const fotoDespues = (semilla = 0) => generarPNG(640, 420, (x, y) => {
  const base = mezclar([196, 214, 228], [238, 246, 252], y / 420);
  const diagonal = ((x + y * 0.6 + semilla * 53) % 260) / 260;
  const brillo = diagonal > 0.82 ? (diagonal - 0.82) / 0.18 : 0;
  return mezclar(base, [255, 255, 255], brillo * 0.9);
});

/** Comprobante bancario: hoja blanca con franjas que simulan renglones. */
const comprobante = () => generarPNG(520, 700, (x, y) => {
  if (y < 70) return [14, 116, 178];                       // encabezado del banco
  if (x < 26 || x > 494 || y > 674) return [236, 240, 244]; // margen
  const renglon = y > 120 && (y - 120) % 34 < 9 && x > 60 && x < 460;
  return renglon ? [206, 214, 222] : [252, 252, 253];
});

module.exports = { fotoAntes, fotoDespues, comprobante };
