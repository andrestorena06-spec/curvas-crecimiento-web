import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Modos de compilación:
//   web     sitio para GitHub Pages            -> dist-web
//   single  un solo archivo .html (doble clic) -> dist-single
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  base: './',
  build: { outDir: 'dist', emptyOutDir: true },
}))
