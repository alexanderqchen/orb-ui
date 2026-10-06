import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'
import { Marked } from 'marked'
import type { Plugin } from 'vite'
import { expansionPaths, recipes } from './catalog'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  )
const markdown = new Marked({ gfm: true })
markdown.use({
  renderer: {
    html({ text }) {
      return text
        .replace(/(<iframe\b[\s\S]*?)\/>/g, '$1></iframe>')
        .replace(/style=\{\{[\s\S]*?\}\}/g, 'style="border:0;border-radius:14px"')
        .replace(/src="https:\/\/orb-ui\.com\/demos\//g, 'src="/demos/')
    },
    code({ text, lang }) {
      return `<div class="code-block"><div class="code-label"><span>${escape(lang ?? 'code')}</span><button class="copy-code" type="button" hidden>Copy code</button></div><pre tabindex="0"><code>${escape(text)}</code></pre></div>`
    },
    table(token) {
      const header = token.header
        .map((cell) => `<th scope="col">${this.parser.parseInline(cell.tokens)}</th>`)
        .join('')
      const rows = token.rows
        .map(
          (row) =>
            `<tr>${row.map((cell) => `<td>${this.parser.parseInline(cell.tokens)}</td>`).join('')}</tr>`,
        )
        .join('')
      return `<div class="table-scroll" tabindex="0" role="region" aria-label="Scrollable reference table"><table><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table></div>`
    },
  },
})

/** New canonical pages are served at the same paths in previews and production.
 * The MDX remains usable in Mintlify; no second indexable example URL is created. */
export function expansionAssets() {
  const assets = new Map<string, string>()
  const links = (items: readonly (readonly [string, string, string])[], group: string) =>
    items
      .map(
        ([slug, title, description]) =>
          `<article class="post-card"><h2><a href="/docs/${group}/${slug}">${escape(title)}</a></h2><p>${escape(description)}</p></article>`,
      )
      .join('')
  function layout(title: string, description: string, path: string, body: string) {
    return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)} | orb-ui</title><meta name="description" content="${escape(description)}"><link rel="canonical" href="https://orb-ui.com${path}"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:image" content="https://orb-ui.com/og-image-v3.png"><link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/blog/blog.css"><link rel="stylesheet" href="/expansion.css"><script src="/blog/blog.js" defer></script></head><body><a class="skip-link" href="#main">Skip to content</a><header class="site-header"><nav aria-label="Main navigation"><a class="brand" href="/">orb-ui</a><div class="nav-links"><a href="/docs">Docs</a><a href="/docs/recipes">Recipes</a><a href="/docs/adapters/overview">Integrations</a><a href="https://github.com/exprmntl/orb-ui">GitHub ↗</a></div></nav></header><main id="main" class="expansion-doc"><p class="post-meta">React voice UI · local fixture demos</p><h1>${escape(title)}</h1><p class="expansion-lede">${escape(description)}</p>${body}</main><footer><a class="brand" href="/">orb-ui</a><p>Voice agent UI that feels alive.</p></footer></body></html>`
  }
  assets.set(
    'docs/recipes/index.html',
    layout(
      'Voice UI recipes for React',
      'Eight complete examples with editable transcripts, confirmations, citations, progress, search results, and timed narration. Every embedded demo runs locally without API credits.',
      '/docs/recipes',
      `<div class="posts-grid">${links(recipes, 'recipes')}</div>`,
    ),
  )
  for (const path of expansionPaths) {
    const file = resolve(repo, 'docs', `${path}.mdx`)
    if (!existsSync(file)) throw new Error(`Missing expansion page: ${path}`)
    const { data, content } = matter(readFileSync(file, 'utf8'))
    if (typeof data.title !== 'string' || typeof data.description !== 'string')
      throw new Error(`Missing page metadata: ${path}`)
    // New recipes use ordinary Markdown and iframe elements. Convert the MDX-only style prop
    // and self-closing iframe into valid HTML so the same source works in a static preview.
    const rendered = (markdown.parse(content) as string)
      .replace(
        /href="\/(adapters|recipes|guides|themes|reference|quickstart|installation)(\/|"|#)/g,
        'href="/docs/$1$2',
      )
      .replace(/href="https:\/\/orb-ui\.com\/(demos|examples|fixtures|docs)\//g, 'href="/$1/')
    assets.set(
      `docs/${path}/index.html`,
      layout(data.title, data.description, `/docs/${path}`, rendered),
    )
  }
  assets.set(
    'expansion.css',
    '.expansion-doc{max-width:960px;margin:auto;padding:48px 24px 72px}.expansion-doc h1{font-size:clamp(36px,6vw,58px);line-height:1.1;letter-spacing:-.045em}.expansion-lede{font-size:20px;color:#b3c0d4;line-height:1.6}.expansion-doc h2{margin-top:44px}.expansion-doc p,.expansion-doc li{line-height:1.75}.expansion-doc a{color:#87b8ff}.expansion-doc iframe{width:100%;border:1px solid #28364f;border-radius:14px;min-height:640px;display:block;margin:24px 0}.expansion-doc pre{overflow:auto}.expansion-doc table{border-collapse:collapse}.expansion-doc .table-scroll{max-width:100%}.expansion-doc td,.expansion-doc th{border:1px solid #293750;padding:12px}.expansion-doc blockquote{border-left:3px solid #639ffa;padding:4px 20px;color:#b8c5d9}.expansion-doc img{max-width:100%}@media(max-width:480px){.expansion-doc{padding:28px 16px}.expansion-doc iframe{min-height:800px}}',
  )
  assets.set(
    'expansion-sitemap.xml',
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['recipes', ...expansionPaths].map((path) => `<url><loc>https://orb-ui.com/docs/${path}</loc></url>`).join('')}</urlset>`,
  )
  // Downloadable React sources are the exact components used by the fixture demos.
  for (const [slug] of recipes) {
    const file = resolve(repo, 'demo/src/recipes', `${slug}.tsx`)
    if (existsSync(file)) assets.set(`examples/${slug}.tsx`, readFileSync(file, 'utf8'))
  }
  return assets
}

export function expansionPlugin(): Plugin {
  return {
    name: 'orb-ui-canonical-expansion',
    configureServer(server) {
      server.watcher.add(resolve(repo, 'docs'))
      server.middlewares.use((request, response, next) => {
        const path = (request.url ?? '').split('?')[0].replace(/\/$/, '').slice(1)
        if (
          ![
            'docs/recipes',
            ...expansionPaths.map((path) => `docs/${path}`),
            'expansion.css',
            'expansion-sitemap.xml',
            ...recipes.map(([slug]) => `examples/${slug}.tsx`),
          ].includes(path)
        )
          return next()
        try {
          const assets = expansionAssets()
          const source = assets.get(path) ?? assets.get(`${path}/index.html`)
          if (!source) return next()
          response.setHeader(
            'Content-Type',
            `${path.endsWith('.css') ? 'text/css' : path.endsWith('.xml') ? 'application/xml' : path.endsWith('.tsx') ? 'text/plain' : 'text/html'}; charset=utf-8`,
          )
          response.end(source)
        } catch (error) {
          next(error)
        }
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((request, _response, next) => {
        const [path, query] = (request.url ?? '').split('?')
        if (
          ['/docs/recipes', ...expansionPaths.map((path) => `/docs/${path}`)].includes(
            path.replace(/\/$/, ''),
          )
        )
          request.url = `${path.replace(/\/$/, '')}/index.html${query ? `?${query}` : ''}`
        next()
      })
    },
    generateBundle() {
      for (const [fileName, source] of expansionAssets())
        this.emitFile({ type: 'asset', fileName, source })
    },
  }
}
