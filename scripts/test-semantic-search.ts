// Test semantic search against real data
// Usage: npx tsx scripts/test-semantic-search.ts "your search query"

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

// Now import and run
import { createClient } from '@supabase/supabase-js'
import { hybridSearch } from '../src/lib/search'

const query = process.argv[2]
if (!query) {
  console.error('Usage: npx tsx scripts/test-semantic-search.ts "your search query"')
  process.exit(1)
}

// Get a user ID to search against
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function testSearch() {
  // Get a user with items (prefer Matt who has the most)
  const { data: users } = await supabase
    .from('users')
    .select('id, display_name')
    .eq('display_name', 'Matt')
    .limit(1)

  if (!users || users.length === 0) {
    console.error('No users found')
    process.exit(1)
  }

  const userId = users[0].id
  console.log(`Searching as user: ${users[0].display_name || userId}`)
  console.log(`Query: "${query}"\n`)

  const results = await hybridSearch(query, {
    userId,
    limit: 5,
    threshold: 0.3, // Lower threshold for testing
  })

  if (results.length === 0) {
    console.log('No results found')
  } else {
    console.log(`Found ${results.length} results:\n`)
    for (const result of results) {
      console.log(`[${(result.similarity * 100).toFixed(1)}%] ${result.title}`)
      if (result.summary) {
        console.log(`  ${result.summary.slice(0, 100)}${result.summary.length > 100 ? '...' : ''}`)
      }
      console.log(`  ${result.source_url}`)
      console.log()
    }
  }
}

testSearch()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Search failed:', error)
    process.exit(1)
  })
