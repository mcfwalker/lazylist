import styles from '@/app/page.module.css'

const DOMAINS = ['all', 'vibe-coding', 'ai-filmmaking', 'other']
const CONTENT_TYPES = ['all', 'repo', 'technique', 'tool', 'resource', 'person']
const STATUSES = ['all', 'processed', 'pending', 'failed']

interface ContainerOption {
  id: string
  name: string
  item_count: number
}

interface FilterBarProps {
  domain: string
  contentType: string
  status: string
  total: number
  container?: string
  containers?: ContainerOption[]
  onDomainChange: (value: string) => void
  onContentTypeChange: (value: string) => void
  onStatusChange: (value: string) => void
  onContainerChange?: (value: string) => void
}

export function FilterBar({
  domain,
  contentType,
  status,
  total,
  container = 'all',
  containers = [],
  onDomainChange,
  onContentTypeChange,
  onStatusChange,
  onContainerChange,
}: FilterBarProps) {
  return (
    <div className={styles.filters}>
      {containers.length > 0 && onContainerChange && (
        <select value={container} onChange={(e) => onContainerChange(e.target.value)}>
          <option value="all">All Containers</option>
          {containers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.item_count})
            </option>
          ))}
        </select>
      )}
      <select value={domain} onChange={(e) => onDomainChange(e.target.value)}>
        {DOMAINS.map((d) => (
          <option key={d} value={d}>
            {d === 'all' ? 'All Domains' : d}
          </option>
        ))}
      </select>
      <select value={contentType} onChange={(e) => onContentTypeChange(e.target.value)}>
        {CONTENT_TYPES.map((t) => (
          <option key={t} value={t}>
            {t === 'all' ? 'All Types' : t}
          </option>
        ))}
      </select>
      <select value={status} onChange={(e) => onStatusChange(e.target.value)}>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s === 'all' ? 'All Status' : s}
          </option>
        ))}
      </select>
      <span className={styles.count}>{total} items</span>
    </div>
  )
}

export { DOMAINS }
