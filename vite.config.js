import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Tauri dev server port must match tauri.conf.json build.devUrl.
export default defineConfig({
    plugins: [react(), tailwindcss()],
    clearScreen: false,
    server: {
        port: 1420,
        strictPort: true,
    },
    build: {
        target: 'chrome122',
    },
});
