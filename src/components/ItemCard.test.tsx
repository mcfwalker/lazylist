/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ItemCard } from './ItemCard'
import { Item } from '@/lib/supabase'

// Mock CSS modules
vi.mock('@/app/page.module.css', () => ({
  default: {
    card: 'card',
    expanded: 'expanded',
    cardHeader: 'cardHeader',
    cardTitle: 'cardTitle',
    cardMeta: 'cardMeta',
    cardDetails: 'cardDetails',
    cardActions: 'cardActions',
    summary: 'summary',
    name: 'name',
    editBtn: 'editBtn',
    editInput: 'editInput',
    domainSelect: 'domainSelect',
    itemNumber: 'itemNumber',
    type: 'type',
    stars: 'stars',
    language: 'language',
    date: 'date',
    status: 'status',
    processed: 'processed',
    pending: 'pending',
    failed: 'failed',
    detailRow: 'detailRow',
    repoList: 'repoList',
    repoLink: 'repoLink',
    tags: 'tags',
    tag: 'tag',
    transcript: 'transcript',
    error: 'error',
    deleteBtn: 'deleteBtn',
  },
}))

const mockItem: Item = {
  id: 'test-id-123',
  item_number: 42,
  user_id: 'test-user-uuid',
  source_url: 'https://github.com/test/repo',
  source_type: 'github',
  status: 'processed',
  title: 'Test Repo',
  summary: 'A test repository for testing',
  domain: 'vibe-coding',
  content_type: 'repo',
  tags: ['test', 'vitest', 'react'],
  captured_at: new Date().toISOString(),
  processed_at: new Date().toISOString(),
  transcript: null,
  github_url: null,
  github_metadata: { stars: 1234, language: 'TypeScript' },
  extracted_entities: { repos: ['https://github.com/other/repo'], tools: [], techniques: [] },
  raw_data: null,
  error_message: null,
  openai_cost: null,
  grok_cost: null,
  repo_extraction_cost: null,
}

