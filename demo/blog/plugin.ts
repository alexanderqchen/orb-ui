import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Marked } from 'marked'
import matter from 'gray-matter'
import type { Plugin } from 'vite'
import { highlightTsx } from '../src/syntax-highlight'

const directory = fileURLToPath(new URL('.', import.meta.url))
const origin = 'https://orb-ui.com'
const author = { '@type': 'Organization', name: 'orb-ui', url: origin }
const image = `${origin}/og-image-v3.png`
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  )
const json = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c')

interface Post {
  slug: string
  title: string
  description: string
  date: string
  category: string
  content: string
}

function readPosts(): Post[] {
  return readdirSync(`${directory}/posts`)
    .filter((name) => name.endsWith('.md'))
    .map((name) => {
      const { data, content } = matter(readFileSync(`${directory}/posts/${name}`, 'utf8'))
      for (const key of ['title', 'description', 'date', 'category']) {
        if (typeof data[key] !== 'string' || !data[key].trim()) {
          throw new Error(`${name}: missing string ${key} in frontmatter`)
        }
      }
      const slug = name.slice(0, -3)
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error(`Invalid slug: ${slug}`)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) throw new Error(`Invalid date: ${name}`)
      return { slug, content, ...data } as Post
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug))
}

function dateLabel(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function layout(
  title: string,
  description: string,
  path: string,
  body: string,
  schema: unknown,
  post?: Post,
) {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)} | orb-ui</title>
<meta name="description" content="${escape(description)}">
<link rel="canonical" href="${origin}${path}">
<meta property="og:type" content="${post ? 'article' : 'website'}">
<meta property="og:title" content="${escape(title)}">
<meta property="og:description" content="${escape(description)}">
<meta property="og:url" content="${origin}${path}">
<meta property="og:image" content="${image}">
<meta property="og:site_name" content="orb-ui">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escape(title)}">
<meta name="twitter:description" content="${escape(description)}">
<meta name="twitter:image" content="${image}">
${post ? `<meta property="article:published_time" content="${post.date}T00:00:00Z">` : ''}
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/blog/blog.css">
<script type="application/ld+json">${json(schema)}</script>
<script src="/blog/blog.js" defer></script>
</head><body>
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header"><nav aria-label="Main navigation"><a class="brand" href="/"> <span class="brand-dot"></span>orb-ui</a><div class="nav-links"><a href="/docs">Docs</a><a href="/blog" aria-current="${post ? 'false' : 'page'}">Blog</a><a href="/playground">Playground</a><a href="https://github.com/exprmntl/orb-ui">GitHub ↗</a></div></nav></header>
${body}
<footer><a class="brand" href="/">orb-ui</a><p>Voice agent UI that feels alive.</p><div><a href="/docs/quickstart">Get started</a><a href="https://github.com/exprmntl/orb-ui">GitHub ↗</a></div></footer>
</body></html>`
}

function card(post: Post) {
  return `<article class="post-card"><div class="post-meta"><span>${escape(post.category)}</span><time datetime="${post.date}">${dateLabel(post.date)}</time></div><h2><a href="/blog/${post.slug}">${escape(post.title)}</a></h2><p>${escape(post.description)}</p><a class="read-link" href="/blog/${post.slug}" aria-label="Read ${escape(post.title)}">Read article <span aria-hidden="true">↗</span></a></article>`
}

function article(post: Post, posts: Post[]) {
  const headings: { id: string; text: string; depth: number }[] = []
  const ids = new Map<string, number>()
  const markdown = new Marked({ gfm: true })
  markdown.use({
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens)
        const plain = text.replace(/<[^>]*>/g, '')
        const base =
          plain
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '') || 'section'
        const count = ids.get(base) ?? 0
        ids.set(base, count + 1)
        const id = count ? `${base}-${count + 1}` : base
        if (depth <= 3) headings.push({ id, text, depth })
        return `<h${depth} id="${id}">${text}<a class="heading-anchor" href="#${id}" aria-label="Link to this section">#</a></h${depth}>`
      },
      code({ text, lang }) {
        const language = lang?.split(/\s/)[0] ?? 'text'
        const highlighted = ['js', 'jsx', 'ts', 'tsx'].includes(language)
          ? highlightTsx(text)
              .map(({ kind, value }) => `<span class="token-${kind}">${escape(value)}</span>`)
              .join('')
          : escape(text)
        return `<div class="code-block"><div class="code-label"><span>${escape(language)}</span><button type="button" class="copy-code" hidden>Copy code</button></div><pre tabindex="0" aria-label="${escape(language)} code"><code>${highlighted}</code></pre></div>`
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
        return `<div class="table-scroll" tabindex="0" role="region" aria-label="Scrollable comparison table"><table><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table></div>`
      },
    },
  })
  const content = markdown.parse(post.content) as string
  const path = `/blog/${post.slug}`
  const toc = headings
    .map(({ id, text, depth }) => `<li class="depth-${depth}"><a href="#${id}">${text}</a></li>`)
    .join('')
  const schema = [
    {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: post.title,
      description: post.description,
      datePublished: post.date,
      author,
      publisher: author,
      image,
      mainEntityOfPage: `${origin}${path}`,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Blog', item: `${origin}/blog` },
        { '@type': 'ListItem', position: 2, name: post.title, item: `${origin}${path}` },
      ],
    },
  ]
  return layout(
    post.title,
    post.description,
    path,
    `<main id="main" class="article-layout">
<article><header class="article-header"><a class="back-link" href="/blog">← All articles</a><div class="post-meta"><span>${escape(post.category)}</span><time datetime="${post.date}">${dateLabel(post.date)}</time></div><h1>${escape(post.title)}</h1><p class="dek">${escape(post.description)}</p><p class="byline">By <a href="/">orb-ui</a></p></header>
<details class="mobile-toc"><summary>In this article</summary><ol>${toc}</ol></details><div class="prose">${content}</div>
<section class="related" aria-label="More from the blog"><p class="eyebrow">Keep reading</p>${posts
      .filter((other) => other.slug !== post.slug)
      .slice(0, 2)
      .map(card)
      .join('')}</section></article>
<aside class="toc" aria-label="Table of contents"><p>In this article</p><ol>${toc}</ol><a class="toc-cta" href="/docs/quickstart">Build with orb-ui ↗</a></aside></main>`,
    schema,
    post,
  )
}

