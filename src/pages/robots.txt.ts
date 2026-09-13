/**
 * Generates /robots.txt.
 *
 * Why generated instead of a static public/robots.txt: a static file would have to hard-code the
 * full domain a second time, so changing the domain could silently leave a wrong sitemap URL here.
 * Reading Astro.site keeps this file and canonical/sitemap impossible to disagree.
 *
 * NOTE: every string in this file is **public** — crawlers read it. Comments here are English on
 * purpose; the Chinese comments elsewhere in the codebase are for the developer, not for shipped
 * files. Do not put Chinese (or any non-ASCII) text in generated public artifacts.
 */
import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) => {
  const sitemapUrl = site ? new URL('/sitemap-index.xml', site).href : null;

  const lines = [
    'User-agent: *',
    'Allow: /',
    '',
    '# The landmark calibration page is a development tool. It is archived as',
    '# src/pages/debug.astro.off and is not part of the build; this rule stays as a',
    '# safeguard for when it is temporarily re-enabled during local development.',
    'Disallow: /debug',
    '',
  ];

  if (sitemapUrl) {
    lines.push(`Sitemap: ${sitemapUrl}`, '');
  }

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
