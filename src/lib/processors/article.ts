// Article processor - extracts readable content from generic URLs

import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'

export interface ArticleMetadata {
  title: string | null
  content: string | null
  excerpt: string | null
  byline: string | null
  siteName: string | null
  publishedTime: string | null
}

export async function processArticle(url: string): Promise<ArticleMetadata | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LazyList/0.1; +https://lazylist.mcfw.io)',
        Accept: 'text/html,application/xhtml+xml',
      },
    })

    if (!response.ok) {
      console.error(`Article fetch error: ${response.status}`)
      return null
    }

    const html = await response.text()
    const dom = new JSDOM(html, { url })
    const document = dom.window.document

    // Extract published time from meta tags before Readability modifies DOM
    const publishedTime =
      document.querySelector('meta[property="article:published_time"]')?.getAttribute('content') ||
      document.querySelector('meta[name="pubdate"]')?.getAttribute('content') ||
      document.querySelector('meta[name="publishdate"]')?.getAttribute('content') ||
      document.querySelector('time[datetime]')?.getAttribute('datetime') ||
      null

    const reader = new Readability(document)
    const article = reader.parse()

    if (!article) {
      console.error('Readability failed to parse article')
      return null
    }

    return {
      title: article.title ?? null,
      content: article.textContent ?? null,
      excerpt: article.excerpt ?? null,
      byline: article.byline ?? null,
      siteName: article.siteName ?? null,
      publishedTime,
    }
  } catch (error) {
    console.error('Article processing error:', error)
    return null
  }
}
