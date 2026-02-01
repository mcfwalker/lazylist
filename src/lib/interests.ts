// Interest extraction and management for the interest graph

// OpenAI pricing for gpt-4o-mini
const OPENAI_INPUT_PRICE = 0.15 / 1_000_000
const OPENAI_OUTPUT_PRICE = 0.60 / 1_000_000

export interface Interest {
  type: 'topic' | 'tool' | 'domain' | 'person' | 'repo'
  value: string
}

export interface ExtractedInterests {
  interests: Interest[]
  cost: number
}

export interface ItemInput {
  title: string | null
  summary: string | null
  tags: string[] | null
  domain: string | null
  github_url?: string | null
}

/**
 * Extract interests from an item using AI
 */
export async function extractInterests(item: ItemInput): Promise<ExtractedInterests | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.error('OPENAI_API_KEY not configured')
    return null
  }

  const context = `
Title: ${item.title || 'Unknown'}
Summary: ${item.summary || 'None'}
Tags: ${item.tags?.join(', ') || 'None'}
Domain: ${item.domain || 'Unknown'}
GitHub: ${item.github_url || 'None'}
`.trim()

  const prompt = `Extract interests from this captured item. Return JSON with:
- topics: Technical topics (e.g., "react-three-fiber", "camera-controls", "embeddings")
- tools: Specific tools or products (e.g., "cursor", "vercel", "supabase")
- people: People or accounts mentioned (e.g., "@levelsio", "Guillermo Rauch")
- repos: GitHub repo identifiers (e.g., "pmndrs/drei", "vercel/next.js")

${context}

Return ONLY valid JSON, no markdown. Keep values lowercase and hyphenated where appropriate.
Example: {"topics": ["semantic-search"], "tools": ["pgvector"], "people": [], "repos": []}`

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 300,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error(`OpenAI API error: ${response.status}`, error)
      return null
    }

    const data = await response.json()
    const text = data.choices?.[0]?.message?.content

    if (!text) {
      return null
    }

    // Calculate cost
    const usage = data.usage || {}
    const cost = (usage.prompt_tokens || 0) * OPENAI_INPUT_PRICE +
                 (usage.completion_tokens || 0) * OPENAI_OUTPUT_PRICE

    // Parse response - handle markdown-wrapped JSON
    const jsonStr = text.replace(/```json\n?|\n?```/g, '').trim()
    const parsed = JSON.parse(jsonStr)

    // Convert to Interest array
    const interests: Interest[] = []

    for (const topic of parsed.topics || []) {
      interests.push({ type: 'topic', value: topic.toLowerCase() })
    }
    for (const tool of parsed.tools || []) {
      interests.push({ type: 'tool', value: tool.toLowerCase() })
    }
    for (const person of parsed.people || []) {
      interests.push({ type: 'person', value: person })
    }
    for (const repo of parsed.repos || []) {
      interests.push({ type: 'repo', value: repo.toLowerCase() })
    }

    // Also add the domain as an interest
    if (item.domain && item.domain !== 'other') {
      interests.push({ type: 'domain', value: item.domain })
    }

    return { interests, cost }
  } catch (error) {
    console.error('Interest extraction error:', error)
    return null
  }
}

/**
 * Calculate weight for an interest based on recency and frequency
 *
 * Formula: base_weight * recency_factor * frequency_factor
 * - recency_factor: decays over 30 days (1.0 → 0.5)
 * - frequency_factor: increases with occurrences (log scale)
 */
export function calculateWeight(occurrenceCount: number, lastSeen: Date): number {
  const now = Date.now()
  const daysSinceLastSeen = (now - lastSeen.getTime()) / (1000 * 60 * 60 * 24)

  // Recency factor: exponential decay over 30 days
  // At 0 days: 1.0, at 30 days: 0.5, at 60 days: 0.25
  const recencyFactor = Math.pow(0.5, daysSinceLastSeen / 30)

  // Frequency factor: logarithmic scaling
  // 1 occurrence: 1.0, 5 occurrences: ~1.6, 10 occurrences: ~2.3
  const frequencyFactor = 1 + Math.log10(occurrenceCount)

  // Combine factors, cap at 1.0
  const weight = Math.min(1.0, 0.5 * recencyFactor * frequencyFactor)

  return Math.round(weight * 100) / 100 // Round to 2 decimal places
}

/**
 * Decay all weights for a user (run periodically)
 */
export function getDecayQuery(userId: string, decayFactor: number = 0.95): string {
  return `
    UPDATE user_interests
    SET weight = GREATEST(0.1, weight * ${decayFactor})
    WHERE user_id = '${userId}'
    AND last_seen < NOW() - INTERVAL '7 days'
  `
}
