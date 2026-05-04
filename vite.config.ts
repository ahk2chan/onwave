import { defineConfig } from 'vite'

export default defineConfig({
  root: 'demo',
  server: {
    allowedHosts: true,
    host: true,
  },
})
