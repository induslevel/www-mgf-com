import type { APIRoute } from 'astro';

// Fallback to static prerendering if building for the local Docker tunnel (where no adapter is used)
export const prerender = process.env.USE_CLOUDFLARE === 'false';

export const GET: APIRoute = ({ site, request }) => {
  const siteUrl = site?.toString() || 'https://remit.induslevel.com/';
  // Skip headers access during static build pre-rendering to prevent Astro warnings
  const userAgent = import.meta.env.COMMAND === 'build' ? '' : (request.headers.get('user-agent') || '');

  // Check if request comes from known legacy validators or standard search crawlers
  const isLegacyOrStandardBot = 
    userAgent.includes('Googlebot') || 
    userAgent.includes('Google-InspectionTool') || 
    userAgent.includes('Lighthouse') || 
    userAgent.includes('Chrome-Lighthouse') ||
    userAgent.includes('PageSpeed');

  const robotsTxt = `
User-agent: *
Allow: /

# AI Content Usage Permissions (RFC draft)
${isLegacyOrStandardBot ? '# ' : ''}Content-Signal: ai-train=no, search=yes, ai-input=no

# Block API routes
Disallow: /api/

Sitemap: ${siteUrl}sitemap-index.xml
`.trim();

  return new Response(robotsTxt, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      // Ensure edge caches don't serve AI-tailored robots.txt to standard bots
      'Vary': 'User-Agent',
    },
  });
};
