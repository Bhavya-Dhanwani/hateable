import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // previews arrive via the project-service proxy as Host: nextjs-service-<id>
  server: { allowedHosts: true }
});
