import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
    plugins: [react()],
    build: {
        rollupOptions: {
            output: {
                manualChunks: function (id) {
                    if (id.indexOf('node_modules/recharts') !== -1) {
                        return 'vendor-recharts';
                    }
                    if (id.indexOf('node_modules/react-konva') !== -1 || id.indexOf('node_modules/konva') !== -1) {
                        return 'vendor-konva';
                    }
                    return undefined;
                },
            },
        },
    },
});
