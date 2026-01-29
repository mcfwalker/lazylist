'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Item } from '@/lib/supabase'
import { ThemeToggle } from '@/components/ThemeToggle'
import { FilterBar } from '@/components/FilterBar'
import { ItemCard } from '@/components/ItemCard'
import styles from './page.module.css'

export default function Home() {
  const router = useRouter()
  const [items, setItems] = useState<Item[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [domain, setDomain] = useState('all')
  const [contentType, setContentType] = useState('all')
  const [status, setStatus] = useState('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  const handleLogout = async () => {
    await fetch('/api/auth', { method: 'DELETE' })
    router.push('/login')
  }

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

  // Fetch user info (for admin check)
  useEffect(() => {
    async function fetchUser() {
      try {
        const res = await fetch('/api/users/me')
        if (res.ok) {
          const user = await res.json()
          setIsAdmin(user.isAdmin || false)
        }
      } catch (err) {
        console.error('Error fetching user:', err)
      }
    }
    fetchUser()
  }, [])

  // Sync browser timezone to user profile (fire-and-forget)
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    fetch('/api/users/timezone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timezone: tz }),
    }).catch(() => {}) // Silent failure - non-critical
  }, [])

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

  const deleteItem = async (id: string) => {
    if (!confirm('Delete this item?')) return
    try {
      const res = await fetch(`/api/items/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setItems((prev) => prev.filter((item) => item.id !== id))
        setTotal((prev) => prev - 1)
        setExpandedId(null)
      }
    } catch (err) {
      console.error('Delete error:', err)
    }
  }

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <img src="/molly_sig_1.svg" alt="MollyMemo" className={styles.logo} />
        <div className={styles.headerRight}>
          <input
            type="text"
            placeholder="search..."
            className={styles.search}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <ThemeToggle />
          {isAdmin && (
            <Link href="/admin" className={styles.iconButton} title="Admin">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </Link>
          )}
          <Link href="/settings" className={styles.iconButton} title="Settings">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
            </svg>
          </Link>
          <button onClick={handleLogout} className={styles.iconButton} title="Logout">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </header>


      <FilterBar
        domain={domain}
        contentType={contentType}
        status={status}
        total={total}
        onDomainChange={setDomain}
        onContentTypeChange={setContentType}
        onStatusChange={setStatus}
      />

      <div className={styles.list}>
        {loading ? (
          <div className={styles.loading}>Loading...</div>
        ) : items.length === 0 ? (
          <div className={styles.empty}>No items found</div>
        ) : (
          items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              isExpanded={expandedId === item.id}
              onToggleExpand={() => setExpandedId(expandedId === item.id ? null : item.id)}
              onUpdate={updateItem}
              onDelete={deleteItem}
            />
          ))
        )}
      </div>
    </main>
  )
}
