import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { InventoryRow } from '../lib/types'

export default function Inventory() {
  const { profile } = useAuth()
  const isSuperAdmin = profile?.role === 'super_admin'

  const [rows, setRows] = useState<InventoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('inventory')
      .select('id, warehouse_id, product_id, variant_id, quantity_on_hand, quantity_reserved, reorder_level, updated_at, products(name, sku), warehouses(name)')
      .order('quantity_on_hand', { ascending: true })
    setRows((data as unknown as InventoryRow[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function updateField(id: string, field: 'reorder_level' | 'quantity_on_hand', value: number) {
    setSavingId(id)
    await supabase.from('inventory').update({ [field]: value }).eq('id', id)
    await load()
    setSavingId(null)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Inventory</h1>
        <p className="mt-1 text-sm text-ink/60">
          Stock on hand across all warehouses, lowest first.
          {isSuperAdmin && ' Super admin can correct stock counts directly below.'}
        </p>
      </div>

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
