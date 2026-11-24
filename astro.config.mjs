import { defineConfig } from 'astro/config';

/**
 * Astro does not route files that start with `_`. The font comparison page keeps its
 * `_fonts.astro` name (so it is never mistaken for a content page) and is routed here,
 * at /_fonts/. Nothing links to it.
 */
const fontComparison = {
  name: 'font-comparison-route',
  hooks: {
    'astro:config:setup': ({ injectRoute }) => {
      injectRoute({ pattern: '/_fonts', entrypoint: './src/pages/_fonts.astro' });
    },
  },
};

export default defineConfig({
  site: 'https://josh-quinn.github.io',
  output: 'static',
  integrations: [fontComparison],
});
