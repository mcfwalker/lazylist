'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Sidebar } from './Sidebar'
import { MobileDrawer } from './MobileDrawer'
import styles from './AppShell.module.css'

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [isAdmin, setIsAdmin] = useState(false)

  // Don't render shell on login page
  const isLoginPage = pathname === '/login'

  useEffect(() => {
    if (isLoginPage) return
    async function fetchUser() {
      try {
        const res = await fetch('/api/users/me')
        if (res.ok) {
          const user = await res.json()
          setIsAdmin(user.isAdmin || false)
        }
      } catch (err) {
        console.error('Error fetching user:', err)
      }
    }
    fetchUser()
  }, [isLoginPage])

  const handleLogout = async () => {
    await fetch('/api/auth', { method: 'DELETE' })
    router.push('/login')
  }

  if (isLoginPage) {
    return <>{children}</>
  }

  return (
    <div className={styles.shell}>
      <Sidebar isAdmin={isAdmin} onLogout={handleLogout} />
      <MobileDrawer isAdmin={isAdmin} onLogout={handleLogout} />
      <main className={styles.content}>
        {children}
      </main>
    </div>
  )
}
