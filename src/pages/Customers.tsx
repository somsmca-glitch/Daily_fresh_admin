import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { CustomerRow } from '../lib/types'

export default function Customers() {
  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('customers')
      .select('id, referral_code, wallet_balance, loyalty_points, status, created_at, user_profiles(full_name, phone, email)')
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data }) => {
        setCustomers((data as unknown as CustomerRow[]) ?? [])
        setLoading(false)
      })
  }, [])

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase()
    return (
      c.user_profiles?.full_name?.toLowerCase().includes(q) ||
      c.user_profiles?.phone?.includes(q) ||
      c.referral_code.toLowerCase().includes(q)
    )
  })

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
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
