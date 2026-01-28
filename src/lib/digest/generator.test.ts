import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { estimateDuration, DigestItem } from './generator'

describe('generator', () => {
  describe('estimateDuration', () => {
    it('estimates duration based on word count at 140 wpm', () => {
      // 140 words = 1 minute = 60 seconds
      const script = Array(140).fill('word').join(' ')
      const duration = estimateDuration(script)
      expect(duration).toBe(60)
    })

    it('rounds up to nearest second', () => {
      // 150 words ≈ 64.3 seconds → rounds to 65
      const script = Array(150).fill('word').join(' ')
      const duration = estimateDuration(script)
      expect(duration).toBe(65)
    })

    it('handles short scripts', () => {
      const script = 'Hello world'
      const duration = estimateDuration(script)
      expect(duration).toBe(1) // Rounds up from ~0.85 seconds
    })

    it('handles empty script', () => {
      // Note: split(/\s+/) on '' returns [''] which has length 1
      // This is an edge case that results in 1 second (ceil of 1/140*60)
      const duration = estimateDuration('')
      expect(duration).toBe(1)
    })

    it('handles long scripts', () => {
      // 700 words = 5 minutes = 300 seconds
      const script = Array(700).fill('word').join(' ')
      const duration = estimateDuration(script)
      expect(duration).toBe(300)
    })
  })

  // Note: generateScript and updateUserContext require mocking the Anthropic SDK
  // which instantiates at module load time. These functions are tested via
  // integration tests with the digest system. Unit tests here focus on
  // the utility functions that don't require external dependencies.
})
