import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill them in.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: { schema: 'app' },
})

// A second client scoped to the `reporting` schema, since PostgREST can only
// target one schema per client. Views/materialized views used by the
// dashboard live there.
export const supabaseReporting = createClient(supabaseUrl, supabaseAnonKey, {
  db: { schema: 'reporting' },
})
