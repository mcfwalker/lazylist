import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { textToSpeech, estimateTTSCost } from './tts'

describe('tts', () => {
  describe('estimateTTSCost', () => {
    it('calculates cost for 1000 characters', () => {
      const text = 'a'.repeat(1000)
      const cost = estimateTTSCost(text)
      expect(cost).toBeCloseTo(0.015, 5)
    })

    it('calculates cost for 2000 characters', () => {
      const text = 'a'.repeat(2000)
      const cost = estimateTTSCost(text)
      expect(cost).toBeCloseTo(0.030, 5)
    })

    it('handles empty string', () => {
      const cost = estimateTTSCost('')
      expect(cost).toBe(0)
    })

    it('handles short text', () => {
      const cost = estimateTTSCost('Hello')
      expect(cost).toBeCloseTo(0.000075, 6)
    })

    it('calculates cost proportionally', () => {
      const cost500 = estimateTTSCost('a'.repeat(500))
      const cost1000 = estimateTTSCost('a'.repeat(1000))
      expect(cost1000).toBeCloseTo(cost500 * 2, 5)
    })
  })

  describe('textToSpeech', () => {
    let originalFetch: typeof global.fetch

    beforeEach(() => {
      originalFetch = global.fetch
      process.env.OPENAI_API_KEY = 'test-api-key'
    })

    afterEach(() => {
      global.fetch = originalFetch
      delete process.env.OPENAI_API_KEY
    })

    it('calls OpenAI TTS API with correct parameters', async () => {
      const mockResponse = new ArrayBuffer(100)
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockResponse),
      })

      await textToSpeech('Hello world')

      expect(fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/audio/speech',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key',
            'Content-Type': 'application/json',
          }),
        })
      )
    })

    it('uses default options when none provided', async () => {
      const mockResponse = new ArrayBuffer(100)
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockResponse),
      })

      await textToSpeech('Test text')

      const callBody = JSON.parse(
        (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body
      )
      expect(callBody.model).toBe('gpt-4o-mini-tts')
      expect(callBody.voice).toBe('marin')
      expect(callBody.speed).toBe(1.0)
      expect(callBody.response_format).toBe('opus')
      expect(callBody.instructions).toBeDefined()
    })

    it('accepts custom options', async () => {
      const mockResponse = new ArrayBuffer(100)
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockResponse),
      })

      await textToSpeech('Test', { voice: 'nova', speed: 1.5 })

      const callBody = JSON.parse(
        (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body
      )
      expect(callBody.voice).toBe('nova')
      expect(callBody.speed).toBe(1.5)
    })

    it('returns audio buffer and cost', async () => {
      const mockResponse = new ArrayBuffer(100)
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockResponse),
      })

      const result = await textToSpeech('a'.repeat(1000))

      expect(result.audio).toBeInstanceOf(Buffer)
      expect(result.cost).toBeCloseTo(0.015, 5)
    })

    it('throws error on API failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      })

      await expect(textToSpeech('Test')).rejects.toThrow(
        'OpenAI TTS error: 401 - Unauthorized'
      )
    })
  })
})
