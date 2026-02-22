'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Container } from '@/lib/supabase'
import { ThemeToggle } from '@/components/ThemeToggle'
import styles from './page.module.css'

interface ContainerItem {
  id: string
  title: string | null
  source_url: string
  domain: string | null
  content_type: string | null
}

export default function ContainersPage() {
  const [containers, setContainers] = useState<Container[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [items, setItems] = useState<ContainerItem[]>([])
  const [itemsLoading, setItemsLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [showMerge, setShowMerge] = useState(false)
  const [mergeTarget, setMergeTarget] = useState('')
  const [merging, setMerging] = useState(false)

  const fetchContainers = useCallback(async () => {
    try {
      const res = await fetch('/api/containers')
      const data = await res.json()
      setContainers(data.containers || [])
    } catch (err) {
      console.error('Error fetching containers:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchContainers()
  }, [fetchContainers])

  const fetchItems = useCallback(async (containerId: string) => {
    setItemsLoading(true)
    try {
      const res = await fetch(`/api/containers/${containerId}/items`)
      const data = await res.json()
      setItems(data.items || [])
    } catch (err) {
      console.error('Error fetching items:', err)
    } finally {
      setItemsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedId) {
      fetchItems(selectedId)
    } else {
      setItems([])
    }
  }, [selectedId, fetchItems])

  const selected = containers.find(c => c.id === selectedId)

  const handleRename = async (id: string) => {
    if (!editName.trim()) return
    try {
      const res = await fetch(`/api/containers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim() }),
      })
      if (res.ok) {
        setContainers(prev => prev.map(c => c.id === id ? { ...c, name: editName.trim() } : c))
      }
    } catch (err) {
      console.error('Rename error:', err)
    }
    setEditingId(null)
  }

  const handleDelete = async () => {
    if (!selectedId) return
    const container = containers.find(c => c.id === selectedId)
    if (!container) return

    const msg = container.item_count > 0
      ? `Delete "${container.name}" and unfile its ${container.item_count} items?`
      : `Delete "${container.name}"?`
    if (!confirm(msg)) return

    try {
      const res = await fetch(`/api/containers/${selectedId}?force=true`, { method: 'DELETE' })
      if (res.ok) {
        setContainers(prev => prev.filter(c => c.id !== selectedId))
        setSelectedId(null)
      }
    } catch (err) {
      console.error('Delete error:', err)
    }
  }

  const handleMerge = async () => {
    if (!selectedId || !mergeTarget) return
    setMerging(true)
    try {
      const res = await fetch('/api/containers/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_id: selectedId, target_id: mergeTarget }),
      })
      if (res.ok) {
        setShowMerge(false)
        setMergeTarget('')
        setSelectedId(mergeTarget)
        await fetchContainers()
      }
    } catch (err) {
      console.error('Merge error:', err)
    } finally {
      setMerging(false)
    }
  }

  const handleMoveItem = async (itemId: string, targetContainerId: string) => {
    if (!selectedId || targetContainerId === selectedId) return
    try {
      const res = await fetch(`/api/containers/${targetContainerId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: itemId, from_container_id: selectedId }),
      })
      if (res.ok) {
        setItems(prev => prev.filter(i => i.id !== itemId))
        await fetchContainers()
      }
    } catch (err) {
      console.error('Move error:', err)
    }
  }

  if (loading) {
    return (
      <main className={styles.main}>
        <div className={styles.loading}>Loading containers...</div>
      </main>
    )
  }

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <Link href="/" className={styles.backLink}>
          &larr; Back to List
        </Link>
        <ThemeToggle />
      </header>

      <h1 className={styles.title}>Containers</h1>

      {containers.length === 0 ? (
        <div className={styles.empty}>
          No containers yet. Items are auto-filed into containers when processed.
        </div>
      ) : (
        <div className={styles.layout}>
          <div className={styles.containerList}>
            {containers.map(container => (
              <div
                key={container.id}
                className={`${styles.containerCard} ${selectedId === container.id ? styles.selected : ''}`}
                onClick={() => setSelectedId(container.id)}
              >
                <div className={styles.containerName}>
                  {editingId === container.id ? (
                    <input
                      className={styles.editInput}
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onBlur={() => handleRename(container.id)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleRename(container.id)
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      onClick={e => e.stopPropagation()}
                      autoFocus
                    />
                  ) : (
                    <span
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        setEditingId(container.id)
                        setEditName(container.name)
                      }}
                    >
                      {container.name}
                    </span>
                  )}
                  <span className={styles.badge}>{container.item_count}</span>
                </div>
                {container.description && (
                  <div className={styles.containerDescription}>{container.description}</div>
                )}
              </div>
            ))}
          </div>

          <div>
            {selected ? (
              <div className={styles.detailPanel}>
                <div className={styles.detailHeader}>
                  <div>
                    <div className={styles.detailTitle}>{selected.name}</div>
                    {selected.description && (
                      <div className={styles.detailDescription}>{selected.description}</div>
                    )}
                  </div>
                </div>
                <div className={styles.detailMeta}>
                  {selected.item_count} items
                </div>

                {itemsLoading ? (
                  <div className={styles.loading}>Loading items...</div>
                ) : items.length === 0 ? (
                  <div className={styles.empty}>No items in this container</div>
                ) : (
                  <div className={styles.itemList}>
                    {items.map(item => (
                      <div key={item.id} className={styles.itemRow}>
                        <span className={styles.itemTitle}>
                          {item.title || 'Untitled'}
                        </span>
                        {item.source_url && (
                          <a
                            href={item.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.itemLink}
                            onClick={e => e.stopPropagation()}
                          >
                            source
                          </a>
                        )}
                        <select
                          className={styles.moveSelect}
                          value=""
                          onChange={e => handleMoveItem(item.id, e.target.value)}
                          onClick={e => e.stopPropagation()}
                        >
                          <option value="" disabled>Move to...</option>
                          {containers
                            .filter(c => c.id !== selectedId)
                            .map(c => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                      </div>
                    ))}
                  </div>
                )}

                <div className={styles.actions}>
                  <button
                    className={styles.actionBtn}
                    onClick={() => {
                      setMergeTarget('')
                      setShowMerge(true)
                    }}
                    disabled={containers.length < 2}
                  >
                    Merge into...
                  </button>
                  <button className={styles.deleteBtn} onClick={handleDelete}>
                    Delete
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.selectPrompt}>
                Select a container to view its items
              </div>
            )}
          </div>
        </div>
      )}

      {showMerge && selected && (
        <div className={styles.overlay} onClick={() => setShowMerge(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalTitle}>
              Merge &ldquo;{selected.name}&rdquo; into...
            </div>
            <label className={styles.modalLabel}>Target container</label>
            <select
              className={styles.modalSelect}
              value={mergeTarget}
              onChange={e => setMergeTarget(e.target.value)}
            >
              <option value="">Select a container</option>
              {containers
                .filter(c => c.id !== selectedId)
                .map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.item_count} items)
                  </option>
                ))}
            </select>
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setShowMerge(false)}>
                Cancel
              </button>
              <button
                className={styles.confirmBtn}
                disabled={!mergeTarget || merging}
                onClick={handleMerge}
              >
                {merging ? 'Merging...' : 'Merge'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
