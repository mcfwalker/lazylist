'use client'

import { useEffect, useState } from 'react'
import styles from './page.module.css'

interface OperationCost {
  operation: string
  cost: number
  percentage: number
}

interface SourceCost {
  source: string
  count: number
  cost: number
  avgCost: number
}

interface UserCost {
  id: string
  email: string
  displayName: string | null
  itemCount: number
  digestCount: number
  itemCost: number
  digestCost: number
  totalCost: number
}

interface MonthData {
  month: string
  itemCount: number
  digestCount: number
  openaiCost: number
  grokCost: number
  repoExtractionCost: number
  anthropicCost: number
  ttsCost: number
  totalCost: number
}

interface DashboardData {
  currentMonth: {
    period: string
    itemCount: number
    digestCount: number
    totalCost: number
    avgCostPerItem: number
    avgCostPerDigest: number
  }
  allTime: {
    itemCount: number
    digestCount: number
    totalCost: number
  }
  byOperation: OperationCost[]
  bySource: SourceCost[]
  byUser: UserCost[]
  monthly: MonthData[]
}

function formatCurrency(amount: number): string {
  if (amount === 0) return '$0.00'
  if (amount < 0.001) return '<$0.001'
  if (amount < 0.01) return `$${amount.toFixed(4)}`
  return `$${amount.toFixed(2)}`
}

function formatMonth(monthKey: string): string {
  const [year, month] = monthKey.split('-')
  const date = new Date(parseInt(year), parseInt(month) - 1)
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function formatSourceName(source: string): string {
  const names: Record<string, string> = {
    tiktok: 'TikTok',
    github: 'GitHub',
    x: 'X/Twitter',
    article: 'Article',
    unknown: 'Unknown',
  }
  return names[source] || source
}

export default function AdminStatsPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch('/api/admin/stats/dashboard')
        if (!res.ok) {
          if (res.status === 403) {
            throw new Error('Access denied')
          }
          throw new Error('Failed to fetch stats')
        }
        const dashboardData = await res.json()
        setData(dashboardData)
      } catch (err) {
        console.error('Error fetching stats:', err)
        setError(err instanceof Error ? err.message : 'Failed to load cost data')
      } finally {
        setLoading(false)
      }
    }
    fetchStats()
  }, [])

  if (loading) {
    return (
      <main className={styles.main}>
        <div className={styles.loading}>Loading cost data...</div>
      </main>
    )
  }

  if (error || !data) {
    return (
      <main className={styles.main}>
        <div className={styles.empty}>{error || 'No data available'}</div>
      </main>
    )
  }

  const hasData = data.allTime.itemCount > 0 || data.allTime.digestCount > 0

  return (
    <main className={styles.main}>
      <h1 className={styles.title}>Admin Dashboard</h1>

      {!hasData ? (
        <div className={styles.empty}>No cost data yet. Process some items to see stats.</div>
      ) : (
        <>
          {/* Current Month Summary */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>This Month ({formatMonth(data.currentMonth.period)})</h2>
            <div className={styles.summaryCard}>
              <div className={styles.summaryGrid}>
                <div className={styles.summaryItem}>
                  <span className={styles.summaryValue}>{data.currentMonth.itemCount}</span>
                  <span className={styles.summaryLabel}>Items</span>
                </div>
                <div className={styles.summaryItem}>
                  <span className={styles.summaryValue}>{data.currentMonth.digestCount}</span>
                  <span className={styles.summaryLabel}>Digests</span>
                </div>
                <div className={styles.summaryItem}>
                  <span className={styles.summaryValue}>{formatCurrency(data.currentMonth.totalCost)}</span>
                  <span className={styles.summaryLabel}>Total Cost</span>
                </div>
              </div>
              <div className={styles.summaryMeta}>
                <span>{formatCurrency(data.currentMonth.avgCostPerItem)} avg/item</span>
                <span className={styles.separator}>•</span>
                <span>{formatCurrency(data.currentMonth.avgCostPerDigest)} avg/digest</span>
              </div>
            </div>
          </section>

          {/* All Time Summary */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>All Time</h2>
            <div className={styles.statsCard}>
              <div className={styles.statsMain}>
                <span>{data.allTime.itemCount} items</span>
                <span className={styles.separator}>•</span>
                <span>{data.allTime.digestCount} digests</span>
                <span className={styles.separator}>•</span>
                <span className={styles.total}>{formatCurrency(data.allTime.totalCost)} total</span>
              </div>
            </div>
          </section>

          {/* By User */}
          {data.byUser.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Cost by User</h2>
              <div className={styles.tableCard}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>User</th>
                      <th className={styles.alignRight}>Items</th>
                      <th className={styles.alignRight}>Digests</th>
                      <th className={styles.alignRight}>Item Cost</th>
                      <th className={styles.alignRight}>Digest Cost</th>
                      <th className={styles.alignRight}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byUser.map((user) => (
                      <tr key={user.id}>
                        <td>{user.displayName || user.email}</td>
                        <td className={styles.alignRight}>{user.itemCount}</td>
                        <td className={styles.alignRight}>{user.digestCount}</td>
                        <td className={styles.alignRight}>{formatCurrency(user.itemCost)}</td>
                        <td className={styles.alignRight}>{formatCurrency(user.digestCost)}</td>
                        <td className={styles.alignRight}>{formatCurrency(user.totalCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* By Operation */}
          {data.byOperation.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Cost by Operation</h2>
              <div className={styles.tableCard}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Operation</th>
                      <th className={styles.alignRight}>Cost</th>
                      <th className={styles.alignRight}>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byOperation.map((op) => (
                      <tr key={op.operation}>
                        <td>{op.operation}</td>
                        <td className={styles.alignRight}>{formatCurrency(op.cost)}</td>
                        <td className={styles.alignRight}>{op.percentage.toFixed(0)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* By Source */}
          {data.bySource.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Cost by Source</h2>
              <div className={styles.tableCard}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Source</th>
                      <th className={styles.alignRight}>Items</th>
                      <th className={styles.alignRight}>Total</th>
                      <th className={styles.alignRight}>Avg/Item</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.bySource.map((source) => (
                      <tr key={source.source}>
                        <td>{formatSourceName(source.source)}</td>
                        <td className={styles.alignRight}>{source.count}</td>
                        <td className={styles.alignRight}>{formatCurrency(source.cost)}</td>
                        <td className={styles.alignRight}>{formatCurrency(source.avgCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Monthly History */}
          {data.monthly.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Monthly History</h2>
              {data.monthly.map((month) => (
                <div key={month.month} className={styles.statsCard}>
                  <h3 className={styles.monthTitle}>{formatMonth(month.month)}</h3>
                  <div className={styles.statsMain}>
                    <span>{month.itemCount} items</span>
                    <span className={styles.separator}>•</span>
                    <span>{month.digestCount} digests</span>
                    <span className={styles.separator}>•</span>
                    <span className={styles.total}>{formatCurrency(month.totalCost)}</span>
                  </div>
                  <div className={styles.statsBreakdown}>
                    {month.openaiCost > 0 && <span>OpenAI: {formatCurrency(month.openaiCost)}</span>}
                    {month.grokCost > 0 && <span>Grok: {formatCurrency(month.grokCost)}</span>}
                    {month.repoExtractionCost > 0 && <span>Repo: {formatCurrency(month.repoExtractionCost)}</span>}
                    {month.anthropicCost > 0 && <span>Claude: {formatCurrency(month.anthropicCost)}</span>}
                    {month.ttsCost > 0 && <span>TTS: {formatCurrency(month.ttsCost)}</span>}
                  </div>
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </main>
  )
}
