import { useEffect, useState } from 'react'
import { supabase, supabaseReporting } from '../lib/supabase'
import type { OrderStatus, OrderSummaryRow } from '../lib/types'
import { ORDER_STATUSES } from '../lib/types'
import StatusStamp from '../components/StatusStamp'

function formatINR(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

export default function Orders() {
  const [orders, setOrders] = useState<OrderSummaryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<OrderStatus | 'all'>('all')
  const [updating, setUpdating] = useState<string | null>(null)

  async function loadOrders() {
    setLoading(true)
    const { data } = await supabaseReporting
      .from('v_customer_order_summary')
      .select('*')
      .order('placed_at', { ascending: false })
      .limit(200)
    setOrders((data as OrderSummaryRow[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadOrders()
  }, [])

  async function updateStatus(orderId: string, status: OrderStatus) {
    setUpdating(orderId)
    const { error } = await supabase.from('orders').update({ status }).eq('id', orderId)
    if (!error) await loadOrders()
    setUpdating(null)
  }

  const filtered = filter === 'all' ? orders : orders.filter((o) => o.status === filter)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Orders</h1>
        <p className="mt-1 text-sm text-ink/60">Most recent 200 orders across all stores.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilter('all')}
          className={`stamp cursor-pointer ${filter === 'all' ? 'border-crate-500 bg-crate-500 text-white' : 'border-line text-ink/60'}`}
        >
          all
        </button>
        {ORDER_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`stamp cursor-pointer ${filter === s ? 'border-crate-500 bg-crate-500 text-white' : 'border-line text-ink/60'}`}
          >
            {s.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden !p-0">
        {loading ? (
          <p className="p-5 text-sm text-ink/50">Loading…</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Order</th>
                <th className="th">Store</th>
                <th className="th text-right">Items</th>
                <th className="th text-right">Total</th>
                <th className="th">Status</th>
                <th className="th">Update status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => (
                <tr key={o.order_id}>
                  <td className="td">
                    <p className="font-mono text-xs font-medium">{o.order_number}</p>
                    <p className="text-xs text-ink/40">{new Date(o.placed_at).toLocaleString('en-IN')}</p>
                  </td>
                  <td className="td text-ink/60">{o.store_name}</td>
                  <td className="td text-right font-mono">{o.item_count}</td>
                  <td className="td text-right font-mono font-medium">{formatINR(o.total_amount)}</td>
                  <td className="td"><StatusStamp status={o.status} /></td>
                  <td className="td">
                    <select
                      className="input py-1 text-xs"
                      value={o.status}
                      disabled={updating === o.order_id}
                      onChange={(e) => updateStatus(o.order_id, e.target.value as OrderStatus)}
                    >
                      {ORDER_STATUSES.map((s) => (
                        <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && filtered.length === 0 && (
          <p className="p-5 text-sm text-ink/50">No orders match this filter.</p>
        )}
      </div>
    </div>
  )
}
