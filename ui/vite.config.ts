import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFile } from 'node:fs/promises';

const sharedScripts = [
  'shared/compactTokens.js',
  'shared/limits/balanceDisplay.js',
  'shared/sessionActivityProviders.js',
  'shared/sessionLive.js',
  'shared/sessionGroups.js',
  'model.js',
];

export default defineConfig({
  base: './',
  publicDir: false,
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'packaged-monitor-model',
      configureServer(server) {
        const files = new Map(sharedScripts.map(src => [
          `/${src}`,
          src.startsWith('shared/')
            ? new URL(`../src/${src}`, import.meta.url)
            : new URL(`../app/src/main/assets/${src}`, import.meta.url),
        ]));
        server.middlewares.use(async (request, response, next) => {
          const file = files.get(request.url || '');
          if (!file || request.method !== 'GET') return next();
          try {
            response.setHeader('Content-Type', 'text/javascript; charset=utf-8');
            response.end(await readFile(file));
          } catch (error) { next(error); }
        });
      },
      transformIndexHtml: {
        order: 'post',
        handler: (html, context) => ({
          // Vite's local refresh preamble and socket are development-only.
          html: context.server ? html
            .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
            .replace("connect-src 'none'", "connect-src 'self' ws://127.0.0.1:* ws://localhost:*") : html,
          tags: sharedScripts.map(src => ({ tag: 'script', attrs: { src }, injectTo: 'head' as const })),
        }),
      },
    },
  ],
  build: {
    // Stable, flat paths keep LocalContentClient's exact asset allowlist intact.
    outDir: '../app/build/generated/ui',
    emptyOutDir: true,
    target: 'chrome111',
    cssCodeSplit: false,
    modulePreload: false,
    rolldownOptions: {
      output: {
        entryFileNames: 'app.js',
        assetFileNames: 'app.[ext]',
        codeSplitting: false,
      },
    },
  },
});
