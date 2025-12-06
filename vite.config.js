import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig(() => {
    const isRootDeploy = process.env.NETLIFY || process.env.VERCEL;
    return {
        base: isRootDeploy ? '/' : '/PGVectorRAGIndexerWebsite/',
    }
})
