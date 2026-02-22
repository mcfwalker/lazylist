'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import styles from './page.module.css'

function LoginForm() {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const searchParams = useSearchParams()

  useEffect(() => {
    const urlError = searchParams.get('error')
    if (urlError === 'auth_failed') {
      setError('Authentication failed. Please try again.')
    } else if (urlError === 'not_allowed') {
      setError('Your Google account is not authorized.')
    }
  }, [searchParams])

  const handleGoogleLogin = async () => {
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth', { method: 'POST' })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        setError(data.error || 'Failed to initiate login')
      }
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.formSection}>
      <img src="/molly_sig_1.svg" alt="Molly" className={styles.logo} />
      {error && <p className={styles.error}>{error}</p>}
      <button
        type="button"
        className={`${styles.button} ${styles.googleButton}`}
        onClick={handleGoogleLogin}
        disabled={loading}
      >
        <svg width="18" height="18" viewBox="0 0 24 24">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        {loading ? '...' : 'sign in with Google'}
      </button>
    </div>
  )
}

export default function LoginPage() {
  return (
    <main className={styles.main}>
      <motion.div
        className={styles.glassCard}
        initial={{ opacity: 0, scale: 0.98, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{
          duration: 0.4,
          ease: [0.22, 1, 0.36, 1]
        }}
      >
        <motion.div
          className={styles.photoSection}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.15 }}
        >
          <img
            src="/login-photo.jpg"
            alt=""
            className={styles.photo}
          />
        </motion.div>

        <motion.div
          className={styles.formWrapper}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <Suspense fallback={<div className={styles.formSection} />}>
            <LoginForm />
          </Suspense>
        </motion.div>
      </motion.div>

      <motion.a
        href="https://mcfw.io"
        target="_blank"
        rel="noopener noreferrer"
        className={styles.branding}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.35 }}
      >
        <img src="/mcfw_ico.svg" alt="mcfw.io" className={styles.brandingIcon} />
      </motion.a>
    </main>
  )
}
