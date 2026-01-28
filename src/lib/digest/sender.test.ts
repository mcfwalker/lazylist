import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sendVoiceMessage, sendTextMessage } from './sender'

describe('sender', () => {
  let originalFetch: typeof global.fetch

  beforeEach(() => {
    originalFetch = global.fetch
    process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token'
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    global.fetch = originalFetch
    delete process.env.TELEGRAM_BOT_TOKEN
    vi.restoreAllMocks()
  })

  describe('sendVoiceMessage', () => {
    it('returns error when TELEGRAM_BOT_TOKEN is not set', async () => {
      delete process.env.TELEGRAM_BOT_TOKEN

      const result = await sendVoiceMessage(123, Buffer.from('test'), 60)

      expect(result.success).toBe(false)
      expect(result.error).toContain('TELEGRAM_BOT_TOKEN')
    })

    it('sends voice message to Telegram API', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            ok: true,
            result: { voice: { file_id: 'test-file-id' } },
          }),
      })

      const result = await sendVoiceMessage(
        123456,
        Buffer.from('audio-data'),
        120
      )

      expect(fetch).toHaveBeenCalledWith(
        'https://api.telegram.org/bottest-bot-token/sendVoice',
        expect.objectContaining({
          method: 'POST',
        })
      )
      expect(result.success).toBe(true)
      expect(result.fileId).toBe('test-file-id')
    })

    it('includes caption when provided', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            ok: true,
            result: { voice: { file_id: 'test-file-id' } },
          }),
      })

      await sendVoiceMessage(123, Buffer.from('audio'), 60, 'Test caption')

      const callBody = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body
      expect(callBody.get('caption')).toBe('Test caption')
    })

    it('returns error on Telegram API failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            ok: false,
            description: 'Chat not found',
          }),
      })

      const result = await sendVoiceMessage(123, Buffer.from('audio'), 60)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Chat not found')
    })

    it('handles network errors gracefully', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

      const result = await sendVoiceMessage(123, Buffer.from('audio'), 60)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Network error')
    })
  })

  describe('sendTextMessage', () => {
    it('returns false when TELEGRAM_BOT_TOKEN is not set', async () => {
      delete process.env.TELEGRAM_BOT_TOKEN

      const result = await sendTextMessage(123, 'Hello')

      expect(result).toBe(false)
    })

    it('sends text message to Telegram API', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ ok: true }),
      })

      const result = await sendTextMessage(123456, 'Hello there!')

      expect(fetch).toHaveBeenCalledWith(
        'https://api.telegram.org/bottest-bot-token/sendMessage',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      )
      expect(result).toBe(true)
    })

    it('sends correct chat_id and text in body', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ ok: true }),
      })

      await sendTextMessage(789, 'Test message')

      const callBody = JSON.parse(
        (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body
      )
      expect(callBody.chat_id).toBe(789)
      expect(callBody.text).toBe('Test message')
    })

    it('returns false on Telegram API failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ ok: false }),
      })

      const result = await sendTextMessage(123, 'Hello')

      expect(result).toBe(false)
    })

    it('handles network errors gracefully', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

      const result = await sendTextMessage(123, 'Hello')

      expect(result).toBe(false)
    })
  })
})
