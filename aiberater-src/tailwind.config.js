/** @type {import('tailwindcss').Config} */
// Wird IN finanztracker eingebettet — preflight wäre fatal (würde finanztracker's
// eigene Defaults überschreiben). `important` setzt alle Utility-Klassen unter
// den Mount-Container, damit kein Style-Spillover auf andere finanztracker-Tabs.
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  important: '#aiberater-root',
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: { accent: '#FF6B35' },
    },
  },
  plugins: [],
};
