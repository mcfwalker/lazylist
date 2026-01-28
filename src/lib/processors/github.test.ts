import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { processGitHub } from './github'

describe('processGitHub', () => {
  let originalFetch: typeof global.fetch

  beforeEach(() => {
    originalFetch = global.fetch
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    global.fetch = originalFetch
    delete process.env.GITHUB_TOKEN
    vi.restoreAllMocks()
  })

  it('returns null for invalid GitHub URL', async () => {
    const result = await processGitHub('https://not-github.com/user/repo')
    expect(result).toBeNull()
  })

  it('returns null for GitHub URL without owner/repo', async () => {
    const result = await processGitHub('https://github.com/')
    expect(result).toBeNull()
  })

  it('fetches repo metadata from GitHub API', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          name: 'test-repo',
          description: 'A test repository',
          stargazers_count: 1234,
          language: 'TypeScript',
          topics: ['testing', 'typescript'],
        }),
    })

    const result = await processGitHub('https://github.com/owner/test-repo')

    expect(fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/owner/test-repo',
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'MollyMemo/0.1',
        }),
      })
    )

    expect(result).toEqual({
      name: 'test-repo',
      description: 'A test repository',
      stars: 1234,
      language: 'TypeScript',
      topics: ['testing', 'typescript'],
      owner: 'owner',
      repo: 'test-repo',
    })
  })

  it('includes authorization header when GITHUB_TOKEN is set', async () => {
    process.env.GITHUB_TOKEN = 'test-github-token'

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          name: 'repo',
          description: null,
          stargazers_count: 100,
          language: null,
          topics: [],
        }),
    })

    await processGitHub('https://github.com/owner/repo')

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-github-token',
        }),
      })
    )
  })

  it('handles repos with no topics', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          name: 'minimal-repo',
          description: null,
          stargazers_count: 0,
          language: null,
          // topics field missing
        }),
    })

    const result = await processGitHub('https://github.com/owner/minimal-repo')

    expect(result?.topics).toEqual([])
  })

  it('returns null on API error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    })

    const result = await processGitHub('https://github.com/owner/nonexistent')

    expect(result).toBeNull()
  })

  it('returns null on network error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    const result = await processGitHub('https://github.com/owner/repo')

    expect(result).toBeNull()
  })

  it('handles various GitHub URL formats', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          name: 'repo',
          description: 'Test',
          stargazers_count: 100,
          language: 'JavaScript',
          topics: [],
        }),
    })

    // Standard URL
    await processGitHub('https://github.com/owner/repo')
    expect(fetch).toHaveBeenLastCalledWith(
      'https://api.github.com/repos/owner/repo',
      expect.any(Object)
    )

    // URL with trailing slash
    await processGitHub('https://github.com/owner/repo/')
    expect(fetch).toHaveBeenLastCalledWith(
      'https://api.github.com/repos/owner/repo',
      expect.any(Object)
    )

    // URL with path suffix (e.g., /tree/main)
    await processGitHub('https://github.com/owner/repo/tree/main/src')
    expect(fetch).toHaveBeenLastCalledWith(
      'https://api.github.com/repos/owner/repo',
      expect.any(Object)
    )
  })

  it('extracts owner and repo correctly', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          name: 'my-awesome-repo',
          description: 'Test',
          stargazers_count: 500,
          language: 'Rust',
          topics: ['cli'],
        }),
    })

    const result = await processGitHub('https://github.com/cool-org/my-awesome-repo')

    expect(result?.owner).toBe('cool-org')
    expect(result?.repo).toBe('my-awesome-repo')
  })
})
