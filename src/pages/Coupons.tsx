import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface Coupon {
  id: string
  code: string
  description: string | null
  discount_type: string
  discount_value: number
  min_order_value: number
  usage_limit_per_customer: number
  used_count: number
  valid_until: string
  is_active: boolean
}

const emptyForm = {
  id: null as string | null,
  code: '', description: '', discount_type: 'percentage', discount_value: '10',
  min_order_value: '0', usage_limit_per_customer: '1', valid_until: '', is_active: true,
}

export default function Coupons() {
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('coupons').select('*').order('created_at', { ascending: false })
    setCoupons((data as Coupon[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function startAdd() {
    const nextMonth = new Date(); nextMonth.setDate(nextMonth.getDate() + 30)
    setForm({ ...emptyForm, valid_until: nextMonth.toISOString().slice(0, 10) })
    setError(null)
    setShowForm(true)
  }

  function startEdit(c: Coupon) {
    setForm({
      id: c.id, code: c.code, description: c.description ?? '', discount_type: c.discount_type,
      discount_value: String(c.discount_value), min_order_value: String(c.min_order_value),
      usage_limit_per_customer: String(c.usage_limit_per_customer),
      valid_until: c.valid_until.slice(0, 10), is_active: c.is_active,
    })
    setError(null)
    setShowForm(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const payload = {
      code: form.code.toUpperCase(), description: form.description || null,
      discount_type: form.discount_type, discount_value: Number(form.discount_value),
      min_order_value: Number(form.min_order_value),
      usage_limit_per_customer: Number(form.usage_limit_per_customer),
      valid_until: new Date(form.valid_until).toISOString(), is_active: form.is_active,
    }
    const { error: err } = form.id
      ? await supabase.from('coupons').update(payload).eq('id', form.id)
      : await supabase.from('coupons').insert(payload)
    if (err) { setError(err.message); setSaving(false); return }
    setShowForm(false); setSaving(false); load()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Coupons & Offers</h1>
          <p className="mt-1 text-sm text-ink/60">{coupons.length} coupons created.</p>
        </div>
        <button className="btn-primary" onClick={showForm ? () => setShowForm(false) : startAdd}>
          {showForm ? 'Cancel' : '+ New coupon'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSave} className="card grid grid-cols-3 gap-4">
          <div><label className="mb-1 block text-xs font-medium text-ink/70">Code</label>
            <input required className="input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
          <div className="col-span-2"><label className="mb-1 block text-xs font-medium text-ink/70">Description</label>
            <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div><label className="mb-1 block text-xs font-medium text-ink/70">Discount type</label>
            <select className="input" value={form.discount_type} onChange={(e) => setForm({ ...form, discount_type: e.target.value })}>
              <option value="percentage">Percentage</option>
              <option value="flat">Flat</option>
            </select></div>
          <div><label className="mb-1 block text-xs font-medium text-ink/70">Discount value</label>
            <input required type="number" step="0.01" className="input" value={form.discount_value} onChange={(e) => setForm({ ...form, discount_value: e.target.value })} /></div>
          <div><label className="mb-1 block text-xs font-medium text-ink/70">Min order value (₹)</label>
            <input type="number" step="0.01" className="input" value={form.min_order_value} onChange={(e) => setForm({ ...form, min_order_value: e.target.value })} /></div>
          <div><label className="mb-1 block text-xs font-medium text-ink/70">Uses per customer</label>
            <input type="number" min="1" className="input" value={form.usage_limit_per_customer} onChange={(e) => setForm({ ...form, usage_limit_per_customer: e.target.value })} /></div>
          <div><label className="mb-1 block text-xs font-medium text-ink/70">Valid until</label>
            <input required type="date" className="input" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} /></div>
          <div className="flex items-end gap-2 pb-2">
            <input type="checkbox" id="c_active" className="h-4 w-4" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
            <label htmlFor="c_active" className="text-xs font-medium text-ink/70">Active</label>
          </div>
          {error && <p className="col-span-3 rounded-md bg-brick-100 px-3 py-2 text-sm text-brick-700">{error}</p>}
          <div className="col-span-3 flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving…' : form.id ? 'Save changes' : 'Create coupon'}</button>
            <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="card overflow-hidden !p-0">
        {loading ? <p className="p-5 text-sm text-ink/50">Loading…</p> : (
          <table className="w-full">
            <thead><tr>
              <th className="th">Code</th><th className="th">Discount</th><th className="th text-right">Min order</th>
              <th className="th text-right">Used</th><th className="th">Valid until</th><th className="th"></th>
            </tr></thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c.id}>
                  <td className="td"><p className="font-mono font-medium">{c.code}</p><p className="text-xs text-ink/40">{c.description}</p></td>
                  <td className="td">{c.discount_type === 'flat' ? `₹${c.discount_value}` : `${c.discount_value}%`}</td>
                  <td className="td text-right font-mono">₹{c.min_order_value}</td>
                  <td className="td text-right font-mono">{c.used_count}/{c.usage_limit_per_customer}·pc</td>
                  <td className="td text-ink/60">{new Date(c.valid_until).toLocaleDateString('en-IN')}</td>
                  <td className="td text-right">
                    <button className="text-xs font-medium text-crate-700 underline decoration-crate-300 underline-offset-2 hover:text-crate-500" onClick={() => startEdit(c)}>Edit</button>
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
