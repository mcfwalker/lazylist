// TikTok processor using ElevenLabs for transcription

interface TikTokResult {
  transcript: string
  extractedUrls: string[]
}

export async function processTikTok(url: string): Promise<TikTokResult | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    console.error('ELEVENLABS_API_KEY not configured')
    return null
  }

  try {
    // ElevenLabs Speech-to-Text API
    const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: url,
        model_id: 'scribe_v1', // Their transcription model
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error(`ElevenLabs API error: ${response.status}`, error)
      return null
    }

    const data = await response.json()
    const transcript = data.text || ''

    // Extract GitHub URLs from transcript
    const githubUrlPattern = /github\.com\/[^\s"'<>]+/gi
    const matches = transcript.match(githubUrlPattern) || []
    const extractedUrls = matches.map((m: string) => `https://${m}`)

    return {
      transcript,
      extractedUrls,
    }
  } catch (error) {
    console.error('TikTok processing error:', error)
    return null
  }
}
