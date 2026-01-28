'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import styles from './page.module.css'

function LoginForm() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const searchParams = useSearchParams()

  useEffect(() => {
    const urlError = searchParams.get('error')
    if (urlError === 'auth_failed') {
      setError('Authentication failed. Please try again.')
    }
  }, [searchParams])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      if (res.ok) {
        setSent(true)
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to send magic link')
      }
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <motion.div
        className={styles.formSection}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <p className={styles.success}>Check your email for the magic link</p>
        <button
          type="button"
          className={styles.button}
          onClick={() => setSent(false)}
        >
          try again
        </button>
      </motion.div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className={styles.formSection}>
      <input
        type="email"
        placeholder="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={styles.input}
        autoFocus
        required
      />
      {error && <p className={styles.error}>{error}</p>}
      <button type="submit" className={styles.button} disabled={loading}>
        {loading ? '...' : 'send magic link'}
      </button>
    </form>
  )
}

export default function LoginPage() {
  return (
    <main className={styles.main}>
      {/* Ambient background elements */}
      <div className={styles.ambientOrb1} />
      <div className={styles.ambientOrb2} />

      <motion.div
        className={styles.glassCard}
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{
          duration: 0.6,
          ease: [0.22, 1, 0.36, 1]
        }}
      >
        {/* Inner glass highlight */}
        <div className={styles.glassHighlight} />

        {/* Photo section */}
        <motion.div
          className={styles.photoSection}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <img
            src="/login-photo.jpg"
            alt=""
            className={styles.photo}
          />
        </motion.div>

        {/* Form section */}
        <motion.div
          className={styles.formWrapper}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <Suspense fallback={<div className={styles.formSection} />}>
            <LoginForm />
          </Suspense>
        </motion.div>
      </motion.div>

      {/* Branding */}
      <motion.div
        className={styles.branding}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.5 }}
      >
        lazylist
      </motion.div>
    </main>
  )
}
