import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface Category {
  id: string
  name: string
  tamil_name: string | null
  slug: string
  parent_id: string | null
  display_order: number
  is_active: boolean
  icon_url: string | null
  banner_url: string | null
  image_url: string | null
}

interface Brand {
  id: string
  name: string
  is_active: boolean
}

export default function Categories() {
  const [categories, setCategories] = useState<Category[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [loading, setLoading] = useState(true)

  const [showCatForm, setShowCatForm] = useState(false)
  const [catForm, setCatForm] = useState({ id: null as string | null, name: '', tamil_name: '', parent_id: '', display_order: '0', is_active: true, icon_url: '', banner_url: '', image_url: '' })
  const [catSaving, setCatSaving] = useState(false)
  const [catError, setCatError] = useState<string | null>(null)

  const [showBrandForm, setShowBrandForm] = useState(false)
  const [brandName, setBrandName] = useState('')
  const [brandSaving, setBrandSaving] = useState(false)
  const [brandError, setBrandError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const [catRes, brandRes] = await Promise.all([
      supabase.from('categories').select('id, name, tamil_name, slug, parent_id, display_order, is_active, icon_url, banner_url, image_url').order('display_order'),
      supabase.from('brands').select('id, name, is_active').order('name'),
    ])
    setCategories((catRes.data as Category[]) ?? [])
    setBrands((brandRes.data as Brand[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const topLevel = categories.filter((c) => !c.parent_id)
  const childrenOf = (id: string) => categories.filter((c) => c.parent_id === id)

  function startEditCategory(c: Category) {
    setCatForm({
      id: c.id, name: c.name, tamil_name: c.tamil_name ?? '', parent_id: c.parent_id ?? '',
      display_order: String(c.display_order), is_active: c.is_active,
      icon_url: c.icon_url ?? '', banner_url: c.banner_url ?? '', image_url: c.image_url ?? '',
    })
    setCatError(null)
    setShowCatForm(true)
  }

  function startAddCategory() {
    setCatForm({ id: null, name: '', tamil_name: '', parent_id: '', display_order: '0', is_active: true, icon_url: '', banner_url: '', image_url: '' })
    setCatError(null)
    setShowCatForm(true)
  }

  async function saveCategory(e: React.FormEvent) {
    e.preventDefault()
    setCatSaving(true)
    setCatError(null)
    const slug = catForm.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    const payload = {
      name: catForm.name, tamil_name: catForm.tamil_name || null, slug,
      parent_id: catForm.parent_id || null, display_order: Number(catForm.display_order), is_active: catForm.is_active,
      icon_url: catForm.icon_url || null, banner_url: catForm.banner_url || null, image_url: catForm.image_url || null,
    }
    const { error } = catForm.id
      ? await supabase.from('categories').update(payload).eq('id', catForm.id)
      : await supabase.from('categories').insert(payload)
    if (error) { setCatError(error.message); setCatSaving(false); return }
    setShowCatForm(false); setCatSaving(false); load()
  }

  async function toggleCategoryActive(c: Category) {
    await supabase.from('categories').update({ is_active: !c.is_active }).eq('id', c.id)
    load()
  }

  async function saveBrand(e: React.FormEvent) {
    e.preventDefault()
    setBrandSaving(true)
    setBrandError(null)
    const { error } = await supabase.from('brands').insert({ name: brandName })
    if (error) { setBrandError(error.message); setBrandSaving(false); return }
    setBrandName(''); setShowBrandForm(false); setBrandSaving(false); load()
  }

  async function toggleBrandActive(b: Brand) {
    await supabase.from('brands').update({ is_active: !b.is_active }).eq('id', b.id)
    load()
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Categories & Brands</h1>
        <p className="mt-1 text-sm text-ink/60">Catalog organization used across the storefront.</p>
      </div>

      <div className="card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-base font-semibold">Categories</h2>
          <button className="btn-secondary" onClick={showCatForm ? () => setShowCatForm(false) : startAddCategory}>
            {showCatForm ? 'Cancel' : '+ New category'}
          </button>
        </div>

        {showCatForm && (
          <form onSubmit={saveCategory} className="mb-4 grid grid-cols-4 gap-3 rounded-md bg-crate-50 p-4">
            <div><label className="mb-1 block text-xs font-medium text-ink/70">Name</label>
              <input required className="input" value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} /></div>
            <div><label className="mb-1 block text-xs font-medium text-ink/70">Tamil name</label>
              <input className="input" value={catForm.tamil_name} onChange={(e) => setCatForm({ ...catForm, tamil_name: e.target.value })} /></div>
            <div><label className="mb-1 block text-xs font-medium text-ink/70">Parent category</label>
              <select className="input" value={catForm.parent_id} onChange={(e) => setCatForm({ ...catForm, parent_id: e.target.value })}>
                <option value="">None (top-level)</option>
                {topLevel.filter((c) => c.id !== catForm.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
            <div><label className="mb-1 block text-xs font-medium text-ink/70">Display order</label>
              <input type="number" className="input" value={catForm.display_order} onChange={(e) => setCatForm({ ...catForm, display_order: e.target.value })} /></div>
            <div><label className="mb-1 block text-xs font-medium text-ink/70">Icon URL</label>
              <input className="input" value={catForm.icon_url} onChange={(e) => setCatForm({ ...catForm, icon_url: e.target.value })} placeholder="https://…" /></div>
            <div><label className="mb-1 block text-xs font-medium text-ink/70">Banner URL</label>
              <input className="input" value={catForm.banner_url} onChange={(e) => setCatForm({ ...catForm, banner_url: e.target.value })} placeholder="https://…" /></div>
            <div><label className="mb-1 block text-xs font-medium text-ink/70">Image URL</label>
              <input className="input" value={catForm.image_url} onChange={(e) => setCatForm({ ...catForm, image_url: e.target.value })} placeholder="https://…" /></div>
            {catError && <p className="col-span-4 rounded-md bg-brick-100 px-3 py-2 text-sm text-brick-700">{catError}</p>}
            <div className="col-span-4">
              <button type="submit" disabled={catSaving} className="btn-primary">{catSaving ? 'Saving…' : catForm.id ? 'Save changes' : 'Create category'}</button>
            </div>
          </form>
        )}

        {loading ? <p className="text-sm text-ink/50">Loading…</p> : (
          <div className="space-y-3">
            {topLevel.map((parent) => (
              <div key={parent.id}>
                <div className="flex items-center justify-between rounded-md bg-crate-50 px-3 py-2">
                  <span className={`font-medium ${!parent.is_active ? 'text-ink/40 line-through' : ''}`}>
                    {parent.name} <span className="text-ink/40 font-normal">{parent.tamil_name}</span>
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleCategoryActive(parent)}
                      className={`stamp cursor-pointer ${parent.is_active ? 'border-crate-300 bg-crate-50 text-crate-700' : 'border-line text-ink/40'}`}
                    >
                      {parent.is_active ? 'active' : 'inactive'}
                    </button>
                    <button className="text-xs text-crate-700 underline" onClick={() => startEditCategory(parent)}>Edit</button>
                  </div>
                </div>
                {childrenOf(parent.id).length > 0 && (
                  <ul className="ml-4 mt-1 space-y-1 border-l border-line pl-4">
                    {childrenOf(parent.id).map((child) => (
                      <li key={child.id} className="flex items-center justify-between text-sm">
                        <span className={!child.is_active ? 'text-ink/40 line-through' : 'text-ink/70'}>{child.name}</span>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => toggleCategoryActive(child)}
                            className={`stamp cursor-pointer ${child.is_active ? 'border-crate-300 bg-crate-50 text-crate-700' : 'border-line text-ink/40'}`}
                          >
                            {child.is_active ? 'active' : 'inactive'}
                          </button>
                          <button className="text-xs text-crate-700 underline" onClick={() => startEditCategory(child)}>Edit</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-base font-semibold">Brands</h2>
          <button className="btn-secondary" onClick={() => setShowBrandForm((s) => !s)}>
            {showBrandForm ? 'Cancel' : '+ New brand'}
          </button>
        </div>
        {showBrandForm && (
          <form onSubmit={saveBrand} className="mb-4 flex items-end gap-3 rounded-md bg-crate-50 p-4">
            <div className="flex-1"><label className="mb-1 block text-xs font-medium text-ink/70">Brand name</label>
              <input required className="input" value={brandName} onChange={(e) => setBrandName(e.target.value)} /></div>
            <button type="submit" disabled={brandSaving} className="btn-primary">{brandSaving ? 'Saving…' : 'Add'}</button>
          </form>
        )}
        {brandError && <p className="mb-3 rounded-md bg-brick-100 px-3 py-2 text-sm text-brick-700">{brandError}</p>}
        <div className="flex flex-wrap gap-2">
          {brands.map((b) => (
            <button
              key={b.id} onClick={() => toggleBrandActive(b)}
              className={`stamp cursor-pointer ${b.is_active ? 'border-crate-300 bg-crate-50 text-crate-700' : 'border-line text-ink/40 line-through'}`}
            >
              {b.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
