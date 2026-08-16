import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import watermarkIntegration from './src/lib/watermark-integration.ts';

const isDev = process.env.NODE_ENV === 'development';
const isCloudflare = process.env.USE_CLOUDFLARE !== 'false';

export default defineConfig({
  site: process.env.SITE_URL || 'https://mgf.solocarbon.com',
  output: 'static',
  adapter: undefined,
  integrations: [sitemap(), watermarkIntegration({ opacity: 20 })],
  vite: {
    preview: {
      allowedHosts: true
    },
    plugins: [
      tailwindcss(),
      {
        name: 'webp-dev-fallback',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.url && req.url.startsWith('/images/') && req.url.endsWith('.webp')) {
              import('fs').then(fs => {
                import('path').then(path => {
                  const baseName = req.url.slice(0, -5);
                  const publicDir = path.join(process.cwd(), 'public');
                  if (fs.existsSync(path.join(publicDir, baseName + '.jpg'))) {
                    req.url = baseName + '.jpg';
                  } else if (fs.existsSync(path.join(publicDir, baseName + '.jpeg'))) {
                    req.url = baseName + '.jpeg';
                  } else if (fs.existsSync(path.join(publicDir, baseName + '.png'))) {
                    req.url = baseName + '.png';
                  }
                  next();
                });
              });
              return;
            }
            next();
          });
        }
      }
    ],
    build: {
      rollupOptions: {
        external: ['cloudflare:workers']
      }
    }
  }
});
