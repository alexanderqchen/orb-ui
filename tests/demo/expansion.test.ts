import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { expansionAssets } from '../../demo/expansion/plugin'
import { expansionPaths, recipes } from '../../demo/expansion/catalog'

test('all fifteen outcomes have canonical content, working fixture embeds, and source', () => {
  const assets = expansionAssets()
  expect(expansionPaths).toHaveLength(15)
  for (const path of expansionPaths) {
    const html = assets.get(`docs/${path}/index.html`)!
    expect(html).toContain(`<link rel="canonical" href="https://orb-ui.com/docs/${path}">`)
    expect(html).toMatch(/<iframe[\s\S]*?src="\/demos\//)
    expect(html).not.toMatch(/<iframe[^>]*style=\{\{/)
    expect(html).toContain('</iframe>')
    expect(html).toContain('Copy code')
    expect(html.length).toBeGreaterThan(5000)
  }
  for (const [slug] of recipes) {
    expect(assets.get(`examples/${slug}.tsx`)).toBe(
      readFileSync(`demo/src/recipes/${slug}.tsx`, 'utf8'),
    )
  }
  const config = JSON.parse(readFileSync('demo/vercel.json', 'utf8'))
  for (const path of expansionPaths) {
    expect(
      config.rewrites.find((rule: { source: string }) => rule.source === `/docs/${path}`)
        .destination,
    ).toBe(`/docs/${path}/index.html`)
  }
  const sitemap = assets.get('expansion-sitemap.xml')!
  expect(sitemap).not.toContain('/demos/')
  const search = assets.get('docs/recipes/product-search/index.html')!
  expect(search).toContain('style={{')
  expect(search).toContain('gridTemplateColumns:')
  expect(search).not.toContain('href="https://orb-ui.com/examples/')
  expect(search).not.toContain('href="/recipes/')
})
