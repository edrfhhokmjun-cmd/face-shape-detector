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

/**
 * Content Signals (https://contentsignals.org/) — declares how AI systems may use this content.
 *
 * ⚠️ THIS IS A POLICY DECISION, NOT A TECHNICAL ONE. The values below are a chosen default:
 *
 *   ai-train=no    do not use this content to train models. Training brings no traffic back, and
 *                  "we do not feed AI training" fits the privacy-first positioning of the site.
 *
 *   search=yes     allow search engines. Non-negotiable — "no" would remove the site from Google
 *                  and Bing.
 *
 *   ai-input=yes   allow AI systems to use the content as input when answering (RAG/grounding).
 *                  This is the value that decides whether AI assistants can cite these pages.
 *                  "no" would lock the site out of AI answers, which is the opposite of the
 *                  distribution strategy. Set it to `no` only if that is what you want.
 *
 * To change the policy, edit this constant — it is the single source of truth.
 */
const CONTENT_SIGNAL = 'ai-train=no, search=yes, ai-input=yes';

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
    `Content-Signal: ${CONTENT_SIGNAL}`,
    '',
  ];

  if (sitemapUrl) {
    lines.push(`Sitemap: ${sitemapUrl}`, '');
  }

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
