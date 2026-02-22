import { describe, it, expect } from 'vitest'
import { sanitizeSearchInput } from './security'

describe('sanitizeSearchInput', () => {
  it('passes through normal text', () => {
    expect(sanitizeSearchInput('hello world')).toBe('hello world')
    expect(sanitizeSearchInput('React hooks')).toBe('React hooks')
  })

  it('handles PostgREST wildcards', () => {
    // % gets escaped to \% then both get stripped by safe char filter
    expect(sanitizeSearchInput('100%')).toBe('100')
    // _ is a word character so it stays (escape backslash stripped)
    expect(sanitizeSearchInput('user_name')).toBe('user_name')
    // backslashes get doubled then stripped
    expect(sanitizeSearchInput('back\\slash')).toBe('backslash')
  })

  it('removes dangerous characters', () => {
    expect(sanitizeSearchInput('test;DROP TABLE')).toBe('testDROP TABLE')
    expect(sanitizeSearchInput('<script>alert(1)</script>')).toBe('scriptalert1script')
    expect(sanitizeSearchInput('query=value&other=2')).toBe('queryvalueother2')
  })

  it('allows safe punctuation', () => {
    expect(sanitizeSearchInput("it's fine")).toBe("it's fine")
    expect(sanitizeSearchInput('dash-case')).toBe('dash-case')
    expect(sanitizeSearchInput('3.14')).toBe('3.14')
  })

  it('truncates long input', () => {
    const longInput = 'a'.repeat(200)
    expect(sanitizeSearchInput(longInput).length).toBe(100)
  })
})
