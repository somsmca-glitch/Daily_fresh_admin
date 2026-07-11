import { useEffect, useState } from 'react'
import { supabase, supabaseReporting } from '../lib/supabase'
import type { ProductCatalogRow } from '../lib/types'

interface Category { id: string; name: string }

const emptyForm = {
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
  const [products, setProducts] = useState<ProductCatalogRow[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
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

    const { error } = await supabase.from('products').insert({
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
    })

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
        <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : '+ Add product'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSave} className="card grid grid-cols-3 gap-4">
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

          {formError && <p className="col-span-3 rounded-md bg-brick-100 px-3 py-2 text-sm text-brick-700">{formError}</p>}

          <div className="col-span-3">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving…' : 'Save product'}
            </button>
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
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
