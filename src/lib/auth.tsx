import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type StaffRole =
  | 'super_admin'
  | 'store_manager'
  | 'warehouse_manager'
  | 'employee'
  | 'support_agent'

interface Profile {
  id: string
  full_name: string | null
  role: string
}

interface AuthState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  error: string | null
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const STAFF_ROLES: StaffRole[] = [
  'super_admin',
  'store_manager',
  'warehouse_manager',
  'employee',
  'support_agent',
]

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function loadProfile(userId: string) {
    const { data, error: profileError } = await supabase
      .from('user_profiles')
      .select('id, full_name, role')
      .eq('id', userId)
      .single()

    if (profileError || !data) {
      setError('Could not load your staff profile.')
      setProfile(null)
      return
    }

    if (!STAFF_ROLES.includes(data.role as StaffRole)) {
      setError('This account does not have staff access to the admin panel.')
      await supabase.auth.signOut()
      setProfile(null)
      return
    }

    setProfile(data)
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      if (data.session) await loadProfile(data.session.user.id)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession)
      if (newSession) {
        await loadProfile(newSession.user.id)
      } else {
        setProfile(null)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  async function signIn(email: string, password: string) {
    setError(null)
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) {
      setError(signInError.message)
      throw signInError
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setProfile(null)
    setSession(null)
  }

  return (
    <AuthContext.Provider value={{ session, profile, loading, error, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
