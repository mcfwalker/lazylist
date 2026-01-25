// TikTok processor using ElevenLabs for transcription

interface TikTokResult {
  transcript: string
  extractedUrls: string[]
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

    // tikwm returns video URL in data.play (no watermark) or data.wmplay (with watermark)
    const videoUrl = data?.data?.play || data?.data?.wmplay
    if (!videoUrl) {
      console.error('No video URL in tikwm response:', data)
      return null
    }

    return videoUrl
  } catch (error) {
    console.error('Error getting TikTok video URL:', error)
    return null
  }
}

export async function processTikTok(url: string): Promise<TikTokResult | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    console.error('ELEVENLABS_API_KEY not configured')
    return null
  }

  try {
    // Step 1: Get direct video URL from TikTok
    const videoUrl = await getTikTokVideoUrl(url)
    if (!videoUrl) {
      console.error('Could not get TikTok video URL')
      return null
    }

    // Step 2: Download video and send to ElevenLabs
    // ElevenLabs requires multipart form upload, so we need to fetch the video first
    const videoResponse = await fetch(videoUrl)
    if (!videoResponse.ok) {
      console.error('Failed to download video:', videoResponse.status)
      return null
    }

    const videoBlob = await videoResponse.blob()

    // Step 3: Send to ElevenLabs Speech-to-Text
    const formData = new FormData()
    formData.append('file', videoBlob, 'video.mp4')
    formData.append('model_id', 'scribe_v1')

    const transcribeResponse = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
      },
      body: formData,
    })

    if (!transcribeResponse.ok) {
      const error = await transcribeResponse.text()
      console.error(`ElevenLabs API error: ${transcribeResponse.status}`, error)
      return null
    }

    const data = await transcribeResponse.json()
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
