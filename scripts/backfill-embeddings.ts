// Backfill embeddings for existing items
// Usage: npx tsx scripts/backfill-embeddings.ts

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

  // Remove quotes if present
  if ((value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"'))) {
    value = value.slice(1, -1)
  }

  process.env[key] = value
}

// Now import dependencies
import { createClient } from '@supabase/supabase-js'
import { embedItem } from '../src/lib/embeddings'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function backfillEmbeddings() {
  console.log('Fetching items without embeddings...')

  const { data: items, error } = await supabase
    .from('items')
    .select('id, title, summary, tags')
    .is('embedding', null)
    .eq('status', 'processed')
    .order('captured_at', { ascending: false })

  if (error) {
    console.error('Failed to fetch items:', error)
    process.exit(1)
  }

  console.log(`Found ${items?.length || 0} items to embed`)

  let totalCost = 0
  let successCount = 0
  let skipCount = 0

  for (const item of items || []) {
    if (!item.title) {
      console.log(`Skipping ${item.id} - no title`)
      skipCount++
      continue
    }

    const result = await embedItem({
      title: item.title,
      summary: item.summary,
      tags: item.tags,
    })

    if (result) {
      const { error: updateError } = await supabase
        .from('items')
        .update({ embedding: result.embedding as unknown as string })
        .eq('id', item.id)

      if (updateError) {
        console.error(`Failed to update ${item.id}:`, updateError)
      } else {
        totalCost += result.cost
        successCount++
        const titlePreview = item.title.length > 50
          ? item.title.slice(0, 50) + '...'
          : item.title
        console.log(`✓ ${titlePreview} ($${result.cost.toFixed(6)})`)
      }
    } else {
      console.log(`✗ Failed to embed: ${item.title?.slice(0, 50)}`)
    }

    // Rate limit: 3000 RPM for embeddings API, but be conservative
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  console.log(`
Done!
  Embedded: ${successCount} items
  Skipped: ${skipCount} items (no title)
  Total cost: $${totalCost.toFixed(4)}
`)
}

backfillEmbeddings()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Backfill failed:', error)
    process.exit(1)
  })
