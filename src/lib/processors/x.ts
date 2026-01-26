// X/Twitter processor using oembed API (no auth required)

interface XMetadata {
  text: string
  authorName: string
  authorUrl: string
}

export async function processX(url: string): Promise<XMetadata | null> {
  try {
    // Normalize twitter.com to x.com
    const normalizedUrl = url.replace('twitter.com', 'x.com')

    const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(normalizedUrl)}&omit_script=true`

    const response = await fetch(oembedUrl)

    if (!response.ok) {
      console.error(`X oembed error: ${response.status}`)
      return null
    }

    const data = await response.json()

    // Extract text from HTML (oembed returns HTML blockquote)
    // The HTML looks like: <blockquote>...<p>TWEET TEXT</p>... &mdash; Author (@handle)</blockquote>
    const htmlText = data.html as string

    // Extract the tweet text from the paragraph
    const textMatch = htmlText.match(/<p[^>]*>([^<]+)<\/p>/)
    const text = textMatch
      ? textMatch[1]
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
      : ''

    return {
      text,
      authorName: data.author_name,
      authorUrl: data.author_url,
    }
  } catch (error) {
    console.error('X processing error:', error)
    return null
  }
}
