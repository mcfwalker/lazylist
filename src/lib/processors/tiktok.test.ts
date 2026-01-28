import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { processTikTok } from './tiktok'

// Mock the repo-extractor module
vi.mock('./repo-extractor', () => ({
  extractReposFromTranscript: vi.fn().mockResolvedValue({
    repos: [{ url: 'https://github.com/extracted/repo' }],
    cost: 0.001,
  }),
}))

import { extractReposFromTranscript } from './repo-extractor'

describe('processTikTok', () => {
  let originalFetch: typeof global.fetch

  beforeEach(() => {
    originalFetch = global.fetch
    process.env.OPENAI_API_KEY = 'test-api-key'
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.clearAllMocks()
  })

  afterEach(() => {
    global.fetch = originalFetch
    delete process.env.OPENAI_API_KEY
    vi.restoreAllMocks()
  })

  it('returns null when OPENAI_API_KEY is not set', async () => {
    delete process.env.OPENAI_API_KEY

    const result = await processTikTok('https://vm.tiktok.com/abc123')

    expect(result).toBeNull()
  })

  it('processes TikTok video and returns transcript', async () => {
    // Mock tikwm API response
    const tikwmResponse = {
      data: { play: 'https://video.url/video.mp4' },
    }

    // Mock video download response
    const videoBlob = new Blob(['video data'], { type: 'video/mp4' })

    // Mock OpenAI transcription response
    const transcriptionResponse = {
      text: 'This is the transcript of the video.',
    }

    global.fetch = vi
      .fn()
      // First call: tikwm API
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(tikwmResponse),
      })
      // Second call: video download
      .mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(videoBlob),
      })
      // Third call: OpenAI transcription
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(transcriptionResponse),
      })

    const result = await processTikTok('https://vm.tiktok.com/abc123')

    expect(result).toEqual({
      transcript: 'This is the transcript of the video.',
      extractedUrls: expect.any(Array),
      repoExtractionCost: expect.any(Number),
    })
  })

  it('extracts GitHub URLs from transcript', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { play: 'https://video.url/video.mp4' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(new Blob(['data'])),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            text: 'Check out this repo: github.com/user/awesome-repo and github.com/org/another-repo',
          }),
      })

    const result = await processTikTok('https://vm.tiktok.com/abc123')

    expect(result?.extractedUrls).toContain('https://github.com/user/awesome-repo')
    expect(result?.extractedUrls).toContain('https://github.com/org/another-repo')
    // Should NOT call extractReposFromTranscript when explicit URLs found
    expect(extractReposFromTranscript).not.toHaveBeenCalled()
  })

  it('uses smart extraction when no GitHub URLs in transcript', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { play: 'https://video.url/video.mp4' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(new Blob(['data'])),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            text: 'This video mentions a tool but no explicit URL.',
          }),
      })

    const result = await processTikTok('https://vm.tiktok.com/abc123')

    expect(extractReposFromTranscript).toHaveBeenCalledWith(
      'This video mentions a tool but no explicit URL.'
    )
    expect(result?.extractedUrls).toContain('https://github.com/extracted/repo')
    expect(result?.repoExtractionCost).toBe(0.001)
  })

  it('returns null when tikwm API fails', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
    })

    const result = await processTikTok('https://vm.tiktok.com/abc123')

    expect(result).toBeNull()
  })

  it('returns null when no video URL in tikwm response', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: {} }),
    })

    const result = await processTikTok('https://vm.tiktok.com/abc123')

    expect(result).toBeNull()
  })

  it('returns null when video download fails', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { play: 'https://video.url/video.mp4' } }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

    const result = await processTikTok('https://vm.tiktok.com/abc123')

    expect(result).toBeNull()
  })

  it('returns null when transcription fails', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { play: 'https://video.url/video.mp4' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(new Blob(['data'])),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal error'),
      })

    const result = await processTikTok('https://vm.tiktok.com/abc123')

    expect(result).toBeNull()
  })

  it('handles network errors gracefully', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    const result = await processTikTok('https://vm.tiktok.com/abc123')

    expect(result).toBeNull()
  })

  it('deduplicates extracted URLs', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { play: 'https://video.url/video.mp4' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(new Blob(['data'])),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            text: 'Check github.com/user/repo and again github.com/user/repo here',
          }),
      })

    const result = await processTikTok('https://vm.tiktok.com/abc123')

    // Should have deduplicated URLs
    const repoCount = result?.extractedUrls.filter(
      (u) => u === 'https://github.com/user/repo'
    ).length
    expect(repoCount).toBe(1)
  })

  it('cleans trailing punctuation from URLs', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { play: 'https://video.url/video.mp4' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(new Blob(['data'])),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            text: 'Go to github.com/user/repo, or check github.com/org/tool.',
          }),
      })

    const result = await processTikTok('https://vm.tiktok.com/abc123')

    expect(result?.extractedUrls).toContain('https://github.com/user/repo')
    expect(result?.extractedUrls).toContain('https://github.com/org/tool')
    // Should not contain URLs with trailing punctuation
    expect(result?.extractedUrls).not.toContain('https://github.com/user/repo,')
    expect(result?.extractedUrls).not.toContain('https://github.com/org/tool.')
  })
})
