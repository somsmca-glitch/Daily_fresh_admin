import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface Supplier {
  id: string
  supplier_name: string
  company_name: string | null
  gst_number: string | null
  phone: string
  city: string | null
  state: string | null
  rating: number
  is_active: boolean
}

const emptyForm = {
  id: null as string | null,
  supplier_name: '', company_name: '', gst_number: '', phone: '', city: '', state: '', is_active: true,
}

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('suppliers').select('*').order('supplier_name')
    setSuppliers((data as Supplier[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function startAdd() { setForm(emptyForm); setError(null); setShowForm(true) }
  function startEdit(s: Supplier) {
    setForm({
      id: s.id, supplier_name: s.supplier_name, company_name: s.company_name ?? '',
      gst_number: s.gst_number ?? '', phone: s.phone, city: s.city ?? '', state: s.state ?? '',
      is_active: s.is_active,
    })
    setError(null)
    setShowForm(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const payload = {
      supplier_name: form.supplier_name, company_name: form.company_name || null,
      gst_number: form.gst_number || null, phone: form.phone, city: form.city || null,
      state: form.state || null, is_active: form.is_active,
    }
    const { error: err } = form.id
      ? await supabase.from('suppliers').update(payload).eq('id', form.id)
      : await supabase.from('suppliers').insert(payload)
    if (err) { setError(err.message); setSaving(false); return }
    setShowForm(false); setSaving(false); load()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Suppliers</h1>
          <p className="mt-1 text-sm text-ink/60">{suppliers.length} suppliers on file.</p>
        </div>
        <button className="btn-primary" onClick={showForm ? () => setShowForm(false) : startAdd}>
          {showForm ? 'Cancel' : '+ Add supplier'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSave} className="card grid grid-cols-3 gap-4">
          <div><label className="mb-1 block text-xs font-medium text-ink/70">Supplier name</label>
            <input required className="input" value={form.supplier_name} onChange={(e) => setForm({ ...form, supplier_name: e.target.value })} /></div>
          <div><label className="mb-1 block text-xs font-medium text-ink/70">Company name</label>
            <input className="input" value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} /></div>
          <div><label className="mb-1 block text-xs font-medium text-ink/70">GST number</label>
            <input className="input" value={form.gst_number} onChange={(e) => setForm({ ...form, gst_number: e.target.value })} /></div>
          <div><label className="mb-1 block text-xs font-medium text-ink/70">Phone</label>
            <input required className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><label className="mb-1 block text-xs font-medium text-ink/70">City</label>
            <input className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
          <div><label className="mb-1 block text-xs font-medium text-ink/70">State</label>
            <input className="input" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></div>
          <div className="flex items-end gap-2 pb-2">
            <input type="checkbox" id="s_active" className="h-4 w-4" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
            <label htmlFor="s_active" className="text-xs font-medium text-ink/70">Active</label>
          </div>
          {error && <p className="col-span-3 rounded-md bg-brick-100 px-3 py-2 text-sm text-brick-700">{error}</p>}
          <div className="col-span-3 flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving…' : form.id ? 'Save changes' : 'Save supplier'}</button>
            <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="card overflow-hidden !p-0">
        {loading ? <p className="p-5 text-sm text-ink/50">Loading…</p> : (
          <table className="w-full">
            <thead><tr>
              <th className="th">Supplier</th><th className="th">GST</th><th className="th">Phone</th>
              <th className="th">Location</th><th className="th text-right">Rating</th><th className="th"></th>
            </tr></thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id}>
                  <td className="td"><p className="font-medium">{s.supplier_name}</p><p className="text-xs text-ink/40">{s.company_name}</p></td>
                  <td className="td font-mono text-xs">{s.gst_number ?? '—'}</td>
                  <td className="td">{s.phone}</td>
                  <td className="td text-ink/60">{[s.city, s.state].filter(Boolean).join(', ') || '—'}</td>
                  <td className="td text-right font-mono">{s.rating}</td>
                  <td className="td text-right">
                    <button className="text-xs font-medium text-crate-700 underline decoration-crate-300 underline-offset-2 hover:text-crate-500" onClick={() => startEdit(s)}>Edit</button>
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
