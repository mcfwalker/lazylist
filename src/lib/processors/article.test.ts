import { describe, it, expect, vi, beforeEach } from 'vitest'
import { processArticle } from './article'

describe('processArticle', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('extracts article content from HTML', async () => {
    const mockHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Test Article Title</title>
          <meta property="article:published_time" content="2026-01-27T10:00:00Z">
          <meta property="og:site_name" content="Test Site">
        </head>
        <body>
          <article>
            <h1>Test Article Title</h1>
            <p class="byline">By Test Author</p>
            <p>This is the main content of the article. It contains enough text to be parsed by Readability. The article discusses important topics and provides valuable information to readers.</p>
            <p>Additional paragraph with more content to ensure the article is long enough for extraction.</p>
          </article>
        </body>
      </html>
    `

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(mockHtml),
    } as Response)

    const result = await processArticle('https://example.com/article')

    expect(result).not.toBeNull()
    expect(result?.title).toBe('Test Article Title')
    expect(result?.content).toContain('main content of the article')
    expect(result?.publishedTime).toBe('2026-01-27T10:00:00Z')
  })

  it('returns null for failed fetch', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response)

    const result = await processArticle('https://example.com/not-found')

    expect(result).toBeNull()
  })

  it('returns null for unparseable content', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve('<html><body></body></html>'),
    } as Response)

    const result = await processArticle('https://example.com/empty')

    expect(result).toBeNull()
  })

  it('extracts published time from various meta tags', async () => {
    const mockHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Article with pubdate</title>
          <meta name="pubdate" content="2026-01-15T08:30:00Z">
        </head>
        <body>
          <article>
            <h1>Article with pubdate</h1>
            <p>Content that is long enough to be extracted by Readability parser for testing purposes.</p>
          </article>
        </body>
      </html>
    `

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(mockHtml),
    } as Response)

    const result = await processArticle('https://example.com/article')

    expect(result?.publishedTime).toBe('2026-01-15T08:30:00Z')
  })

  it('handles network errors gracefully', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Network error'))

    const result = await processArticle('https://example.com/error')

    expect(result).toBeNull()
  })
})
