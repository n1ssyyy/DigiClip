import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Setup dev server port must match tauri.conf.json build.devUrl and must
// not clash with the main app (1420).
export default defineConfig({
    plugins: [react(), tailwindcss()],
    clearScreen: false,
    server: {
        port: 1430,
        strictPort: true,
    },
});
