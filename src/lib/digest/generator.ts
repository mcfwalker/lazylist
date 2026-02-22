// Script generator for daily voice digests
// Uses Claude to generate personalized, conversational scripts

import Anthropic from '@anthropic-ai/sdk'
import { MOLLY_SOUL } from './molly'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// Claude Sonnet pricing per million tokens
const CLAUDE_SONNET_INPUT_COST = 3 / 1_000_000
const CLAUDE_SONNET_OUTPUT_COST = 15 / 1_000_000

function calculateAnthropicCost(inputTokens: number, outputTokens: number): number {
  return inputTokens * CLAUDE_SONNET_INPUT_COST + outputTokens * CLAUDE_SONNET_OUTPUT_COST
}

export interface DigestItem {
  id: string
  title: string
  summary: string
  domain: string | null
  contentType: string | null
  tags: string[] | null
  sourceUrl: string
}

export interface MemoItem {
  id: string
  title: string
  summary: string
  relevanceReason: string
  sourcePlatform: string
  sourceUrl: string
}

export interface TrendItem {
  id: string
  trendType: string
  title: string
  description: string
  strength: number
}

export interface ContainerActivity {
  containerId: string
  containerName: string
  itemCountInWindow: number
  totalItemCount: number
  isNew: boolean // created within the digest window
}

export interface CrossReference {
  itemId: string
  itemTitle: string
  sourceUrl: string
  containerNames: string[]
}

export interface ProjectMatch {
  projectName: string
  projectDescription: string | null
  matchedItems: { itemId: string; itemTitle: string; matchedTags: string[] }[]
}

export interface DigestInput {
  user: {
    id: string
    displayName: string | null
    timezone: string
    mollyContext: string | null // Molly's evolving memory of this user
  }
  frequency: 'daily' | 'weekly'
  items: DigestItem[]
  memos: MemoItem[] // Molly's proactive discoveries
  trends: TrendItem[]
  containerActivity: ContainerActivity[]
  crossReferences: CrossReference[]
  projectMatches: ProjectMatch[]
  previousDigest: {
    id: string
    scriptText: string
    generatedAt: Date
    itemCount: number
  } | null
}

