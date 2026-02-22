# MOL-12: Project Tags Webapp Display — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Display project relevance badges on item cards and add a project filter dropdown to the MollyMemo webapp.

**Architecture:** Two new API routes (projects list, project tags batch lookup) + one modified route (items with project filter). Frontend changes to FilterBar, ItemCard, and page.tsx to wire up the data. Lazy-batch pattern: fetch items first, then batch-fetch their project tags.

**Tech Stack:** Next.js API routes, Supabase (service client), CSS Modules, existing `get_item_project_tags` RPC.

---

## Task 1: API — GET /api/projects (user's project anchors)

The FilterBar needs a list of the user's projects for the dropdown. The existing `/api/project-anchors` uses service key auth (for Sidespace). We need a user-facing endpoint.

**Files:**
- Create: `src/app/api/projects/route.ts`

**Step 1: Create the route**

```typescript
// src/app/api/projects/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getCurrentUserId } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const userId = getCurrentUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('project_anchors')
    .select('id, name, stage')
    .eq('user_id', userId)
    .order('name', { ascending: true })

  if (error) {
    console.error('Projects list error:', error)
    return NextResponse.json({ error: 'Failed to list projects' }, { status: 500 })
  }

  return NextResponse.json({ projects: data || [] })
}
```

**Step 2: Verify it builds**

Run: `npm run build`
Expected: Build succeeds with no errors on this route.

**Step 3: Commit**

```bash
git add src/app/api/projects/route.ts
git commit -m "feat(api): add GET /api/projects for user-facing project list (MOL-12)"
```

---

## Task 2: API — GET /api/items/project-tags (batch lookup)

After items load, the frontend calls this with item IDs to get their project tags. Uses the deployed `get_item_project_tags` RPC.

**Files:**
- Create: `src/app/api/items/project-tags/route.ts`

**Step 1: Create the route**

```typescript
// src/app/api/items/project-tags/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getCurrentUserId } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const userId = getCurrentUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const ids = request.nextUrl.searchParams.get('ids')
  if (!ids) {
    return NextResponse.json({ tags: {} })
  }

  const itemIds = ids.split(',').filter(Boolean)
  if (itemIds.length === 0) {
    return NextResponse.json({ tags: {} })
  }

  const supabase = createServiceClient()

  const { data, error } = await supabase.rpc('get_item_project_tags', {
    p_item_ids: itemIds,
  })

  if (error) {
    console.error('Project tags error:', error)
    return NextResponse.json({ error: 'Failed to fetch project tags' }, { status: 500 })
  }

  // Group by item_id for easy frontend consumption
  // Result: { [item_id]: [{ project_name, project_stage }] }
  const tags: Record<string, { project_name: string; project_stage: string }[]> = {}
  for (const row of data || []) {
    if (!tags[row.item_id]) {
      tags[row.item_id] = []
    }
    tags[row.item_id].push({
      project_name: row.project_name,
      project_stage: row.project_stage,
    })
  }

  return NextResponse.json({ tags })
}
```

**Step 2: Verify it builds**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/app/api/items/project-tags/route.ts
git commit -m "feat(api): add GET /api/items/project-tags batch lookup (MOL-12)"
```

---

## Task 3: API — Add project filter to GET /api/items

When a project filter is selected, only return items that have a relevance tag for that project.

**Files:**
- Modify: `src/app/api/items/route.ts`

**Step 1: Add project filter logic**

Add a `project` query param. When set, pre-fetch item IDs from `item_project_relevance` (same pattern as the existing container filter).

In `src/app/api/items/route.ts`, after the container filter block (line ~56), add project filter:

```typescript
// After: const container = searchParams.get('container')
const project = searchParams.get('project')

// After the containerItemIds block, add:
let projectItemIds: string[] | null = null
if (project) {
  const { data: prData } = await supabase
    .from('item_project_relevance')
    .select('item_id')
    .eq('project_anchor_id', project)

  projectItemIds = (prData || []).map(pr => pr.item_id)
  if (projectItemIds.length === 0) {
    return NextResponse.json({ items: [], total: 0 })
  }
}

// After the containerItemIds `.in()` call, add:
if (projectItemIds) {
  query = query.in('id', projectItemIds)
}
```

**Step 2: Verify it builds**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/app/api/items/route.ts
git commit -m "feat(api): add project filter param to items endpoint (MOL-12)"
```

---

## Task 4: Frontend — Add project badges to ItemCard

Display project tags as small colored pills below the card meta row.

**Files:**
- Modify: `src/components/ItemCard.tsx`
- Modify: `src/app/page.module.css`

**Step 1: Add projectTags prop and badge rendering to ItemCard**

In `src/components/ItemCard.tsx`:

Add to the `ItemCardProps` interface:
```typescript
projectTags?: { project_name: string; project_stage: string }[]
```

Add to the destructured props:
```typescript
export function ItemCard({ item, isExpanded, onToggleExpand, onUpdate, onDelete, onRetry, projectTags }: ItemCardProps)
```

