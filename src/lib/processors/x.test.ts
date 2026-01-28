import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { processX } from './x'

// Mock the grok module
vi.mock('./grok', () => ({
  fetchXContentWithGrok: vi.fn(),
}))

import { fetchXContentWithGrok } from './grok'

describe('X/Twitter Processor', () => {
  const mockFetch = vi.fn()
  const originalFetch = global.fetch
  const originalEnv = process.env

  beforeEach(() => {
    global.fetch = mockFetch
    process.env = { ...originalEnv }
    vi.clearAllMocks()
  })

  afterEach(() => {
    global.fetch = originalFetch
    process.env = originalEnv
  })

  describe('processX with Grok API', () => {
    it('should use Grok API when XAI_API_KEY is configured', async () => {
      process.env.XAI_API_KEY = 'test-key'

      vi.mocked(fetchXContentWithGrok).mockResolvedValue({
        text: 'This is a tweet about AI tools',
        videoTranscript: 'Video content here',
        authorName: 'TestUser',
        citations: ['https://github.com/test/repo'],
        summary: 'Summary of the tweet',
        cost: 0.001,
      })

      const result = await processX('https://x.com/user/status/123')

      expect(fetchXContentWithGrok).toHaveBeenCalledWith('https://x.com/user/status/123')
      expect(result).toEqual({
        text: 'This is a tweet about AI tools',
        videoTranscript: 'Video content here',
        authorName: 'TestUser',
        authorUrl: '',
        resolvedUrls: ['https://github.com/test/repo'],
        isLinkOnly: false,
        xArticleUrl: null,
        summary: 'Summary of the tweet',
        grokCitations: ['https://github.com/test/repo'],
        usedGrok: true,
        grokCost: 0.001,
      })
    })

    it('should filter GitHub URLs from Grok citations', async () => {
      process.env.XAI_API_KEY = 'test-key'

      vi.mocked(fetchXContentWithGrok).mockResolvedValue({
        text: 'Check out these tools',
        videoTranscript: null,
        authorName: 'DevUser',
        citations: [
          'https://github.com/user/repo1',
          'https://example.com/other',
          'https://github.com/user/repo2',
        ],
        summary: 'Tools mentioned',
        cost: 0.002,
      })

      const result = await processX('https://x.com/dev/status/456')

      expect(result?.resolvedUrls).toEqual([
        'https://github.com/user/repo1',
        'https://github.com/user/repo2',
      ])
    })

    it('should fall back to oembed when Grok fails', async () => {
      process.env.XAI_API_KEY = 'test-key'

      vi.mocked(fetchXContentWithGrok).mockResolvedValue(null)

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          html: '<blockquote><p>Tweet text here</p></blockquote>',
          author_name: 'FallbackUser',
          author_url: 'https://x.com/FallbackUser',
        }),
      })

      const result = await processX('https://x.com/user/status/789')

      expect(fetchXContentWithGrok).toHaveBeenCalled()
      expect(mockFetch).toHaveBeenCalled()
      expect(result?.authorName).toBe('FallbackUser')
      expect(result?.usedGrok).toBe(false)
    })
  })

  describe('processX with oembed fallback', () => {
    it('should use oembed when XAI_API_KEY is not configured', async () => {
      delete process.env.XAI_API_KEY

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          html: '<blockquote><p>Testing oembed fallback</p></blockquote>',
          author_name: 'OembedUser',
          author_url: 'https://x.com/OembedUser',
        }),
      })

      const result = await processX('https://x.com/user/status/111')

      expect(fetchXContentWithGrok).not.toHaveBeenCalled()
      expect(result?.text).toBe('Testing oembed fallback')
      expect(result?.authorName).toBe('OembedUser')
      expect(result?.usedGrok).toBe(false)
      expect(result?.grokCost).toBe(0)
    })

    it('should normalize twitter.com URLs to x.com', async () => {
      delete process.env.XAI_API_KEY

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          html: '<blockquote><p>Normalized URL test</p></blockquote>',
          author_name: 'User',
          author_url: 'https://x.com/User',
        }),
      })

      await processX('https://twitter.com/user/status/222')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('x.com')
      )
    })

    it('should extract text from HTML and decode entities', async () => {
      delete process.env.XAI_API_KEY

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          html: '<blockquote><p>Testing &amp; decoding &lt;entities&gt; &quot;properly&quot;</p></blockquote>',
          author_name: 'User',
          author_url: 'https://x.com/User',
        }),
      })

      const result = await processX('https://x.com/user/status/333')

      expect(result?.text).toBe('Testing & decoding <entities> "properly"')
    })

    it('should handle line breaks in tweet text', async () => {
      delete process.env.XAI_API_KEY

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          html: '<blockquote><p>Line one<br>Line two<br/>Line three</p></blockquote>',
          author_name: 'User',
          author_url: 'https://x.com/User',
        }),
      })

      const result = await processX('https://x.com/user/status/444')

      expect(result?.text).toBe('Line one\nLine two\nLine three')
    })

    it('should detect link-only tweets', async () => {
      delete process.env.XAI_API_KEY

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          html: '<blockquote><p>https://t.co/abc123</p></blockquote>',
          author_name: 'User',
          author_url: 'https://x.com/User',
        }),
      })

      const result = await processX('https://x.com/user/status/555')

      expect(result?.isLinkOnly).toBe(true)
    })

    it('should detect X Article URLs in resolved URLs', async () => {
      delete process.env.XAI_API_KEY

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            html: '<blockquote><p>Check this article https://t.co/article</p></blockquote>',
            author_name: 'User',
            author_url: 'https://x.com/User',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: {
            get: () => 'https://x.com/i/article/123456',
          },
        })

      const result = await processX('https://x.com/user/status/666')

      expect(result?.xArticleUrl).toBe('https://x.com/i/article/123456')
    })

    it('should return null when oembed API fails', async () => {
      delete process.env.XAI_API_KEY

      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
      })

      const result = await processX('https://x.com/user/status/999')

      expect(result).toBeNull()
    })

    it('should handle oembed network errors gracefully', async () => {
      delete process.env.XAI_API_KEY

      mockFetch.mockRejectedValue(new Error('Network error'))

      const result = await processX('https://x.com/user/status/000')

      expect(result).toBeNull()
    })
  })

  describe('t.co URL resolution', () => {
    it('should resolve t.co URLs to final destinations', async () => {
      delete process.env.XAI_API_KEY

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            html: '<blockquote><p>Check this https://t.co/abc123</p></blockquote>',
            author_name: 'User',
            author_url: 'https://x.com/User',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: {
            get: () => 'https://github.com/user/repo',
          },
        })

      const result = await processX('https://x.com/user/status/777')

      expect(result?.resolvedUrls).toContain('https://github.com/user/repo')
    })

    it('should skip t.co URLs that redirect to another t.co', async () => {
      delete process.env.XAI_API_KEY

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            html: '<blockquote><p>Check this https://t.co/abc123</p></blockquote>',
            author_name: 'User',
            author_url: 'https://x.com/User',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: {
            get: () => 'https://t.co/xyz789',
          },
        })

      const result = await processX('https://x.com/user/status/888')

      expect(result?.resolvedUrls).toHaveLength(0)
    })
  })
})
