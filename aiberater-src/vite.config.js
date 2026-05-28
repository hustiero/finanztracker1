import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Wird als Sub-Asset in finanztracker eingebettet. Build-Output landet unter
// `../aiberater/` (relativ zum aiberater-src/), wird vom finanztracker
// statisch ausgeliefert. Predictable Dateinamen (kein Hash), damit
// finanztracker/index.html stabil referenzieren kann.
export default defineConfig({
  plugins: [react()],
  base: '',
  build: {
    outDir: '../aiberater',
    emptyOutDir: true,
    // Wir bauen NICHT als Library — Vite erstellt eine ganze SPA (index.html
    // + assets), aber wir nutzen nur die JS- und CSS-Dateien aus assets/
    // und mounten in finanztracker's eigenes index.html.
    rollupOptions: {
      output: {
        entryFileNames: 'assets/aiberater.js',
        chunkFileNames: 'assets/aiberater-[name].js',
        assetFileNames: (info) => {
          if (info.name && info.name.endsWith('.css')) return 'assets/aiberater.css';
          return 'assets/[name][extname]';
        },
      },
    },
  },
  server: { port: 5173 },
});
