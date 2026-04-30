import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { mochiPlugin } from '@mochi/web/vite'
import { lingui } from '@lingui/vite-plugin'

export default defineConfig({
  base: './',
  plugins: [
    mochiPlugin(),
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
    react({
      plugins: [['@lingui/swc-plugin', {}]],
    }),
    lingui(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
  },
})
