// Temporary script to reprocess a stuck item
// Usage: npx tsx scripts/reprocess.ts <item-id>

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

// Now import and run
import { processItem } from '../src/lib/processors/index.js'

const itemId = process.argv[2]
if (!itemId) {
  console.error('Usage: npx tsx scripts/reprocess.ts <item-id>')
  process.exit(1)
}

console.log(`Reprocessing item: ${itemId}`)

processItem(itemId)
  .then(() => {
    console.log('Processing complete')
    process.exit(0)
  })
  .catch((error) => {
    console.error('Processing failed:', error)
    process.exit(1)
  })
