/** @type {import('tailwindcss').Config} */

// Paleta Total Clean Car (docs/lavadodecarro.png): #2E96D4 y #3459A5.
// En vez de renombrar cientos de clases, se redefinen las escalas `sky` (azul
// claro de la marca) y `blue` (azul oscuro): toda la app hereda la identidad.
// sky-600 no es el #2E96D4 puro sino uno más oscuro, para que el texto blanco
// de los botones cumpla contraste WCAG AA (4.86:1; el puro da 3.27:1).
const marcaClaro = {
  50: '#EEF7FC', 100: '#D7ECF8', 200: '#B0D9F1', 300: '#7EC0E7', 400: '#52AADD',
  500: '#2E96D4', 600: '#2477AE', 700: '#22699A', 800: '#20577D', 900: '#1E4966', 950: '#142F43'
};
const marcaOscuro = {
  50: '#EFF3FB', 100: '#DCE4F5', 200: '#BCCBEB', 300: '#92A9DC', 400: '#6784C8',
  500: '#4A6CB9', 600: '#3C60AE', 700: '#3459A5', 800: '#2C4A89', 900: '#283F70', 950: '#1A2848'
};

module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        sky: marcaClaro,
        blue: marcaOscuro,
        marca: { claro: '#2E96D4', oscuro: '#3459A5' }
      },
      fontFamily: {
        marca: ['Montserrat', 'ui-sans-serif', 'system-ui', 'sans-serif']
      }
    },
  },
  plugins: [],
}
