import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface Store {
  id: string
  store_code: string
  store_name: string
  store_type: string
  city: string
  state: string
  phone: string | null
  opening_time: string | null
  closing_time: string | null
  delivery_radius_km: number
  is_active: boolean
}

const emptyForm = {
  id: null as string | null,
  store_code: '', store_name: '', address_line1: '', city: '', state: 'Tamil Nadu', pincode: '',
  latitude: '', longitude: '', phone: '', opening_time: '06:00', closing_time: '23:00',
  delivery_radius_km: '5', is_active: true,
}

export default function Stores() {
  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('stores').select('id, store_code, store_name, store_type, city, state, phone, opening_time, closing_time, delivery_radius_km, is_active').order('store_name')
    setStores((data as Store[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function startAdd() { setForm(emptyForm); setError(null); setShowForm(true) }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const { error: err } = await supabase.from('stores').insert({
      store_code: form.store_code, store_name: form.store_name, address_line1: form.address_line1,
      city: form.city, state: form.state, pincode: form.pincode,
      latitude: Number(form.latitude), longitude: Number(form.longitude),
      phone: form.phone || null, opening_time: form.opening_time, closing_time: form.closing_time,
      delivery_radius_km: Number(form.delivery_radius_km), is_active: form.is_active,
    })
    if (err) { setError(err.message); setSaving(false); return }
    setShowForm(false); setSaving(false); load()
  }

  async function toggleActive(s: Store) {
    await supabase.from('stores').update({ is_active: !s.is_active }).eq('id', s.id)
    load()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Stores & Warehouses</h1>
          <p className="mt-1 text-sm text-ink/60">{stores.length} store locations.</p>
        </div>
        <button className="btn-primary" onClick={showForm ? () => setShowForm(false) : startAdd}>
          {showForm ? 'Cancel' : '+ Add store'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSave} className="card grid grid-cols-3 gap-4">
          <div><label className="mb-1 block text-xs font-medium text-ink/70">Store code</label>
            <input required className="input" value={form.store_code} onChange={(e) => setForm({ ...form, store_code: e.target.value })} placeholder="STR-XXX-01" /></div>
          <div className="col-span-2"><label className="mb-1 block text-xs font-medium text-ink/70">Store name</label>
            <input required className="input" value={form.store_name} onChange={(e) => setForm({ ...form, store_name: e.target.value })} /></div>
          <div className="col-span-3"><label className="mb-1 block text-xs font-medium text-ink/70">Address</label>
            <input required className="input" value={form.address_line1} onChange={(e) => setForm({ ...form, address_line1: e.target.value })} /></div>
          <div><label className="mb-1 block text-xs font-medium text-ink/70">City</label>
            <input required className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
          <div><label className="mb-1 block text-xs font-medium text-ink/70">State</label>
            <input required className="input" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></div>
          <div><label className="mb-1 block text-xs font-medium text-ink/70">Pincode</label>
            <input required className="input" value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })} /></div>
          <div><label className="mb-1 block text-xs font-medium text-ink/70">Latitude</label>
            <input required type="number" step="0.000001" className="input" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} /></div>
          <div><label className="mb-1 block text-xs font-medium text-ink/70">Longitude</label>
            <input required type="number" step="0.000001" className="input" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} /></div>
          <div><label className="mb-1 block text-xs font-medium text-ink/70">Delivery radius (km)</label>
            <input required type="number" step="0.1" className="input" value={form.delivery_radius_km} onChange={(e) => setForm({ ...form, delivery_radius_km: e.target.value })} /></div>
          <div><label className="mb-1 block text-xs font-medium text-ink/70">Phone</label>
            <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><label className="mb-1 block text-xs font-medium text-ink/70">Opening time</label>
            <input type="time" className="input" value={form.opening_time} onChange={(e) => setForm({ ...form, opening_time: e.target.value })} /></div>
          <div><label className="mb-1 block text-xs font-medium text-ink/70">Closing time</label>
            <input type="time" className="input" value={form.closing_time} onChange={(e) => setForm({ ...form, closing_time: e.target.value })} /></div>

          {error && <p className="col-span-3 rounded-md bg-brick-100 px-3 py-2 text-sm text-brick-700">{error}</p>}
          <div className="col-span-3 flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save store'}</button>
            <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="card overflow-hidden !p-0">
        {loading ? <p className="p-5 text-sm text-ink/50">Loading…</p> : (
          <table className="w-full">
            <thead><tr>
              <th className="th">Store</th><th className="th">Location</th><th className="th">Hours</th>
              <th className="th text-right">Radius</th><th className="th">Active</th>
            </tr></thead>
            <tbody>
              {stores.map((s) => (
                <tr key={s.id}>
                  <td className="td"><p className="font-medium">{s.store_name}</p><p className="font-mono text-xs text-ink/40">{s.store_code}</p></td>
                  <td className="td text-ink/60">{s.city}, {s.state}</td>
                  <td className="td text-ink/60">{s.opening_time?.slice(0, 5)}–{s.closing_time?.slice(0, 5)}</td>
                  <td className="td text-right font-mono">{s.delivery_radius_km} km</td>
                  <td className="td">
                    <button onClick={() => toggleActive(s)} className={`stamp cursor-pointer ${s.is_active ? 'border-crate-300 bg-crate-50 text-crate-700' : 'border-line text-ink/50'}`}>
                      {s.is_active ? 'active' : 'inactive'}
                    </button>
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
