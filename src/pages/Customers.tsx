import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { CustomerRow } from '../lib/types'

interface EditForm {
  id: string
  full_name: string
  phone: string
  wallet_balance: string
  loyalty_points: string
  status: string
}

export default function Customers() {
  const { profile } = useAuth()
  const isSuperAdmin = profile?.role === 'super_admin'

  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<EditForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function load() {
    const { data } = await supabase
      .from('customers')
      .select('id, referral_code, wallet_balance, loyalty_points, status, created_at, user_profiles(full_name, phone, email)')
      .order('created_at', { ascending: false })
      .limit(200)
    setCustomers((data as unknown as CustomerRow[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase()
    return (
      c.user_profiles?.full_name?.toLowerCase().includes(q) ||
      c.user_profiles?.phone?.includes(q) ||
      c.referral_code.toLowerCase().includes(q)
    )
  })

  function startEdit(c: CustomerRow) {
    setFormError(null)
    setEditing({
      id: c.id,
      full_name: c.user_profiles?.full_name ?? '',
      phone: c.user_profiles?.phone ?? '',
      wallet_balance: String(c.wallet_balance),
      loyalty_points: String(c.loyalty_points),
      status: c.status,
    })
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!editing) return
    setSaving(true)
    setFormError(null)

    const [profileRes, customerRes] = await Promise.all([
      supabase.from('user_profiles').update({
        full_name: editing.full_name || null,
        phone: editing.phone || null,
      }).eq('id', editing.id),
      supabase.from('customers').update({
        wallet_balance: Number(editing.wallet_balance),
        loyalty_points: Number(editing.loyalty_points),
        status: editing.status,
      }).eq('id', editing.id),
    ])

    const error = profileRes.error ?? customerRes.error
    if (error) {
      setFormError(error.message)
      setSaving(false)
      return
    }

    setEditing(null)
    setSaving(false)
    load()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Customers</h1>
        <p className="mt-1 text-sm text-ink/60">{customers.length} customers, most recent first.</p>
      </div>

      <input
        className="input max-w-sm"
        placeholder="Search by name, phone, or referral code…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {editing && isSuperAdmin && (
        <form onSubmit={handleSave} className="card grid grid-cols-3 gap-4">
          <p className="col-span-3 font-display text-sm font-semibold text-ink/70">Editing {editing.full_name || 'customer'}</p>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink/70">Full name</label>
            <input className="input" value={editing.full_name} onChange={(e) => setEditing({ ...editing, full_name: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink/70">Phone</label>
            <input className="input" value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink/70">Status</label>
            <select className="input" value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })}>
              <option value="active">Active</option>
              <option value="blocked">Blocked</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink/70">Wallet balance (₹)</label>
            <input type="number" step="0.01" className="input" value={editing.wallet_balance} onChange={(e) => setEditing({ ...editing, wallet_balance: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink/70">Loyalty points</label>
            <input type="number" className="input" value={editing.loyalty_points} onChange={(e) => setEditing({ ...editing, loyalty_points: e.target.value })} />
          </div>

          {formError && <p className="col-span-3 rounded-md bg-brick-100 px-3 py-2 text-sm text-brick-700">{formError}</p>}

          <div className="col-span-3 flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save changes'}</button>
            <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="card overflow-hidden !p-0">
        {loading ? (
          <p className="p-5 text-sm text-ink/50">Loading…</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Customer</th>
                <th className="th">Referral code</th>
                <th className="th text-right">Wallet</th>
                <th className="th text-right">Loyalty pts</th>
                <th className="th">Status</th>
                {isSuperAdmin && <th className="th"></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td className="td">
                    <p className="font-medium">{c.user_profiles?.full_name ?? '—'}</p>
                    <p className="text-xs text-ink/40">{c.user_profiles?.phone ?? c.user_profiles?.email ?? ''}</p>
                  </td>
                  <td className="td font-mono text-xs">{c.referral_code}</td>
                  <td className="td text-right font-mono">₹{c.wallet_balance}</td>
                  <td className="td text-right font-mono">{c.loyalty_points}</td>
                  <td className="td">
                    <span className={`stamp ${c.status === 'active' ? 'border-crate-300 bg-crate-50 text-crate-700' : 'border-brick-500 bg-brick-100 text-brick-700'}`}>
                      {c.status}
                    </span>
                  </td>
                  {isSuperAdmin && (
                    <td className="td text-right">
                      <button
                        className="text-xs font-medium text-crate-700 underline decoration-crate-300 underline-offset-2 hover:text-crate-500"
                        onClick={() => startEdit(c)}
                      >
                        Edit
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
