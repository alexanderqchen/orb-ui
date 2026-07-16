/* global MutationObserver, URL, document, window */

;(() => {
  const jsonLdSelector = 'script[type="application/ld+json"]'

  const normalizeUrl = (value) => {
    if (typeof value !== 'string') return null

    try {
      const url = new URL(value, window.location.origin)
      const pathname = url.pathname.replace(/\/+$/, '') || '/'
      return `${url.origin}${pathname}`
    } catch {
      return null
    }
  }

  const getItemUrl = (item) => {
    if (typeof item === 'string') return item
    if (item && typeof item === 'object' && typeof item['@id'] === 'string') {
      return item['@id']
    }
    return null
  }

  const isBreadcrumbList = (entry) => {
    const type = entry?.['@type']
    return type === 'BreadcrumbList' || (Array.isArray(type) && type.includes('BreadcrumbList'))
  }

  const repairBreadcrumbs = (script) => {
    let structuredData

    try {
      structuredData = JSON.parse(script.textContent || '{}')
    } catch {
      return
    }

    const graph = structuredData?.['@graph']
    if (!Array.isArray(graph)) return

    const currentPage = normalizeUrl(window.location.href)
    const docsRoot = normalizeUrl('/docs')
    let changed = false

    for (const entry of graph) {
      if (!isBreadcrumbList(entry)) continue

      const items = entry.itemListElement
      if (!Array.isArray(items) || items.length < 2) continue

      const firstItem = items[0]
      const lastItem = items[items.length - 1]
      const lastItemUrl = normalizeUrl(getItemUrl(lastItem?.item))

      // Mintlify omits `item` from a non-final group crumb when the current page is the
      // first page in that group. Google only permits the final crumb to omit `item`.
      if (!firstItem?.item && lastItemUrl === currentPage && docsRoot) {
        firstItem.item = docsRoot
        delete lastItem.item
        changed = true
      }
    }

    if (changed) script.textContent = JSON.stringify(structuredData)
  }

  const repairNode = (node) => {
    if (node.nodeType !== 1) return
    if (node.matches(jsonLdSelector)) repairBreadcrumbs(node)

    for (const script of node.querySelectorAll(jsonLdSelector)) {
      repairBreadcrumbs(script)
    }
  }

  const start = () => {
    for (const script of document.querySelectorAll(jsonLdSelector)) {
      repairBreadcrumbs(script)
    }

    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.target.nodeType === 1 && record.target.matches(jsonLdSelector)) {
          repairBreadcrumbs(record.target)
        }

        for (const node of record.addedNodes) repairNode(node)
      }
    })

    observer.observe(document.documentElement, { childList: true, subtree: true })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true })
  } else {
    start()
  }
})()