describe('ItemCard', () => {
  const defaultProps = {
    item: mockItem,
    isExpanded: false,
    onToggleExpand: vi.fn(),
    onUpdate: vi.fn(),
    onDelete: vi.fn(),
    onRetry: vi.fn(),
  }

  it('renders item title', () => {
    render(<ItemCard {...defaultProps} />)
    expect(screen.getByText('Test Repo')).toBeInTheDocument()
  })

  it('shows "Processing..." when title is null', () => {
    const itemWithoutTitle = { ...mockItem, title: null }
    render(<ItemCard {...defaultProps} item={itemWithoutTitle} />)
    expect(screen.getByText('Processing...')).toBeInTheDocument()
  })

  it('displays item number', () => {
    render(<ItemCard {...defaultProps} />)
    expect(screen.getByText('#42')).toBeInTheDocument()
  })

  it('displays content type', () => {
    render(<ItemCard {...defaultProps} />)
    expect(screen.getByText('repo')).toBeInTheDocument()
  })

  it('displays GitHub stars when available', () => {
    render(<ItemCard {...defaultProps} />)
    expect(screen.getByText('★ 1,234')).toBeInTheDocument()
  })

  it('displays language when available', () => {
    render(<ItemCard {...defaultProps} />)
    expect(screen.getByText('TypeScript')).toBeInTheDocument()
  })

  it('displays summary', () => {
    render(<ItemCard {...defaultProps} />)
    expect(screen.getByText('A test repository for testing')).toBeInTheDocument()
  })

  it('displays status', () => {
    render(<ItemCard {...defaultProps} />)
    expect(screen.getByText('processed')).toBeInTheDocument()
  })

  it('calls onToggleExpand when card is clicked', () => {
    const onToggleExpand = vi.fn()
    render(<ItemCard {...defaultProps} onToggleExpand={onToggleExpand} />)

    const card = screen.getByText('Test Repo').closest('.card')
    fireEvent.click(card!)

    expect(onToggleExpand).toHaveBeenCalled()
  })

  describe('collapsed state', () => {
    it('does not show details when collapsed', () => {
      render(<ItemCard {...defaultProps} isExpanded={false} />)

      expect(screen.queryByText('Source:')).not.toBeInTheDocument()
      expect(screen.queryByText('Delete')).not.toBeInTheDocument()
    })
  })

  describe('expanded state', () => {
    it('shows source URL when expanded', () => {
      render(<ItemCard {...defaultProps} isExpanded={true} />)

      expect(screen.getByText('Source:')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: mockItem.source_url })).toBeInTheDocument()
    })

    it('shows extracted repos when expanded', () => {
      render(<ItemCard {...defaultProps} isExpanded={true} />)

      expect(screen.getByText('GitHub Repos:')).toBeInTheDocument()
      expect(screen.getByText('other/repo')).toBeInTheDocument()
    })

    it('shows tags when expanded', () => {
      render(<ItemCard {...defaultProps} isExpanded={true} />)

      expect(screen.getByText('Tags:')).toBeInTheDocument()
      expect(screen.getByText('test')).toBeInTheDocument()
      expect(screen.getByText('vitest')).toBeInTheDocument()
    })

    it('shows delete button when expanded', () => {
      render(<ItemCard {...defaultProps} isExpanded={true} />)
      expect(screen.getByText('Delete')).toBeInTheDocument()
    })

    it('calls onDelete when delete button is clicked', () => {
      const onDelete = vi.fn()
      render(<ItemCard {...defaultProps} isExpanded={true} onDelete={onDelete} />)

      fireEvent.click(screen.getByText('Delete'))

      expect(onDelete).toHaveBeenCalledWith('test-id-123')
    })

    it('shows error message when present', () => {
      const itemWithError = { ...mockItem, error_message: 'Something went wrong' }
      render(<ItemCard {...defaultProps} item={itemWithError} isExpanded={true} />)

      expect(screen.getByText('Error:')).toBeInTheDocument()
      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    })

    it('shows transcript when present', () => {
      const itemWithTranscript = { ...mockItem, transcript: 'This is the transcript text' }
      render(<ItemCard {...defaultProps} item={itemWithTranscript} isExpanded={true} />)

      expect(screen.getByText('Transcript:')).toBeInTheDocument()
      expect(screen.getByText('This is the transcript text')).toBeInTheDocument()
    })
  })

  describe('domain selector', () => {
    it('renders domain select with current value', () => {
      render(<ItemCard {...defaultProps} />)

      const select = screen.getByRole('combobox')
      expect(select).toHaveValue('vibe-coding')
    })

    it('calls onUpdate when domain is changed', () => {
      const onUpdate = vi.fn()
      render(<ItemCard {...defaultProps} onUpdate={onUpdate} />)

      const select = screen.getByRole('combobox')
      fireEvent.change(select, { target: { value: 'ai-filmmaking' } })

      expect(onUpdate).toHaveBeenCalledWith('test-id-123', { domain: 'ai-filmmaking' })
    })

    it('does not trigger expand when changing domain', () => {
      const onToggleExpand = vi.fn()
      render(<ItemCard {...defaultProps} onToggleExpand={onToggleExpand} />)

      const select = screen.getByRole('combobox')
      fireEvent.click(select)

      expect(onToggleExpand).not.toHaveBeenCalled()
    })
  })

  describe('title editing', () => {
    it('shows edit button next to title', () => {
      render(<ItemCard {...defaultProps} />)
      expect(screen.getByTitle('Edit title')).toBeInTheDocument()
    })

    it('enters edit mode when edit button is clicked', () => {
      render(<ItemCard {...defaultProps} />)

      fireEvent.click(screen.getByTitle('Edit title'))

      expect(screen.getByRole('textbox')).toBeInTheDocument()
      expect(screen.getByRole('textbox')).toHaveValue('Test Repo')
    })

    it('calls onUpdate when Enter is pressed', () => {
      const onUpdate = vi.fn()
      render(<ItemCard {...defaultProps} onUpdate={onUpdate} />)

      fireEvent.click(screen.getByTitle('Edit title'))
      const input = screen.getByRole('textbox')
      fireEvent.change(input, { target: { value: 'New Title' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(onUpdate).toHaveBeenCalledWith('test-id-123', { title: 'New Title' })
    })

    it('cancels edit when Escape is pressed', () => {
      render(<ItemCard {...defaultProps} />)

      fireEvent.click(screen.getByTitle('Edit title'))
      const input = screen.getByRole('textbox')
      fireEvent.change(input, { target: { value: 'New Title' } })
      fireEvent.keyDown(input, { key: 'Escape' })

      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
      expect(screen.getByText('Test Repo')).toBeInTheDocument()
    })

    it('saves on blur', () => {
      const onUpdate = vi.fn()
      render(<ItemCard {...defaultProps} onUpdate={onUpdate} />)

      fireEvent.click(screen.getByTitle('Edit title'))
      const input = screen.getByRole('textbox')
      fireEvent.change(input, { target: { value: 'Blurred Title' } })
      fireEvent.blur(input)

      expect(onUpdate).toHaveBeenCalledWith('test-id-123', { title: 'Blurred Title' })
    })

    it('does not save empty title', () => {
      const onUpdate = vi.fn()
      render(<ItemCard {...defaultProps} onUpdate={onUpdate} />)

      fireEvent.click(screen.getByTitle('Edit title'))
      const input = screen.getByRole('textbox')
      fireEvent.change(input, { target: { value: '   ' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(onUpdate).not.toHaveBeenCalled()
    })
  })
})
