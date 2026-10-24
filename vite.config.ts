import { env } from "node:process";
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const studioServer = env.AETHER_DEV_SERVER || "http://127.0.0.1:8781";

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    rollupOptions: {
      input: { app: 'index.html', 'create-document': 'src/create-document.ts' },
      preserveEntrySignatures: 'strict',
      output: { entryFileNames: chunk => chunk.name === 'create-document' ? 'create-document.js' : 'assets/[name]-[hash].js' },
    },
  },
  // @aether/ui is a file: link with its own node_modules. Without dedupe, its
  // hooks resolve a second React copy and every component fails to mount.
  resolve: { dedupe: ['react', 'react-dom'] },
  // Shared icons and branding live in core/assets, outside this project root.
  // The /icons proxy lets AppIcon's host-served rasters resolve in dev too.
  server: {
    host: "127.0.0.1", strictPort: true, port: 5179,
    fs: { allow: ["."] },
    proxy: {
      "/api": { target: studioServer, changeOrigin: true, headers: { Origin: studioServer } },
      "/icons": { target: studioServer, changeOrigin: true },
    },
  },
})
