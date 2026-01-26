// Shared smart repo extraction logic
// Extracts candidate names from transcript, searches GitHub, validates matches

export interface GitHubRepoInfo {
  url: string
  name: string
  fullName: string
  description: string | null
  stars: number
  topics: string[]
}

// Extract tool/project names that might be GitHub repos
export async function extractCandidateNames(
  transcript: string,
  apiKey: string
): Promise<string[]> {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'user',
          content: `Extract names of software tools, libraries, CLI tools, or projects mentioned in this transcript that could potentially be open source GitHub repositories.

Rules:
- Include specific tool/project names (e.g., "repeater", "sharp", "ffmpeg", "clawdbot", "claudebot")
- Include names that sound like project names even with slight misspellings
- Do NOT include well-known commercial services (e.g., "ChatGPT", "Figma", "Notion", "AWS", "Discord", "Telegram", "WhatsApp")
- Do NOT include generic terms (e.g., "terminal", "algorithm", "app", "bot")
- Return ONLY a JSON array of names. If none found, return [].

Transcript:
${transcript.slice(0, 3000)}`
        }],
        temperature: 0,
        max_tokens: 200,
      }),
    })

    if (!response.ok) {
      console.error('AI extraction error:', response.status)
      return []
    }

    const data = await response.json()
    const text = data.choices?.[0]?.message?.content?.trim() || '[]'
    const jsonStr = text.replace(/```json\n?|\n?```/g, '').trim()
    return JSON.parse(jsonStr)
  } catch (error) {
    console.error('Candidate name extraction error:', error)
    return []
  }
}

// Search GitHub for a repo and return full metadata
export async function searchGitHubRepo(query: string): Promise<GitHubRepoInfo | null> {
  try {
    const token = process.env.GITHUB_TOKEN
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'LazyList',
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    const response = await fetch(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=1`,
      { headers }
    )

    if (!response.ok) {
      console.error('GitHub search error:', response.status)
      return null
    }

    const data = await response.json()
    if (data.items && data.items.length > 0) {
      const repo = data.items[0]
      return {
        url: repo.html_url,
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description,
        stars: repo.stargazers_count,
        topics: repo.topics || [],
      }
    }
    return null
  } catch (error) {
    console.error('GitHub search error:', error)
    return null
  }
}

// Validate if a GitHub repo matches what's described in the transcript
export async function validateRepoMatch(
  transcript: string,
  candidateName: string,
  repo: GitHubRepoInfo,
  apiKey: string
): Promise<boolean> {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'user',
          content: `Determine if this GitHub repository is the one being discussed in the transcript.

Transcript excerpt (discussing "${candidateName}"):
${transcript.slice(0, 2000)}

GitHub Repository:
- Name: ${repo.fullName}
- Description: ${repo.description || 'No description'}
- Topics: ${repo.topics.join(', ') || 'None'}
- Stars: ${repo.stars}

Question: Is this GitHub repository "${repo.fullName}" the actual project/tool being discussed in the transcript as "${candidateName}"?

Consider:
- Does the repo description match what the transcript describes?
- Is the repo name similar to what's mentioned (account for transcription errors)?
- Does the functionality align?

Respond with ONLY "yes" or "no".`
        }],
        temperature: 0,
        max_tokens: 10,
      }),
    })

    if (!response.ok) {
      console.error('Validation error:', response.status)
      return false
    }

    const data = await response.json()
    const answer = data.choices?.[0]?.message?.content?.trim().toLowerCase() || ''
    return answer === 'yes'
  } catch (error) {
    console.error('Repo validation error:', error)
    return false
  }
}

// Main function: extract repos from transcript with validation
export async function extractReposFromTranscript(
  transcript: string,
  existingRepoUrls: string[] = []
): Promise<GitHubRepoInfo[]> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.error('OPENAI_API_KEY not configured for repo extraction')
    return []
  }

  // Extract candidate names
  const candidateNames = await extractCandidateNames(transcript, apiKey)
  console.log('Repo extraction candidates:', candidateNames)

  if (candidateNames.length === 0) {
    return []
  }

  const validatedRepos: GitHubRepoInfo[] = []

  // Search and validate each candidate (limit to 5)
  for (const name of candidateNames.slice(0, 5)) {
    const repo = await searchGitHubRepo(name)
    if (repo) {
      // Skip if we already have this repo
      if (existingRepoUrls.some(url => url.includes(repo.fullName))) {
        console.log(`Skipping ${repo.fullName} - already extracted`)
        continue
      }

      // Validate that this repo matches the transcript context
      const isMatch = await validateRepoMatch(transcript, name, repo, apiKey)
      console.log(`Repo validation for ${name} -> ${repo.fullName}: ${isMatch}`)

      if (isMatch) {
        validatedRepos.push(repo)
      }
    }
  }

  return validatedRepos
}
