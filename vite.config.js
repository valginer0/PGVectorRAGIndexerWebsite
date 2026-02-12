import { defineConfig } from 'vite'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig(() => {
    const isRootDeploy = process.env.NETLIFY || process.env.VERCEL;
    return {
        base: isRootDeploy ? '/' : '/PGVectorRAGIndexerWebsite/',
        build: {
            rollupOptions: {
                input: {
                    main: resolve(__dirname, 'index.html'),
                    demo: resolve(__dirname, 'demo.html'),
                },
            },
        },
    }
})
