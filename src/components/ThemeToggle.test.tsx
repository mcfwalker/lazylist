/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThemeToggle } from './ThemeToggle'

describe('ThemeToggle', () => {
  let mockLocalStorage: Record<string, string>

  beforeEach(() => {
    // Mock localStorage
    mockLocalStorage = {}
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => mockLocalStorage[key] || null),
      setItem: vi.fn((key: string, value: string) => {
        mockLocalStorage[key] = value
      }),
    })

    // Reset document class
    document.documentElement.classList.remove('dark')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders a button', () => {
    render(<ThemeToggle />)
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('shows moon icon (SVG) in light mode', () => {
    render(<ThemeToggle />)
    // Moon icon has a path element
    const button = screen.getByRole('button')
    expect(button.querySelector('svg')).toBeInTheDocument()
    expect(button.querySelector('path')).toBeInTheDocument()
  })

  it('shows sun icon (SVG) in dark mode', () => {
    mockLocalStorage['theme'] = 'dark'
    render(<ThemeToggle />)
    // Sun icon has circle and line elements
    const button = screen.getByRole('button')
    expect(button.querySelector('svg')).toBeInTheDocument()
    expect(button.querySelector('circle')).toBeInTheDocument()
  })

  it('toggles to dark mode when clicked in light mode', () => {
    render(<ThemeToggle />)

    fireEvent.click(screen.getByRole('button'))

    expect(localStorage.setItem).toHaveBeenCalledWith('theme', 'dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('toggles to light mode when clicked in dark mode', () => {
    mockLocalStorage['theme'] = 'dark'
    render(<ThemeToggle />)

    fireEvent.click(screen.getByRole('button'))

    expect(localStorage.setItem).toHaveBeenCalledWith('theme', 'light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('defaults to light mode when no localStorage value', () => {
    render(<ThemeToggle />)

    // Component defaults to light mode
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('respects localStorage dark preference', () => {
    mockLocalStorage['theme'] = 'dark'
    render(<ThemeToggle />)

    expect(document.documentElement.classList.contains('dark')).toBe(true)
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