/** Render trusted, repository-authored Markdown to complete HTML at build time. */
export function blogAssets(): Map<string, string> {
  const posts = readPosts()
  const assets = new Map<string, string>()
  assets.set(
    'blog/index.html',
    layout(
      'Voice AI blog',
      'Practical tutorials and platform comparisons for developers building voice agents.',
      '/blog',
      `<main id="main" class="blog-index"><header class="index-header"><p class="eyebrow">The orb-ui blog</p><h1>Notes on building<br><span>voice AI.</span></h1><p>Practical tutorials, platform comparisons, and a closer look at the tools behind the conversation.</p></header><section class="post-grid" aria-label="Latest articles">${posts.map(card).join('')}</section></main>`,
      {
        '@context': 'https://schema.org',
        '@type': 'Blog',
        name: 'orb-ui blog',
        url: `${origin}/blog`,
        publisher: author,
      },
    ),
  )
  for (const post of posts) assets.set(`blog/${post.slug}/index.html`, article(post, posts))
  for (const extension of ['css', 'js'])
    assets.set(`blog/blog.${extension}`, readFileSync(`${directory}/blog.${extension}`, 'utf8'))
  assets.set(
    'site-sitemap.xml',
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['/', '/blog', ...posts.map((post) => `/blog/${post.slug}`)].map((path) => `<url><loc>${origin}${path}</loc></url>`).join('')}</urlset>\n`,
  )
  return assets
}

export function blogPlugin(): Plugin {
  return {
    name: 'orb-ui-static-blog',
    configurePreviewServer(server) {
      server.middlewares.use((request, response, next) => {
        const [path, query] = (request.url ?? '').split('?')
        if (!/^\/blog(?:\/[a-z0-9-]+)?\/?$/.test(path)) return next()
        const file = `${path.replace(/\/$/, '')}/index.html`
        if (!existsSync(resolve(server.config.root, server.config.build.outDir, file.slice(1)))) {
          response.statusCode = 404
          response.end('Article not found')
          return
        }
        request.url = `${file}${query ? `?${query}` : ''}`
        next()
      })
    },
    configureServer(server) {
      server.watcher.add(directory)
      server.middlewares.use((request, response, next) => {
        const path = (request.url ?? '').split('?')[0]
        if (path !== '/site-sitemap.xml' && path !== '/blog' && !path.startsWith('/blog/'))
          return next()
        try {
          const assets = blogAssets()
          const key = path.slice(1).replace(/\/$/, '')
          const body = assets.get(key) ?? assets.get(`${key}/index.html`)
          if (!body) {
            response.statusCode = 404
            response.end('Article not found')
            return
          }
          const type = path.endsWith('.css')
            ? 'text/css'
            : path.endsWith('.js')
              ? 'text/javascript'
              : path.endsWith('.xml')
                ? 'application/xml'
                : 'text/html'
          response.setHeader('Content-Type', `${type}; charset=utf-8`)
          response.end(body)
        } catch (error) {
          next(error)
        }
      })
    },
    generateBundle() {
      for (const [fileName, source] of blogAssets())
        this.emitFile({ type: 'asset', fileName, source })
    },
  }
}
