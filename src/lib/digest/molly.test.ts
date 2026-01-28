import { describe, it, expect } from 'vitest'
import { MOLLY_SOUL, EMPTY_DAY_SCRIPT } from './molly'

describe('molly persona', () => {
  describe('MOLLY_SOUL', () => {
    it('exports a non-empty string', () => {
      expect(MOLLY_SOUL).toBeDefined()
      expect(typeof MOLLY_SOUL).toBe('string')
      expect(MOLLY_SOUL.length).toBeGreaterThan(0)
    })

    it('contains key persona characteristics', () => {
      expect(MOLLY_SOUL).toContain('Molly')
      expect(MOLLY_SOUL.toLowerCase()).toContain('sharp')
      expect(MOLLY_SOUL.toLowerCase()).toContain('decisive')
    })

    it('includes guidance for what Molly should NOT do', () => {
      expect(MOLLY_SOUL).toContain("DOESN'T do")
    })
  })

  describe('EMPTY_DAY_SCRIPT', () => {
    it('generates a script with the user name', () => {
      const script = EMPTY_DAY_SCRIPT('Brandon')
      expect(script).toContain('Brandon')
    })

    it('handles generic name', () => {
      const script = EMPTY_DAY_SCRIPT('there')
      expect(script).toContain('Hey there')
    })

    it('mentions Molly', () => {
      const script = EMPTY_DAY_SCRIPT('Test')
      expect(script).toContain('Molly here')
    })

    it('indicates nothing new came in', () => {
      const script = EMPTY_DAY_SCRIPT('User')
      expect(script).toMatch(/nothing new|no roundup/i)
    })

    it('has a friendly sign-off', () => {
      const script = EMPTY_DAY_SCRIPT('User')
      expect(script).toContain('Have a good one')
    })
  })
})
