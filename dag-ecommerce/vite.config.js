import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// VITE_STATIC=1 → build autonome : chemins relatifs + HashRouter.
// Utile pour un hébergement statique sans réécriture d'URL (aperçu, CDN, fichier local).
const isStatic = process.env.VITE_STATIC === '1'

// https://vite.dev/config/
export default defineConfig({
  base: isStatic ? './' : '/',
  plugins: [react(), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 1200,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    include: ['src/**/*.test.{js,jsx}'],
  },
})
