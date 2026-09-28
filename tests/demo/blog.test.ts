import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { blogAssets } from '../../demo/blog/plugin'

describe('static blog publishing', () => {
  const assets = blogAssets()
  const pages = [...assets].filter(([path]) => path.endsWith('.html'))

  it('ships complete article HTML, canonical metadata, and valid structured data without client rendering', () => {
    expect(pages).toHaveLength(3)
    for (const [path, html] of pages) {
      const canonical = `https://orb-ui.com/${path.replace('/index.html', '')}`
      expect(html).toContain(`<link rel="canonical" href="${canonical}">`)
      expect(html.match(/<h1>/g)).toHaveLength(1)
      const schema = JSON.parse(html.match(/application\/ld\+json">(.*?)<\/script>/s)![1])
      if (path !== 'blog/index.html') {
        expect(schema[0]['@type']).toBe('BlogPosting')
        expect(schema[0].mainEntityOfPage).toBe(canonical)
        expect(html).toContain('<div class="prose"><p>')
      }
      expect(assets.get('site-sitemap.xml')).toContain(`<loc>${canonical}</loc>`)
    }
  })

  it('resolves every article link and table-of-contents anchor', () => {
    for (const [, html] of pages) {
      const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1])
      expect(new Set(ids).size).toBe(ids.length)
      for (const [, href] of html.matchAll(/href="([^"]+)"/g)) {
        if (href.startsWith('#')) expect(ids).toContain(href.slice(1))
        if (href.startsWith('/blog/'))
          expect(assets.has(href.slice(1)) || assets.has(`${href.slice(1)}/index.html`)).toBe(true)
        if (href.startsWith('/docs/'))
          expect(existsSync(resolve(`docs/${href.slice(6)}.mdx`))).toBe(true)
      }
    }
  })

  it('preserves copyable tutorial source and literal currency text', () => {
    const source = readFileSync('demo/blog/posts/openai-realtime-api-tutorial.md', 'utf8')
    const blocks = [...source.matchAll(/```\w+\n([\s\S]*?)```/g)].map((match) => match[1].trimEnd())
    const html = assets.get('blog/openai-realtime-api-tutorial/index.html')!
    const decode = (value: string) =>
      value
        .replace(/<[^>]+>/g, '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&')
    const rendered = [...html.matchAll(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)].map((match) =>
      decode(match[1]),
    )
    expect(rendered).toEqual(blocks)
    expect(assets.get('blog/vapi-vs-retell/index.html')).toContain('$81.80–$128.90')
    expect(html).toContain('$0.096')
  })
})
