import { useEffect, useState } from 'react'
import { supabase, supabaseReporting } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { ProductCatalogRow } from '../lib/types'

interface Category { id: string; name: string }

interface ProductForm {
  id: string | null
  sku: string
  name: string
  tamil_name: string
  slug: string
  category_id: string
  unit: string
  mrp: string
  selling_price: string
  gst_percent: string
  is_active: boolean
}

const emptyForm: ProductForm = {
  id: null,
  sku: '',
  name: '',
  tamil_name: '',
  slug: '',
  category_id: '',
  unit: 'kg',
  mrp: '',
  selling_price: '',
  gst_percent: '0',
  is_active: true,
}

export default function Products() {
  const { profile } = useAuth()
  const isSuperAdmin = profile?.role === 'super_admin'

  const [products, setProducts] = useState<ProductCatalogRow[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<ProductForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function loadProducts() {
    setLoading(true)
    const { data } = await supabaseReporting
      .from('v_product_catalog')
      .select('*')
      .order('name')
    setProducts((data as ProductCatalogRow[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadProducts()
    supabase
      .from('categories')
      .select('id, name')
      .order('name')
      .then(({ data }) => setCategories((data as Category[]) ?? []))
  }, [])

  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase())
  )

  function startAdd() {
    setForm(emptyForm)
    setFormError(null)
    setShowForm(true)
  }

  async function startEdit(productId: string) {
    setFormError(null)
    const { data, error } = await supabase
      .from('products')
      .select('id, sku, name, tamil_name, slug, category_id, unit, mrp, selling_price, gst_percent, is_active')
      .eq('id', productId)
      .single()

    if (error || !data) {
      setFormError(error?.message ?? 'Could not load product for editing.')
      return
    }

    setForm({
      id: data.id,
      sku: data.sku,
      name: data.name,
      tamil_name: data.tamil_name ?? '',
      slug: data.slug,
      category_id: data.category_id,
      unit: data.unit,
      mrp: String(data.mrp),
      selling_price: String(data.selling_price),
      gst_percent: String(data.gst_percent),
      is_active: data.is_active,
    })
    setShowForm(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setFormError(null)

    const slug =
      form.slug ||
      form.name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')

    const payload = {
      sku: form.sku,
      name: form.name,
      tamil_name: form.tamil_name || null,
      slug,
      category_id: form.category_id,
      unit: form.unit,
      mrp: Number(form.mrp),
      selling_price: Number(form.selling_price),
      gst_percent: Number(form.gst_percent),
      is_active: form.is_active,
    }

    const { error } = form.id
      ? await supabase.from('products').update(payload).eq('id', form.id)
      : await supabase.from('products').insert(payload)

    if (error) {
      setFormError(error.message)
      setSaving(false)
      return
    }

    setForm(emptyForm)
    setShowForm(false)
    setSaving(false)
    loadProducts()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Products</h1>
          <p className="mt-1 text-sm text-ink/60">{products.length} active products in the catalog.</p>
        </div>
        {isSuperAdmin && (
          <button className="btn-primary" onClick={showForm ? () => setShowForm(false) : startAdd}>
            {showForm ? 'Cancel' : '+ Add product'}
          </button>
        )}
      </div>

      {showForm && isSuperAdmin && (
        <form onSubmit={handleSave} className="card grid grid-cols-3 gap-4">
          <p className="col-span-3 font-display text-sm font-semibold text-ink/70">
            {form.id ? `Editing ${form.name}` : 'New product'}
          </p>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink/70">SKU</label>
            <input required className="input" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink/70">Name</label>
            <input required className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink/70">Tamil name</label>
            <input className="input" value={form.tamil_name} onChange={(e) => setForm({ ...form, tamil_name: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink/70">Category</label>
            <select required className="input" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
              <option value="">Select…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink/70">Unit</label>
            <input required className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="kg, l, pcs…" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink/70">GST %</label>
            <input type="number" step="0.01" className="input" value={form.gst_percent} onChange={(e) => setForm({ ...form, gst_percent: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink/70">MRP (₹)</label>
            <input required type="number" step="0.01" className="input" value={form.mrp} onChange={(e) => setForm({ ...form, mrp: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink/70">Selling price (₹)</label>
            <input required type="number" step="0.01" className="input" value={form.selling_price} onChange={(e) => setForm({ ...form, selling_price: e.target.value })} />
          </div>
          <div className="flex items-end gap-2 pb-2">
            <input
              type="checkbox" id="is_active" className="h-4 w-4"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            />
            <label htmlFor="is_active" className="text-xs font-medium text-ink/70">Active (visible to customers)</label>
          </div>

          {formError && <p className="col-span-3 rounded-md bg-brick-100 px-3 py-2 text-sm text-brick-700">{formError}</p>}

          <div className="col-span-3 flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving…' : form.id ? 'Save changes' : 'Save product'}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      <input
        className="input max-w-sm"
        placeholder="Search by name or SKU…"
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
                <th className="th">Product</th>
                <th className="th">Category</th>
                <th className="th text-right">MRP</th>
                <th className="th text-right">Price</th>
                <th className="th text-right">Discount</th>
                <th className="th text-right">Stock</th>
                {isSuperAdmin && <th className="th"></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td className="td">
                    <p className="font-medium">{p.name}</p>
                    <p className="font-mono text-xs text-ink/40">{p.sku}</p>
                  </td>
                  <td className="td text-ink/60">{p.category_name}</td>
                  <td className="td text-right font-mono text-ink/50 line-through">₹{p.mrp}</td>
                  <td className="td text-right font-mono font-medium">₹{p.selling_price}</td>
                  <td className="td text-right font-mono text-crate-700">{p.discount_percent}%</td>
                  <td className={`td text-right font-mono ${p.available_stock <= 10 ? 'text-brick-500' : ''}`}>
                    {p.available_stock}
                  </td>
                  {isSuperAdmin && (
                    <td className="td text-right">
                      <button
                        className="text-xs font-medium text-crate-700 underline decoration-crate-300 underline-offset-2 hover:text-crate-500"
                        onClick={() => startEdit(p.id)}
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
