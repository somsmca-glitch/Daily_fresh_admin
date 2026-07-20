import { useEffect, useState } from 'react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, Cell,
} from 'recharts'
import { supabase, supabaseReporting } from '../lib/supabase'
import type { StorePerformanceRow, LowStockRow, TopProductRow, OrderStatus } from '../lib/types'

function formatINR(n: number | null | undefined) {
  if (n == null) return '₹0'
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

interface OrderForChart {
  placed_at: string
  total_amount: number
  status: OrderStatus
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#E2E4DD',
  accepted: '#CFE4D5',
  packing: '#F0C57A',
  packed: '#E8A33D',
  out_for_delivery: '#6FA989',
  delivered: '#1B6B4A',
  cancelled: '#C0463A',
  returned: '#902F26',
  refunded: '#902F26',
}

export default function Dashboard() {
  const [stores, setStores] = useState<StorePerformanceRow[]>([])
  const [lowStock, setLowStock] = useState<LowStockRow[]>([])
  const [topProducts, setTopProducts] = useState<TopProductRow[]>([])
  const [orders, setOrders] = useState<OrderForChart[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const since = new Date()
      since.setDate(since.getDate() - 30)

      const [storeRes, lowStockRes, topRes, ordersRes] = await Promise.all([
        supabaseReporting.from('v_store_performance').select('*'),
        supabaseReporting.from('v_low_stock_alerts').select('*'),
        supabaseReporting.from('v_top_products_30d').select('*').limit(8),
        supabase.from('orders').select('placed_at, total_amount, status').eq('is_deleted', false).gte('placed_at', since.toISOString()),
      ])
      setStores((storeRes.data as StorePerformanceRow[]) ?? [])
      setLowStock((lowStockRes.data as LowStockRow[]) ?? [])
      setTopProducts((topRes.data as TopProductRow[]) ?? [])
      setOrders((ordersRes.data as OrderForChart[]) ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const totalOrders30d = stores.reduce((sum, s) => sum + (s.orders_30d ?? 0), 0)
  const totalRevenue30d = stores.reduce((sum, s) => sum + (s.revenue_30d ?? 0), 0)

  // Bucket orders (excluding cancelled) by day for the revenue trend line
  const revenueByDay = (() => {
    const buckets = new Map<string, number>()
    for (let i = 29; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      buckets.set(d.toISOString().slice(0, 10), 0)
    }
    orders
      .filter((o) => o.status !== 'cancelled')
      .forEach((o) => {
        const day = o.placed_at.slice(0, 10)
        if (buckets.has(day)) buckets.set(day, (buckets.get(day) ?? 0) + Number(o.total_amount))
      })
    return Array.from(buckets.entries()).map(([date, revenue]) => ({
      date: date.slice(5), // MM-DD
      revenue: Math.round(revenue),
    }))
  })()

  // Orders by status, for the bar chart
  const ordersByStatus = (() => {
    const counts = new Map<string, number>()
    orders.forEach((o) => counts.set(o.status, (counts.get(o.status) ?? 0) + 1))
    return Array.from(counts.entries())
      .map(([status, count]) => ({ status: status.replace(/_/g, ' '), count, raw: status }))
      .sort((a, b) => b.count - a.count)
  })()

  if (loading) return <p className="text-sm text-ink/50">Loading dashboard…</p>

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-ink/60">Last 30 days across all stores.</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="card">
          <p className="font-mono text-[11px] uppercase tracking-wider text-ink/50">Orders (30d)</p>
          <p className="mt-2 font-mono text-3xl font-semibold text-crate-700">{totalOrders30d}</p>
        </div>
        <div className="card">
          <p className="font-mono text-[11px] uppercase tracking-wider text-ink/50">Revenue (30d)</p>
          <p className="mt-2 font-mono text-3xl font-semibold text-crate-700">{formatINR(totalRevenue30d)}</p>
        </div>
        <div className="card">
          <p className="font-mono text-[11px] uppercase tracking-wider text-ink/50">Low stock alerts</p>
          <p className="mt-2 font-mono text-3xl font-semibold text-brick-500">{lowStock.length}</p>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-6">
        <div className="card col-span-3">
          <h2 className="mb-4 font-display text-base font-semibold">Revenue trend (30 days)</h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={revenueByDay} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E4DD" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} interval={4} />
              <YAxis tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} tickFormatter={(v) => `₹${v / 1000}k`} />
              <Tooltip
                formatter={(v: number) => formatINR(v)}
                contentStyle={{ fontFamily: 'Inter', fontSize: 12, borderRadius: 6, borderColor: '#E2E4DD' }}
              />
              <Line type="monotone" dataKey="revenue" stroke="#1B6B4A" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card col-span-2">
          <h2 className="mb-4 font-display text-base font-semibold">Orders by status (30d)</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={ordersByStatus} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
              <XAxis type="number" hide />
              <YAxis
                dataKey="status" type="category" width={90}
                tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }}
              />
              <Tooltip contentStyle={{ fontFamily: 'Inter', fontSize: 12, borderRadius: 6, borderColor: '#E2E4DD' }} />
              <Bar dataKey="count" radius={[0, 3, 3, 0]}>
                {ordersByStatus.map((entry) => (
                  <Cell key={entry.raw} fill={STATUS_COLORS[entry.raw] ?? '#6FA989'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-6">
        <div className="card col-span-3">
          <h2 className="mb-4 font-display text-base font-semibold">Low stock alerts</h2>
          {lowStock.length === 0 ? (
            <p className="text-sm text-ink/50">Nothing below reorder level right now.</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Product</th>
                  <th className="th">Warehouse</th>
                  <th className="th text-right">On hand</th>
                  <th className="th text-right">Reorder at</th>
                </tr>
              </thead>
              <tbody>
                {lowStock.map((row) => (
                  <tr key={`${row.warehouse_id}-${row.product_id}`} className="border-l-2 border-l-marigold-500">
                    <td className="td">{row.product_name}</td>
                    <td className="td text-ink/60">{row.warehouse_name}</td>
                    <td className="td text-right font-mono">{row.quantity_on_hand}</td>
                    <td className="td text-right font-mono text-ink/50">{row.reorder_level}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card col-span-2">
          <h2 className="mb-4 font-display text-base font-semibold">Top products (30d)</h2>
          {topProducts.length === 0 ? (
            <p className="text-sm text-ink/50">No sales recorded yet.</p>
          ) : (
            <ul className="space-y-3">
              {topProducts.map((p, i) => (
                <li key={p.product_id} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-xs text-ink/40">{String(i + 1).padStart(2, '0')}</span>
                    {p.name}
                  </span>
                  <span className="font-mono text-ink/60">{p.units_sold} units</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card">
        <h2 className="mb-4 font-display text-base font-semibold">Store performance</h2>
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Store</th>
              <th className="th text-right">Orders (30d)</th>
              <th className="th text-right">Revenue (30d)</th>
              <th className="th text-right">Avg delivery (min)</th>
            </tr>
          </thead>
          <tbody>
            {stores.map((s) => (
              <tr key={s.store_id}>
                <td className="td">{s.store_name}</td>
                <td className="td text-right font-mono">{s.orders_30d ?? 0}</td>
                <td className="td text-right font-mono">{formatINR(s.revenue_30d)}</td>
                <td className="td text-right font-mono">
                  {s.avg_delivery_minutes ? Math.round(s.avg_delivery_minutes) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
