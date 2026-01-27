/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThemeToggle } from './ThemeToggle'

describe('ThemeToggle', () => {
  let mockLocalStorage: Record<string, string>
  let mockMatchMedia: ReturnType<typeof vi.fn>

  beforeEach(() => {
    // Mock localStorage
    mockLocalStorage = {}
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => mockLocalStorage[key] || null),
      setItem: vi.fn((key: string, value: string) => {
        mockLocalStorage[key] = value
      }),
    })

    // Mock matchMedia
    mockMatchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
    vi.stubGlobal('matchMedia', mockMatchMedia)

    // Mock document.documentElement.classList
    document.documentElement.classList.remove('dark')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders a button', () => {
    render(<ThemeToggle />)
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('shows moon icon in light mode', () => {
    render(<ThemeToggle />)
    expect(screen.getByText('🌙')).toBeInTheDocument()
  })

  it('shows sun icon in dark mode', () => {
    mockLocalStorage['theme'] = 'dark'
    render(<ThemeToggle />)
    expect(screen.getByText('☀️')).toBeInTheDocument()
  })

  it('toggles to dark mode when clicked in light mode', () => {
    render(<ThemeToggle />)

    fireEvent.click(screen.getByRole('button'))

    expect(localStorage.setItem).toHaveBeenCalledWith('theme', 'dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(screen.getByText('☀️')).toBeInTheDocument()
  })

  it('toggles to light mode when clicked in dark mode', () => {
    mockLocalStorage['theme'] = 'dark'
    render(<ThemeToggle />)

    fireEvent.click(screen.getByRole('button'))

    expect(localStorage.setItem).toHaveBeenCalledWith('theme', 'light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(screen.getByText('🌙')).toBeInTheDocument()
  })

  it('respects system preference when no localStorage value', () => {
    mockMatchMedia.mockReturnValue({
      matches: true, // prefers-color-scheme: dark
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })

    render(<ThemeToggle />)

    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(screen.getByText('☀️')).toBeInTheDocument()
  })

  it('prefers localStorage over system preference', () => {
    mockLocalStorage['theme'] = 'light'
    mockMatchMedia.mockReturnValue({
      matches: true, // system prefers dark
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })

    render(<ThemeToggle />)

    // Should be light mode because localStorage says so
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(screen.getByText('🌙')).toBeInTheDocument()
  })

  it('has correct title in light mode', () => {
    render(<ThemeToggle />)
    expect(screen.getByTitle('Switch to dark mode')).toBeInTheDocument()
  })

  it('has correct title in dark mode', () => {
    mockLocalStorage['theme'] = 'dark'
    render(<ThemeToggle />)
    expect(screen.getByTitle('Switch to light mode')).toBeInTheDocument()
  })
})
