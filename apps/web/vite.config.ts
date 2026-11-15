import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      input: { app: 'index.html', messaging: 'src/messaging-sw.ts' },
      output: {
        codeSplitting: {
          groups: [
            { name: 'firebase-auth', test: /node_modules[\\/]@firebase[\\/]auth[\\/]/ },
            { name: 'firebase-data', test: /node_modules[\\/]@firebase[\\/]firestore[\\/]/ },
            { name: 'date-time', test: /node_modules[\\/](@js-temporal|jsbi)[\\/]/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ],
        },
        entryFileNames: (chunk) =>
          chunk.name === 'messaging' ? 'messaging-sw.js' : 'assets/[name]-[hash].js',
      },
    },
  },
  server: { port: 5173, strictPort: true },
});
