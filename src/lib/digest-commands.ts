// Parse natural language digest commands using GPT-4o-mini

export interface DigestCommand {
  action: 'set_time' | 'enable' | 'disable' | 'query' | 'send_now' | 'unknown'
  time?: string // HH:MM format for set_time
}

export async function parseDigestCommand(message: string): Promise<DigestCommand> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return { action: 'unknown' }
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: `Parse this message as a digest settings command. The user is configuring when they receive their daily voice digest.

Message: "${message}"

Determine the intent:
- set_time: User wants to change digest time (e.g., "send my digest at 8am", "make it 9:30", "9pm", "8am please")
- enable: User wants to turn on digest (e.g., "turn on digest", "enable it", "resume", "start sending")
- disable: User wants to turn off digest (e.g., "turn off digest", "pause it", "stop", "disable")
- query: User is asking about current settings (e.g., "what time is my digest?", "when do I get it?")
- send_now: User wants a test digest now (e.g., "send one now", "test it", "send me a digest")
- unknown: Not a digest command

If set_time, extract the time in 24-hour HH:MM format.

Return JSON only: {"action": "...", "time": "HH:MM"} or {"action": "..."}`,
          },
        ],
        temperature: 0,
        max_tokens: 50,
      }),
    })

    if (!response.ok) {
      return { action: 'unknown' }
    }

    const data = await response.json()
    const text = data.choices?.[0]?.message?.content || '{}'
    const jsonStr = text.replace(/```json\n?|\n?```/g, '').trim()

    return JSON.parse(jsonStr)
  } catch {
    return { action: 'unknown' }
  }
}

export function formatTimeForUser(time: string, timezone: string): string {
  // Convert HH:MM to friendly format like "8:00 AM PT"
  const [hours, minutes] = time.split(':').map(Number)
  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHour = hours % 12 || 12

  // Get short timezone abbreviation
  try {
    const tzAbbr =
      new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        timeZoneName: 'short',
      })
        .formatToParts(new Date())
        .find((p) => p.type === 'timeZoneName')?.value || timezone
    return `${displayHour}:${minutes.toString().padStart(2, '0')} ${period} ${tzAbbr}`
  } catch {
    return `${displayHour}:${minutes.toString().padStart(2, '0')} ${period}`
  }
}
