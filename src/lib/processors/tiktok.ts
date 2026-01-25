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

// Try transcribing via URL first, fall back to file upload
async function transcribeWithElevenLabs(
  videoUrl: string,
  apiKey: string
): Promise<string | null> {
  // First try: use cloud_storage_url (faster, no download needed)
  try {
    const formData = new FormData()
    formData.append('model_id', 'scribe_v1')
    formData.append('cloud_storage_url', videoUrl)

    const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: { 'xi-api-key': apiKey },
      body: formData,
    })

    if (response.ok) {
      const data = await response.json()
      if (data.text) {
        return data.text
      }
    } else {
      const error = await response.text()
      console.log('cloud_storage_url failed, trying file upload:', error)
    }
  } catch (err) {
    console.log('cloud_storage_url attempt failed:', err)
  }

  // Second try: download and upload file
  try {
    const videoResponse = await fetch(videoUrl)
    if (!videoResponse.ok) {
      console.error('Failed to download video:', videoResponse.status)
      return null
    }

    const videoBlob = await videoResponse.blob()
    const formData = new FormData()
    formData.append('file', videoBlob, 'video.mp4')
    formData.append('model_id', 'scribe_v1')

    const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: { 'xi-api-key': apiKey },
      body: formData,
    })

    if (!response.ok) {
      const error = await response.text()
      console.error(`ElevenLabs file upload error: ${response.status}`, error)
      return null
    }

    const data = await response.json()
    return data.text || null
  } catch (error) {
    console.error('File upload transcription error:', error)
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
    console.log('Getting TikTok video URL...')
    const videoUrl = await getTikTokVideoUrl(url)
    if (!videoUrl) {
      console.error('Could not get TikTok video URL')
      return null
    }
    console.log('Got video URL:', videoUrl.substring(0, 100) + '...')

    // Step 2: Transcribe with ElevenLabs
    console.log('Transcribing with ElevenLabs...')
    const transcript = await transcribeWithElevenLabs(videoUrl, apiKey)
    if (!transcript) {
      console.error('Transcription failed')
      return null
    }
    console.log('Got transcript:', transcript.substring(0, 100) + '...')

    // Step 3: Extract GitHub URLs from transcript
    const githubUrlPattern = /github\.com\/[^\s"'<>,.]+/gi
    const matches = transcript.match(githubUrlPattern) || []
    const extractedUrls = [...new Set(matches.map((m: string) =>
      `https://${m.replace(/[.,;:!?)]+$/, '')}` // Clean trailing punctuation
    ))]

    return {
      transcript,
      extractedUrls,
    }
  } catch (error) {
    console.error('TikTok processing error:', error)
    return null
  }
}
