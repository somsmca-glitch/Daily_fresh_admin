import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface DeliveryPartner {
  id: string
  is_available: boolean
  rating: number
  completed_deliveries: number
  total_earnings: number
  status: string
  user_profiles: { full_name: string | null; phone: string | null } | null
  delivery_partner_vehicles: { vehicle_type: string; registration_number: string | null }[]
}

export default function DeliveryPartners() {
  const [partners, setPartners] = useState<DeliveryPartner[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('delivery_partners')
      .select('id, is_available, rating, completed_deliveries, total_earnings, status, user_profiles(full_name, phone), delivery_partner_vehicles(vehicle_type, registration_number)')
      .order('rating', { ascending: false })
    setPartners((data as unknown as DeliveryPartner[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function updateStatus(id: string, status: string) {
    setSavingId(id)
    await supabase.from('delivery_partners').update({ status }).eq('id', id)
    await load()
    setSavingId(null)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Delivery Partners</h1>
        <p className="mt-1 text-sm text-ink/60">{partners.length} riders on the platform.</p>
      </div>

      <div className="card overflow-hidden !p-0">
        {loading ? <p className="p-5 text-sm text-ink/50">Loading…</p> : (
          <table className="w-full">
            <thead><tr>
              <th className="th">Partner</th><th className="th">Vehicle</th><th className="th text-right">Rating</th>
              <th className="th text-right">Deliveries</th><th className="th text-right">Earnings</th>
              <th className="th">Available</th><th className="th">Status</th>
            </tr></thead>
            <tbody>
              {partners.map((p) => (
                <tr key={p.id}>
                  <td className="td"><p className="font-medium">{p.user_profiles?.full_name ?? '—'}</p><p className="font-mono text-xs text-ink/40">{p.user_profiles?.phone}</p></td>
                  <td className="td text-ink/60">
                    {p.delivery_partner_vehicles[0] ? `${p.delivery_partner_vehicles[0].vehicle_type} · ${p.delivery_partner_vehicles[0].registration_number ?? '—'}` : '—'}
                  </td>
                  <td className="td text-right font-mono">{p.rating}</td>
                  <td className="td text-right font-mono">{p.completed_deliveries}</td>
                  <td className="td text-right font-mono">₹{p.total_earnings}</td>
                  <td className="td">
                    <span className={`stamp ${p.is_available ? 'border-crate-300 bg-crate-50 text-crate-700' : 'border-line text-ink/50'}`}>
                      {p.is_available ? 'available' : 'offline'}
                    </span>
                  </td>
                  <td className="td">
                    <select
                      className="input py-1 text-xs" value={p.status} disabled={savingId === p.id}
                      onChange={(e) => updateStatus(p.id, e.target.value)}
                    >
                      <option value="active">Active</option>
                      <option value="suspended">Suspended</option>
                      <option value="inactive">Inactive</option>
                    </select>
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
