import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { InventoryRow } from '../lib/types'

interface Warehouse { id: string; name: string }
interface Product { id: string; name: string; sku: string }

export default function Inventory() {
  const { profile } = useAuth()
  const isSuperAdmin = profile?.role === 'super_admin'

  const [rows, setRows] = useState<InventoryRow[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ warehouse_id: '', product_id: '', quantity_on_hand: '0', reorder_level: '10' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const [invRes, whRes, prodRes] = await Promise.all([
      supabase.from('inventory').select('id, warehouse_id, product_id, variant_id, quantity_on_hand, quantity_reserved, reorder_level, updated_at, products(name, sku), warehouses(name)').order('quantity_on_hand', { ascending: true }),
      supabase.from('warehouses').select('id, name').order('name'),
      supabase.from('products').select('id, name, sku').order('name'),
    ])
    setRows((invRes.data as unknown as InventoryRow[]) ?? [])
    setWarehouses((whRes.data as Warehouse[]) ?? [])
    setProducts((prodRes.data as Product[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function updateField(id: string, field: 'reorder_level' | 'quantity_on_hand', value: number) {
    setSavingId(id)
    await supabase.from('inventory').update({ [field]: value }).eq('id', id)
    await load()
    setSavingId(null)
  }

  function startAdd() {
    setForm({ warehouse_id: '', product_id: '', quantity_on_hand: '0', reorder_level: '10' })
    setFormError(null)
    setShowForm(true)
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setFormError(null)
    const { error } = await supabase.from('inventory').insert({
      warehouse_id: form.warehouse_id,
      product_id: form.product_id,
      quantity_on_hand: Number(form.quantity_on_hand),
      reorder_level: Number(form.reorder_level),
    })
    if (error) {
      setFormError(error.message.includes('uq_inventory_wh_product_variant')
        ? 'This product already has an inventory record at that warehouse — edit it below instead.'
        : error.message)
      setSaving(false)
      return
    }
    setShowForm(false)
    setSaving(false)
    load()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Inventory</h1>
          <p className="mt-1 text-sm text-ink/60">
            Stock on hand across all warehouses, lowest first.
            {isSuperAdmin && ' Super admin can correct stock counts directly below.'}
          </p>
        </div>
        <button className="btn-primary" onClick={showForm ? () => setShowForm(false) : startAdd}>
          {showForm ? 'Cancel' : '+ Add inventory record'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="card grid grid-cols-4 gap-4">
          <div><label className="mb-1 block text-xs font-medium text-ink/70">Warehouse</label>
            <select required className="input" value={form.warehouse_id} onChange={(e) => setForm({ ...form, warehouse_id: e.target.value })}>
              <option value="">Select…</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select></div>
          <div><label className="mb-1 block text-xs font-medium text-ink/70">Product</label>
            <select required className="input" value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })}>
              <option value="">Select…</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
            </select></div>
          <div><label className="mb-1 block text-xs font-medium text-ink/70">Initial quantity</label>
            <input required type="number" min="0" className="input" value={form.quantity_on_hand} onChange={(e) => setForm({ ...form, quantity_on_hand: e.target.value })} /></div>
          <div><label className="mb-1 block text-xs font-medium text-ink/70">Reorder level</label>
            <input required type="number" min="0" className="input" value={form.reorder_level} onChange={(e) => setForm({ ...form, reorder_level: e.target.value })} /></div>

          {formError && <p className="col-span-4 rounded-md bg-brick-100 px-3 py-2 text-sm text-brick-700">{formError}</p>}
          <div className="col-span-4 flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Create record'}</button>
            <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
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
                <th className="th">Product</th>
                <th className="th">Warehouse</th>
                <th className="th text-right">On hand</th>
                <th className="th text-right">Reserved</th>
                <th className="th text-right">Reorder level</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const low = r.quantity_on_hand <= r.reorder_level
                return (
                  <tr key={r.id} className={low ? 'border-l-2 border-l-marigold-500' : ''}>
                    <td className="td">
                      <p className="font-medium">{r.products?.name}</p>
                      <p className="font-mono text-xs text-ink/40">{r.products?.sku}</p>
                    </td>
                    <td className="td text-ink/60">{r.warehouses?.name}</td>
                    <td className={`td text-right ${low ? 'text-brick-500 font-medium' : ''}`}>
                      {isSuperAdmin ? (
                        <input
                          type="number"
                          className="input w-24 py-1 text-right font-mono text-xs"
                          defaultValue={r.quantity_on_hand}
                          disabled={savingId === r.id}
                          onBlur={(e) => {
                            const value = Number(e.target.value)
                            if (value !== r.quantity_on_hand) updateField(r.id, 'quantity_on_hand', value)
                          }}
                        />
                      ) : (
                        <span className="font-mono">{r.quantity_on_hand}</span>
                      )}
                    </td>
                    <td className="td text-right font-mono text-ink/50">{r.quantity_reserved}</td>
                    <td className="td text-right">
                      <input
                        type="number"
                        className="input w-20 py-1 text-right font-mono text-xs"
                        defaultValue={r.reorder_level}
                        disabled={savingId === r.id}
                        onBlur={(e) => {
                          const value = Number(e.target.value)
                          if (value !== r.reorder_level) updateField(r.id, 'reorder_level', value)
                        }}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