Add badge rendering after the `cardMeta` div (after line 109), before the summary:

```tsx
{projectTags && projectTags.length > 0 && (
  <div className={styles.projectBadges}>
    {projectTags.map((tag) => (
      <span
        key={tag.project_name}
        className={`${styles.projectBadge} ${styles[`stage_${tag.project_stage}`] || ''}`}
      >
        {tag.project_name}
      </span>
    ))}
  </div>
)}
```

**Step 2: Add CSS styles for project badges**

In `src/app/page.module.css`, add after the `.cardMeta` styles (after line 194):

```css
.projectBadges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}

.projectBadge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  background: var(--status-info-bg);
  color: var(--accent-foreground);
}

.projectBadge.stage_building {
  background: var(--status-success-bg);
  color: var(--success);
}

.projectBadge.stage_paused {
  background: var(--muted);
  color: var(--text-muted);
}

.projectBadge.stage_planning {
  background: var(--status-warning-bg);
  color: var(--warning-foreground);
}
```

**Step 3: Verify it builds**

Run: `npm run build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add src/components/ItemCard.tsx src/app/page.module.css
git commit -m "feat(ui): add project tag badges to item cards (MOL-12)"
```

---

## Task 5: Frontend — Add project filter to FilterBar

Add a project dropdown to the existing filter bar, matching the style of other dropdowns.

**Files:**
- Modify: `src/components/FilterBar.tsx`

**Step 1: Add project filter props and dropdown**

Add to `FilterBarProps`:
```typescript
project?: string
projects?: { id: string; name: string; stage: string | null }[]
onProjectChange?: (value: string) => void
```

Add to destructured props:
```typescript
project = 'all',
projects = [],
onProjectChange,
```

Add the dropdown in the JSX, after the containers dropdown and before the domains dropdown:

```tsx
{projects.length > 0 && onProjectChange && (
  <select value={project} onChange={(e) => onProjectChange(e.target.value)}>
    <option value="all">All Projects</option>
    {projects.map((p) => (
      <option key={p.id} value={p.id}>
        {p.name}
      </option>
    ))}
  </select>
)}
```

**Step 2: Verify it builds**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/components/FilterBar.tsx
git commit -m "feat(ui): add project filter dropdown to FilterBar (MOL-12)"
```

---

## Task 6: Frontend — Wire up project data in page.tsx

Connect everything: fetch projects list, add project filter state, fetch project tags after items load.

**Files:**
- Modify: `src/app/page.tsx`

**Step 1: Add state variables**

After the `containers` state (line 24):
```typescript
const [project, setProject] = useState('all')
const [projects, setProjects] = useState<{ id: string; name: string; stage: string | null }[]>([])
const [projectTags, setProjectTags] = useState<Record<string, { project_name: string; project_stage: string }[]>>({})
```

**Step 2: Add project to fetchItems filter params**

In `fetchItems` (line 38), add:
```typescript
if (project !== 'all') params.set('project', project)
```

Add `project` to the `useCallback` dependency array.

**Step 3: Fetch projects list on mount**

Add a useEffect after the containers fetch (after line 96):
```typescript
useEffect(() => {
  async function fetchProjects() {
    try {
      const res = await fetch('/api/projects')
      if (res.ok) {
        const data = await res.json()
        setProjects(data.projects || [])
      }
    } catch (err) {
      console.error('Error fetching projects:', err)
    }
  }
  fetchProjects()
}, [])
```

**Step 4: Fetch project tags after items load**

Add a useEffect that runs when `items` changes:
```typescript
useEffect(() => {
  async function fetchProjectTags() {
    if (items.length === 0) {
      setProjectTags({})
      return
    }
    const ids = items.map((item) => item.id).join(',')
    try {
      const res = await fetch(`/api/items/project-tags?ids=${ids}`)
      if (res.ok) {
        const data = await res.json()
        setProjectTags(data.tags || {})
      }
    } catch (err) {
      console.error('Error fetching project tags:', err)
    }
  }
  fetchProjectTags()
}, [items])
```

**Step 5: Pass project props to FilterBar**

Update the `<FilterBar>` JSX to include:
```tsx
project={project}
projects={projects}
onProjectChange={setProject}
```

**Step 6: Pass project tags to ItemCard**

Update the `<ItemCard>` JSX to include:
```tsx
projectTags={projectTags[item.id]}
```

**Step 7: Verify it builds**

Run: `npm run build`
Expected: Build succeeds.

**Step 8: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(ui): wire up project tags and filter in main page (MOL-12)"
```

---

## Task 7: Build verification + manual testing

**Step 1: Full build check**

Run: `npm run build`
Expected: Clean build, no TypeScript errors, no warnings.

**Step 2: Dev server smoke test**

Run: `npm run dev`
Expected: Page loads, items display, no console errors. If no items have project tags yet, badges section is simply absent (graceful empty state).

**Step 3: Final commit (if any fixups needed)**

Squash any fixup changes into a single commit.
