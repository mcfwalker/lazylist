// AI classifier using Gemini

interface ClassificationResult {
  title: string
  summary: string
  domain: string
  content_type: string
  tags: string[]
}

export async function classify(content: {
  sourceType: string
  transcript?: string
  githubMetadata?: {
    name: string
    description: string | null
    topics: string[]
  }
  pageContent?: string
}): Promise<ClassificationResult | null> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('GEMINI_API_KEY not configured')
    return null
  }

  // Build context for the AI
  let context = `Source type: ${content.sourceType}\n\n`

  if (content.transcript) {
    context += `Transcript:\n${content.transcript.slice(0, 3000)}\n\n`
  }

  if (content.githubMetadata) {
    context += `GitHub repo: ${content.githubMetadata.name}\n`
    context += `Description: ${content.githubMetadata.description || 'None'}\n`
    context += `Topics: ${content.githubMetadata.topics.join(', ') || 'None'}\n\n`
  }

  if (content.pageContent) {
    context += `Page content:\n${content.pageContent.slice(0, 3000)}\n\n`
  }

  const prompt = `Analyze this content and classify it.

${context}

Return a JSON object with:
- title: A concise title (max 60 chars). For repos, use the repo name. For techniques, describe the technique.
- summary: One sentence summary (max 150 chars) of what this is and why it's useful.
- domain: One of "vibe-coding", "ai-filmmaking", or "other". Pick "vibe-coding" for anything related to software development, AI coding tools, developer productivity. Pick "ai-filmmaking" for anything related to video generation, AI video, filmmaking with AI.
- content_type: One of "repo", "technique", "tool", "resource", "person".
  - repo = GitHub repository
  - technique = A method, pattern, or approach
  - tool = A product or service (not open source)
  - resource = An article, tutorial, or reference
  - person = A creator or expert to follow
- tags: Array of 3-5 relevant tags (lowercase, hyphenated)

Return ONLY valid JSON, no markdown or explanation.`

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 500,
          },
        }),
      }
    )

    if (!response.ok) {
      console.error(`Gemini API error: ${response.status}`)
      return null
    }

    const data = await response.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text

    if (!text) {
      console.error('No response from Gemini')
      return null
    }

    // Parse JSON (handle potential markdown code blocks)
    const jsonStr = text.replace(/```json\n?|\n?```/g, '').trim()
    const result = JSON.parse(jsonStr)

    return {
      title: result.title || 'Untitled',
      summary: result.summary || '',
      domain: result.domain || 'other',
      content_type: result.content_type || 'resource',
      tags: result.tags || [],
    }
  } catch (error) {
    console.error('Classification error:', error)
    return null
  }
}
