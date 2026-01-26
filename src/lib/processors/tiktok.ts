// TikTok processor using OpenAI for transcription

interface TikTokResult {
  transcript: string
  extractedUrls: string[]
}

interface GitHubRepoInfo {
  url: string
  name: string
  fullName: string
  description: string | null
  stars: number
  topics: string[]
}

// Get direct video URL from TikTok using tikwm API
async function getTikTokVideoUrl(tiktokUrl: string): Promise<string | null> {
  try {
    const response = await fetch('https://www.tikwm.com/api/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `url=${encodeURIComponent(tiktokUrl)}`,
    })

    if (!response.ok) {
      console.error('tikwm API error:', response.status)
      return null
    }

    const data = await response.json()
    const videoUrl = data?.data?.play || data?.data?.hdplay || data?.data?.wmplay

    if (!videoUrl) {
      console.error('No video URL in tikwm response:', JSON.stringify(data))
      return null
    }

    return videoUrl
  } catch (error) {
    console.error('Error getting TikTok video URL:', error)
    return null
  }
}

// Transcribe video using OpenAI's GPT-4o Mini Transcribe
async function transcribeWithOpenAI(
  videoUrl: string,
  apiKey: string
): Promise<string | null> {
  try {
    // Download video first (OpenAI requires file upload)
    const videoResponse = await fetch(videoUrl)
    if (!videoResponse.ok) {
      console.error('Failed to download video:', videoResponse.status)
      return null
    }

    const videoBlob = await videoResponse.blob()
    const formData = new FormData()
    formData.append('file', videoBlob, 'video.mp4')
    formData.append('model', 'gpt-4o-mini-transcribe')

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: formData,
    })

    if (!response.ok) {
      const error = await response.text()
      console.error(`OpenAI transcription error: ${response.status}`, error)
      return null
    }

    const data = await response.json()
    return data.text || null
  } catch (error) {
    console.error('Transcription error:', error)
    return null
  }
}

// Extract tool/project names that might be GitHub repos
async function extractCandidateNames(
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
- Include specific tool/project names (e.g., "repeater", "sharp", "ffmpeg")
- Do NOT include well-known commercial services (e.g., "ChatGPT", "Figma", "Notion")
- Do NOT include generic terms (e.g., "terminal", "algorithm", "app")
- Return ONLY a JSON array of names. If none found, return [].

Transcript:
${transcript.slice(0, 2000)}`
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
async function searchGitHubRepoWithMetadata(query: string): Promise<GitHubRepoInfo | null> {
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
async function validateRepoMatch(
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
${transcript.slice(0, 1500)}

GitHub Repository:
- Name: ${repo.fullName}
- Description: ${repo.description || 'No description'}
- Topics: ${repo.topics.join(', ') || 'None'}
- Stars: ${repo.stars}

Question: Is this GitHub repository "${repo.fullName}" the actual project/tool being discussed in the transcript as "${candidateName}"?

Consider:
- Does the repo description match what the transcript describes?
- Is the repo name similar to what's mentioned?
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

export async function processTikTok(url: string): Promise<TikTokResult | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.error('OPENAI_API_KEY not configured')
    return null
  }

  try {
    // Step 1: Get direct video URL from TikTok
    const videoUrl = await getTikTokVideoUrl(url)
    if (!videoUrl) {
      console.error('Could not get TikTok video URL')
      return null
    }

    // Step 2: Transcribe with OpenAI
    const transcript = await transcribeWithOpenAI(videoUrl, apiKey)
    if (!transcript) {
      console.error('Transcription failed')
      return null
    }

    // Step 3: Extract explicit GitHub URLs from transcript
    const githubUrlPattern = /github\.com\/[^\s"'<>,.]+/gi
    const urlMatches = transcript.match(githubUrlPattern) || []
    const explicitUrls = [...new Set(urlMatches.map((m: string) =>
      `https://${m.replace(/[.,;:!?)]+$/, '')}` // Clean trailing punctuation
    ))]

    // Step 4: If no explicit URLs, extract and validate candidate repos
    let extractedUrls = explicitUrls
    if (explicitUrls.length === 0) {
      const candidateNames = await extractCandidateNames(transcript, apiKey)
      const validatedUrls: string[] = []

      // Search and validate each candidate (limit to 3)
      for (const name of candidateNames.slice(0, 3)) {
        const repo = await searchGitHubRepoWithMetadata(name)
        if (repo) {
          // Validate that this repo matches the transcript context
          const isMatch = await validateRepoMatch(transcript, name, repo, apiKey)
          if (isMatch) {
            validatedUrls.push(repo.url)
          }
        }
      }

      extractedUrls = validatedUrls
    }

    return {
      transcript,
      extractedUrls,
    }
  } catch (error) {
    console.error('TikTok processing error:', error)
    return null
  }
}
