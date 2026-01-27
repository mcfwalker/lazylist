/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FilterBar, DOMAINS } from './FilterBar'

describe('FilterBar', () => {
  const defaultProps = {
    domain: 'all',
    contentType: 'all',
    status: 'all',
    total: 42,
    onDomainChange: vi.fn(),
    onContentTypeChange: vi.fn(),
    onStatusChange: vi.fn(),
  }

  it('renders all filter dropdowns', () => {
    render(<FilterBar {...defaultProps} />)

    expect(screen.getByDisplayValue('All Domains')).toBeInTheDocument()
    expect(screen.getByDisplayValue('All Types')).toBeInTheDocument()
    expect(screen.getByDisplayValue('All Status')).toBeInTheDocument()
  })

  it('displays the total item count', () => {
    render(<FilterBar {...defaultProps} total={123} />)

    expect(screen.getByText('123 items')).toBeInTheDocument()
  })

  it('calls onDomainChange when domain filter changes', () => {
    const onDomainChange = vi.fn()
    render(<FilterBar {...defaultProps} onDomainChange={onDomainChange} />)

    const domainSelect = screen.getByDisplayValue('All Domains')
    fireEvent.change(domainSelect, { target: { value: 'vibe-coding' } })

    expect(onDomainChange).toHaveBeenCalledWith('vibe-coding')
  })

  it('calls onContentTypeChange when content type filter changes', () => {
    const onContentTypeChange = vi.fn()
    render(<FilterBar {...defaultProps} onContentTypeChange={onContentTypeChange} />)

    const typeSelect = screen.getByDisplayValue('All Types')
    fireEvent.change(typeSelect, { target: { value: 'repo' } })

    expect(onContentTypeChange).toHaveBeenCalledWith('repo')
  })

  it('calls onStatusChange when status filter changes', () => {
    const onStatusChange = vi.fn()
    render(<FilterBar {...defaultProps} onStatusChange={onStatusChange} />)

    const statusSelect = screen.getByDisplayValue('All Status')
    fireEvent.change(statusSelect, { target: { value: 'processed' } })

    expect(onStatusChange).toHaveBeenCalledWith('processed')
  })

  it('shows selected values correctly', () => {
    render(
      <FilterBar
        {...defaultProps}
        domain="ai-filmmaking"
        contentType="tool"
        status="pending"
      />
    )

    expect(screen.getByDisplayValue('ai-filmmaking')).toBeInTheDocument()
    expect(screen.getByDisplayValue('tool')).toBeInTheDocument()
    expect(screen.getByDisplayValue('pending')).toBeInTheDocument()
  })

  it('exports DOMAINS array', () => {
    expect(DOMAINS).toContain('all')
    expect(DOMAINS).toContain('vibe-coding')
    expect(DOMAINS).toContain('ai-filmmaking')
    expect(DOMAINS).toContain('other')
  })
})
