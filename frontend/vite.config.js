import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// Everything goes through the k8s ingress, port-forwarded by `skaffold dev` to :8088
// (see portForward in skaffold.yaml). 127.0.0.1, not localhost: Node may resolve localhost to ::1.
const INGRESS = process.env.VITE_INGRESS || 'http://127.0.0.1:8088';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': { target: INGRESS, changeOrigin: false },
      // /runtime/<projectId>/file-tree -> <projectId>.workspace.localhost/file-tree (pod file server)
      '/runtime': {
        target: INGRESS,
        changeOrigin: false,
        rewrite: (path) => path.replace(/^\/runtime\/[^/]+/, '') || '/',
        configure(proxy) {
          proxy.on('proxyReq', (proxyReq, req) => {
            // req.url is already rewritten by now; the project id survives on originalUrl
            const id = (req.originalUrl || req.url).match(/^\/runtime\/([^/?]+)/)?.[1];
            if (id) proxyReq.setHeader('host', `${id}.workspace.localhost`);
          });
        }
      }
    }
  }
});
