'use client'

import { useEffect, useState } from 'react'
import styles from './page.module.css'

interface UserSettings {
  digest_frequency: string  // 'daily' | 'weekly' | 'never'
  digest_day: number        // 0=Sun, 1=Mon, ..., 6=Sat
  digest_time: string
  timezone: string
}

const TIMEZONES = [
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Toronto',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Australia/Sydney',
]

function formatTimezone(tz: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'short',
    })
    const parts = formatter.formatToParts(new Date())
    const abbr = parts.find((p) => p.type === 'timeZoneName')?.value || ''
    return `${tz.replace(/_/g, ' ')} (${abbr})`
  } catch {
    return tz
  }
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function fetchSettings() {
      try {
        const res = await fetch('/api/users/settings')
        if (res.ok) {
          const data = await res.json()
          setSettings(data)
        }
      } catch (err) {
        console.error('Error fetching settings:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchSettings()
  }, [])

  const updateSetting = async (updates: Partial<UserSettings>) => {
    if (!settings) return

    setSaving(true)
    try {
      const res = await fetch('/api/users/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (res.ok) {
        setSettings({ ...settings, ...updates })
      }
    } catch (err) {
      console.error('Error updating settings:', err)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <main className={styles.main}>
        <div className={styles.loading}>Loading settings...</div>
      </main>
    )
  }

  if (!settings) {
    return (
      <main className={styles.main}>
        <div className={styles.error}>Failed to load settings</div>
      </main>
    )
  }

  return (
    <main className={styles.main}>
      <h1 className={styles.title}>Settings</h1>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Voice Digest</h2>

        <div className={styles.settingCard}>
          <div className={styles.settingRow}>
            <div className={styles.settingInfo}>
              <span className={styles.settingLabel}>Digest frequency</span>
              <span className={styles.settingDescription}>
                How often Molly sends your voice digest
              </span>
            </div>
            <select
              value={settings.digest_frequency}
              onChange={(e) => updateSetting({ digest_frequency: e.target.value })}
              disabled={saving}
              className={styles.select}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="never">Never</option>
            </select>
          </div>
        </div>

        {settings.digest_frequency === 'weekly' && (
          <div className={styles.settingCard}>
            <div className={styles.settingRow}>
              <div className={styles.settingInfo}>
                <span className={styles.settingLabel}>Digest day</span>
                <span className={styles.settingDescription}>
                  Which day to receive your weekly digest
                </span>
              </div>
              <select
                value={settings.digest_day}
                onChange={(e) => updateSetting({ digest_day: Number(e.target.value) })}
                disabled={saving}
                className={styles.select}
              >
                <option value={0}>Sunday</option>
                <option value={1}>Monday</option>
                <option value={2}>Tuesday</option>
                <option value={3}>Wednesday</option>
                <option value={4}>Thursday</option>
                <option value={5}>Friday</option>
                <option value={6}>Saturday</option>
              </select>
            </div>
          </div>
        )}

        <div className={styles.settingCard}>
          <div className={styles.settingRow}>
            <div className={styles.settingInfo}>
              <span className={styles.settingLabel}>Delivery time</span>
              <span className={styles.settingDescription}>
                When to send your digest
              </span>
            </div>
            <input
              type="time"
              value={settings.digest_time}
              onChange={(e) => updateSetting({ digest_time: e.target.value })}
              disabled={saving || settings.digest_frequency === 'never'}
              className={styles.timeInput}
            />
          </div>
        </div>

        <div className={styles.settingCard}>
          <div className={styles.settingRow}>
            <div className={styles.settingInfo}>
              <span className={styles.settingLabel}>Timezone</span>
              <span className={styles.settingDescription}>
                Your local timezone for digest scheduling
              </span>
            </div>
            <select
              value={settings.timezone}
              onChange={(e) => updateSetting({ timezone: e.target.value })}
              disabled={saving}
              className={styles.select}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {formatTimezone(tz)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {saving && <div className={styles.saving}>Saving...</div>}
    </main>
  )
}
