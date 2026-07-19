import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface Banner {
  id: string
  title: string
  subtitle: string | null
  image_url: string
  link_url: string | null
  display_order: number
  is_active: boolean
  valid_from: string
  valid_until: string | null
}

const emptyForm = {
  id: null as string | null,
  title: '', subtitle: '', image_url: '', link_url: '', display_order: '0',
  valid_until: '', is_active: true,
}

export default function Banners() {
  const [banners, setBanners] = useState<Banner[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('banners').select('*').order('display_order')
    setBanners((data as Banner[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function startAdd() { setForm(emptyForm); setError(null); setShowForm(true) }

  function startEdit(b: Banner) {
    setForm({
      id: b.id, title: b.title, subtitle: b.subtitle ?? '', image_url: b.image_url,
      link_url: b.link_url ?? '', display_order: String(b.display_order),
      valid_until: b.valid_until ? b.valid_until.slice(0, 10) : '', is_active: b.is_active,
    })
    setError(null)
    setShowForm(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const payload = {
      title: form.title, subtitle: form.subtitle || null, image_url: form.image_url,
      link_url: form.link_url || null, display_order: Number(form.display_order),
      valid_until: form.valid_until ? new Date(form.valid_until).toISOString() : null,
      is_active: form.is_active,
    }
    const { error: err } = form.id
      ? await supabase.from('banners').update(payload).eq('id', form.id)
      : await supabase.from('banners').insert(payload)
    if (err) { setError(err.message); setSaving(false); return }
    setShowForm(false); setSaving(false); load()
  }

  async function toggleActive(b: Banner) {
    await supabase.from('banners').update({ is_active: !b.is_active }).eq('id', b.id)
    load()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Banners</h1>
          <p className="mt-1 text-sm text-ink/60">Homepage promotional banners shown to customers.</p>
        </div>
        <button className="btn-primary" onClick={showForm ? () => setShowForm(false) : startAdd}>
          {showForm ? 'Cancel' : '+ New banner'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSave} className="card grid grid-cols-3 gap-4">
          <p className="col-span-3 font-display text-sm font-semibold text-ink/70">
            {form.id ? `Editing ${form.title}` : 'New banner'}
          </p>
          <div><label className="mb-1 block text-xs font-medium text-ink/70">Title</label>
            <input required className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. 50% off vegetables this week" /></div>
          <div className="col-span-2"><label className="mb-1 block text-xs font-medium text-ink/70">Subtitle</label>
            <input className="input" value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} /></div>
          <div className="col-span-2"><label className="mb-1 block text-xs font-medium text-ink/70">Image URL</label>
            <input required className="input" value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="https://…" /></div>
          <div><label className="mb-1 block text-xs font-medium text-ink/70">Display order</label>
            <input type="number" className="input" value={form.display_order} onChange={(e) => setForm({ ...form, display_order: e.target.value })} /></div>
          <div className="col-span-2"><label className="mb-1 block text-xs font-medium text-ink/70">Link (where tapping the banner goes)</label>
            <input className="input" value={form.link_url} onChange={(e) => setForm({ ...form, link_url: e.target.value })} placeholder="e.g. category or product page" /></div>
          <div><label className="mb-1 block text-xs font-medium text-ink/70">Expires (optional)</label>
            <input type="date" className="input" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} /></div>
          <div className="flex items-end gap-2 pb-2">
            <input type="checkbox" id="b_active" className="h-4 w-4" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
            <label htmlFor="b_active" className="text-xs font-medium text-ink/70">Active</label>
          </div>

          {error && <p className="col-span-3 rounded-md bg-brick-100 px-3 py-2 text-sm text-brick-700">{error}</p>}
          <div className="col-span-3 flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving…' : form.id ? 'Save changes' : 'Create banner'}</button>
            <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-2 gap-4">
        {loading ? (
          <p className="text-sm text-ink/50">Loading…</p>
        ) : banners.length === 0 ? (
          <p className="text-sm text-ink/50">No banners yet.</p>
        ) : (
          banners.map((b) => (
            <div key={b.id} className="card overflow-hidden !p-0">
              <div className="aspect-[3/1] w-full overflow-hidden bg-crate-50">
                {b.image_url ? (
                  <img src={b.image_url} alt={b.title} className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                ) : null}
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium">{b.title}</p>
                    {b.subtitle && <p className="text-sm text-ink/60">{b.subtitle}</p>}
                  </div>
                  <button onClick={() => toggleActive(b)} className={`stamp shrink-0 cursor-pointer ${b.is_active ? 'border-crate-300 bg-crate-50 text-crate-700' : 'border-line text-ink/50'}`}>
                    {b.is_active ? 'active' : 'inactive'}
                  </button>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-ink/40">
                  <span>Order {b.display_order}{b.valid_until ? ` · expires ${new Date(b.valid_until).toLocaleDateString('en-IN')}` : ''}</span>
                  <button className="font-medium text-crate-700 underline decoration-crate-300 underline-offset-2 hover:text-crate-500" onClick={() => startEdit(b)}>Edit</button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
