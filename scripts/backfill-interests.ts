// Backfill interests from existing items
// Usage: npx tsx scripts/backfill-interests.ts

// Load env vars from .env.local
import { readFileSync } from 'fs'
import { resolve } from 'path'

const envPath = resolve(process.cwd(), '.env.local')
const envContent = readFileSync(envPath, 'utf-8')

for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue

  const eqIndex = trimmed.indexOf('=')
  if (eqIndex === -1) continue

  const key = trimmed.slice(0, eqIndex)
  let value = trimmed.slice(eqIndex + 1)

  if ((value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"'))) {
    value = value.slice(1, -1)
  }

  process.env[key] = value
}

// Now import dependencies
import { createClient } from '@supabase/supabase-js'
import { extractInterests, calculateWeight } from '../src/lib/interests'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function backfillInterests() {
  console.log('Fetching processed items...')

  const { data: items, error } = await supabase
    .from('items')
    .select('id, title, summary, tags, domain, github_url, user_id, captured_at')
    .eq('status', 'processed')
    .order('captured_at', { ascending: true }) // Process oldest first for correct weighting

  if (error) {
    console.error('Failed to fetch items:', error)
    process.exit(1)
  }

  console.log(`Processing ${items?.length || 0} items\n`)

  let totalCost = 0
  let totalInterests = 0
  let itemsProcessed = 0

  for (const item of items || []) {
    if (!item.title) continue

    const result = await extractInterests({
      title: item.title,
      summary: item.summary,
      tags: item.tags,
      domain: item.domain,
      github_url: item.github_url,
    })

    if (!result) continue

    totalCost += result.cost
    itemsProcessed++

    for (const interest of result.interests) {
      const { data: existing } = await supabase
        .from('user_interests')
        .select('id, occurrence_count')
        .eq('user_id', item.user_id)
        .eq('interest_type', interest.type)
        .eq('value', interest.value)
        .single()

      if (existing) {
        const newCount = existing.occurrence_count + 1
        const weight = calculateWeight(newCount, new Date(item.captured_at))

        await supabase
          .from('user_interests')
          .update({
            occurrence_count: newCount,
            weight,
            last_seen: item.captured_at,
          })
          .eq('id', existing.id)
      } else {
        await supabase
          .from('user_interests')
          .insert({
            user_id: item.user_id,
            interest_type: interest.type,
            value: interest.value,
            weight: calculateWeight(1, new Date(item.captured_at)),
            occurrence_count: 1,
            first_seen: item.captured_at,
            last_seen: item.captured_at,
          })
        totalInterests++
      }
    }

    const titlePreview = item.title.length > 40
      ? item.title.slice(0, 40) + '...'
      : item.title
    console.log(`✓ ${titlePreview} (${result.interests.length} interests)`)

    // Rate limit - gpt-4o-mini has higher limits but be conservative
    await new Promise(resolve => setTimeout(resolve, 200))
  }

  console.log(`
Done!
  Items processed: ${itemsProcessed}
  New interests created: ${totalInterests}
  Total cost: $${totalCost.toFixed(4)}
`)

  // Show interest summary
  const { data: summary } = await supabase
    .from('user_interests')
    .select('interest_type')

  if (summary) {
    const counts = summary.reduce((acc, i) => {
      acc[i.interest_type] = (acc[i.interest_type] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    console.log('Interest breakdown:')
    for (const [type, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${type}: ${count}`)
    }
  }
}

backfillInterests()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Backfill failed:', error)
    process.exit(1)
  })
