'use client'

import { useEffect, useState, useCallback } from 'react'
import { Item } from '@/lib/supabase'
import styles from './page.module.css'

const DOMAINS = ['all', 'vibe-coding', 'ai-filmmaking', 'other']
const CONTENT_TYPES = ['all', 'repo', 'technique', 'tool', 'resource', 'person']
const STATUSES = ['all', 'processed', 'pending', 'failed']

export default function Home() {
  const [items, setItems] = useState<Item[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [domain, setDomain] = useState('all')
  const [contentType, setContentType] = useState('all')
  const [status, setStatus] = useState('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (domain !== 'all') params.set('domain', domain)
    if (contentType !== 'all') params.set('type', contentType)
    if (status !== 'all') params.set('status', status)
    if (search) params.set('q', search)

    try {
      const res = await fetch(`/api/items?${params}`)
      const data = await res.json()
      setItems(data.items || [])
      setTotal(data.total || 0)
    } catch (err) {
      console.error('Fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [domain, contentType, status, search])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  const updateItem = async (id: string, updates: Partial<Item>) => {
    try {
      const res = await fetch(`/api/items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (res.ok) {
        const updated = await res.json()
        setItems((prev) => prev.map((item) => (item.id === id ? updated : item)))
      }
    } catch (err) {
      console.error('Update error:', err)
    }
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const days = Math.floor(hours / 24)

    if (hours < 1) return 'just now'
    if (hours < 24) return `${hours}h ago`
    if (days < 7) return `${days}d ago`
    return date.toLocaleDateString()
  }

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>LazyList</h1>
        <input
          type="text"
          placeholder="Search..."
          className={styles.search}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </header>

      <div className={styles.filters}>
        <select value={domain} onChange={(e) => setDomain(e.target.value)}>
          {DOMAINS.map((d) => (
            <option key={d} value={d}>
              {d === 'all' ? 'All Domains' : d}
            </option>
          ))}
        </select>
        <select value={contentType} onChange={(e) => setContentType(e.target.value)}>
          {CONTENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t === 'all' ? 'All Types' : t}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === 'all' ? 'All Status' : s}
            </option>
          ))}
        </select>
        <span className={styles.count}>{total} items</span>
      </div>

      <div className={styles.list}>
        {loading ? (
          <div className={styles.loading}>Loading...</div>
        ) : items.length === 0 ? (
          <div className={styles.empty}>No items found</div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className={`${styles.card} ${expandedId === item.id ? styles.expanded : ''}`}
              onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
            >
              <div className={styles.cardHeader}>
                <div className={styles.cardTitle}>
                  <span className={styles.name}>{item.title || 'Processing...'}</span>
                  <select
                    className={styles.domainSelect}
                    value={item.domain || 'other'}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => updateItem(item.id, { domain: e.target.value })}
                  >
                    {DOMAINS.filter((d) => d !== 'all').map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={styles.cardMeta}>
                  <span className={styles.type}>{item.content_type || item.source_type}</span>
                  {item.github_metadata?.stars && (
                    <span className={styles.stars}>★ {item.github_metadata.stars.toLocaleString()}</span>
                  )}
                  {item.github_metadata?.language && (
                    <span className={styles.language}>{item.github_metadata.language}</span>
                  )}
                  <span className={styles.date}>{formatDate(item.captured_at)}</span>
                  <span className={`${styles.status} ${styles[item.status]}`}>{item.status}</span>
                </div>
              </div>

              {item.summary && <p className={styles.summary}>{item.summary}</p>}

              {expandedId === item.id && (
                <div className={styles.cardDetails}>
                  <div className={styles.detailRow}>
                    <strong>Source:</strong>
                    <a href={item.source_url} target="_blank" rel="noopener noreferrer">
                      {item.source_url}
                    </a>
                  </div>
                  {item.tags && item.tags.length > 0 && (
                    <div className={styles.detailRow}>
                      <strong>Tags:</strong>
                      <span className={styles.tags}>
                        {item.tags.map((tag) => (
                          <span key={tag} className={styles.tag}>
                            {tag}
                          </span>
                        ))}
                      </span>
                    </div>
                  )}
                  {item.transcript && (
                    <div className={styles.detailRow}>
                      <strong>Transcript:</strong>
                      <p className={styles.transcript}>{item.transcript}</p>
                    </div>
                  )}
                  {item.error_message && (
                    <div className={styles.detailRow}>
                      <strong>Error:</strong>
                      <span className={styles.error}>{item.error_message}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </main>
  )
}