export async function generateScript(input: DigestInput): Promise<{ script: string; cost: number }> {
  const { user, frequency, items, memos, trends, containerActivity, crossReferences, projectMatches, previousDigest } = input
  const userName = user.displayName || 'there'

  // Build previous digest context
  let previousContext = 'No previous digest — this is their first one. Start fresh without referencing past digests.'
  if (previousDigest) {
    const daysAgo = Math.floor(
      (Date.now() - previousDigest.generatedAt.getTime()) / (1000 * 60 * 60 * 24)
    )
    const timeRef = daysAgo === 1 ? 'yesterday' : `${daysAgo} days ago`
    previousContext = `Previous digest (${timeRef}, ${previousDigest.itemCount} items):
---
${previousDigest.scriptText.slice(0, 1500)}${previousDigest.scriptText.length > 1500 ? '...' : ''}
---
Reference this naturally if there's a thematic connection. Don't force it.`
  }

  // Build items JSON for the prompt
  const itemsJson = JSON.stringify(
    items.map((item) => ({
      title: item.title,
      summary: item.summary,
      domain: item.domain,
      type: item.contentType,
      tags: item.tags,
    })),
    null,
    2
  )

  const systemPrompt = `You are Molly, a personal knowledge curator who delivers ${frequency} audio digests.

${MOLLY_SOUL}

## Task
Generate a spoken script (5-7 minutes at 140 wpm = 700-1000 words).
${frequency === 'weekly' ? 'This is a WEEKLY digest covering the past 7 days. Summarize the week\'s shape, spotlight 5-8 standout items. Don\'t try to cover everything.' : 'This is a DAILY digest covering the past 24 hours.'}
Write for the ear, not the eye. No markdown. Spell out abbreviations. Don't read URLs.

## Script Structure — INSIGHT-FIRST
Lead with what's INTERESTING about the user's behavior, not what they saved.

1. Greeting (use "${userName}")
2. Continuity hook (if previous digest exists)
3. INSIGHTS LAYER (lead with this):
   - Patterns and trends you've noticed
   - Items that bridge multiple interest areas (cross-references)
   - Connections to their active projects
   - Which knowledge buckets are growing
4. ITEMS LAYER (supporting evidence):
   - Reference specific items as evidence for the patterns above
   - ${frequency === 'weekly' ? 'Pick 5-8 standout items. Skip the rest.' : 'Cover most items but through the lens of patterns, not as a list.'}
   - Don't just enumerate items — weave them into the narrative
5. Forward-looking close:
   - Brief observation about where things seem headed
   - Informed by project context and trend trajectories

## What You Know About ${userName}
${user.mollyContext || 'New user — no context yet.'}

## Previous Digest Context
${previousContext}

## Insights Data

### Trends (${trends.length} detected)
${trends.length > 0 ? JSON.stringify(trends.map(t => ({
  type: t.trendType,
  title: t.title,
  description: t.description,
})), null, 2) : 'No trends detected right now.'}

### Cross-References (${crossReferences.length} items in multiple containers)
${crossReferences.length > 0 ? JSON.stringify(crossReferences.map(cr => ({
  title: cr.itemTitle,
  containers: cr.containerNames,
})), null, 2) + '\nIf an item bridges two interest areas, that\'s worth mentioning.' : 'No cross-references this period.'}

### Project Connections
${projectMatches.length > 0 ? JSON.stringify(projectMatches.map(pm => ({
  project: pm.projectName,
  description: pm.projectDescription,
  matchedItems: pm.matchedItems.map(mi => ({ title: mi.itemTitle, tags: mi.matchedTags })),
})), null, 2) + '\nIf items connect to active projects, say so. The user wants to know their saves are building toward something.' : 'No project matches this period.'}

### Container Activity
${containerActivity.length > 0 ? JSON.stringify(containerActivity.map(ca => ({
  container: ca.containerName,
  newItemsInWindow: ca.itemCountInWindow,
  totalItems: ca.totalItemCount,
  isNewContainer: ca.isNew,
})), null, 2) + '\nMention if a container is growing fast or if a new one appeared.' : 'No container activity this period.'}

## Items (${items.length} total, ${frequency} window)
${itemsJson}

## Molly's Discoveries (${memos.length} items)
${memos.length > 0 ? JSON.stringify(memos.map(m => ({
  title: m.title,
  summary: m.summary,
  reason: m.relevanceReason,
  platform: m.sourcePlatform,
})), null, 2) + '\nWeave these in naturally after the main content.' : 'No discoveries this time.'}

Output ONLY the script text.`

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [
      {
        role: 'user',
        content: systemPrompt,
      },
    ],
  })

  // Calculate cost from usage
  const cost = calculateAnthropicCost(
    message.usage.input_tokens,
    message.usage.output_tokens
  )

  // Extract text from response
  const textBlock = message.content.find((block) => block.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from Claude')
  }

  return { script: textBlock.text, cost }
}

// Estimate audio duration based on word count
// Average speaking rate: ~140 words per minute
export function estimateDuration(script: string): number {
  const wordCount = script.split(/\s+/).length
  const minutes = wordCount / 140
  return Math.ceil(minutes * 60) // Return seconds
}

// Update Molly's context/memory about a user after a digest
export async function updateUserContext(
  currentContext: string | null,
  items: DigestItem[],
  userName: string
): Promise<{ context: string; cost: number }> {
  const itemsSummary = items
    .map((i) => `- ${i.title} (${i.domain || 'general'}, ${i.contentType || 'unknown'})`)
    .join('\n')

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    messages: [
      {
        role: 'user',
        content: `You are maintaining a brief context profile for a user named ${userName}. This helps personalize their daily knowledge digests.

Current context:
${currentContext || '(none yet)'}

Items they just saved:
${itemsSummary}

Update the context profile. Keep it to 2-4 sentences max. Note:
- Recurring themes or interests
- Preferred content types (repos, tools, tutorials, etc.)
- Any patterns you notice

Output ONLY the updated context, nothing else.`,
      },
    ],
  })

  const cost = calculateAnthropicCost(
    message.usage.input_tokens,
    message.usage.output_tokens
  )

  const textBlock = message.content.find((block) => block.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    return { context: currentContext || '', cost }
  }

  return { context: textBlock.text, cost }
}
