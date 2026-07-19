import { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { supabase, supabaseReporting } from '../lib/supabase'
import { useAuth } from '../lib/auth'

type Granularity = 'hour' | 'day' | 'week' | 'month'

interface SalesBucket { bucket: string; order_count: number; revenue: number }
interface TopProduct { product_id: string; product_name: string; units_sold: number; revenue: number }
interface TopCustomer { customer_id: string; full_name: string | null; phone: string | null; order_count: number; total_spent: number }
interface TopLocation { lat_bucket: number; lng_bucket: number; city: string | null; order_count: number; revenue: number }
interface LowStock { product_name: string; warehouse_name: string; quantity_on_hand: number; reorder_level: number }

const GRANULARITY_CONFIG: Record<Granularity, { label: string; lookbackMs: number; formatter: (d: Date) => string }> = {
  hour: { label: 'Hourly', lookbackMs: 48 * 60 * 60 * 1000, formatter: (d) => d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) },
  day: { label: 'Daily', lookbackMs: 30 * 24 * 60 * 60 * 1000, formatter: (d) => d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) },
  week: { label: 'Weekly', lookbackMs: 84 * 24 * 60 * 60 * 1000, formatter: (d) => d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) },
  month: { label: 'Monthly', lookbackMs: 365 * 24 * 60 * 60 * 1000, formatter: (d) => d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }) },
}

function formatINR(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

export default function Analytics() {
  const { profile } = useAuth()
  const isSuperAdmin = profile?.role === 'super_admin'

  const [granularity, setGranularity] = useState<Granularity>('day')
  const [chartStyle, setChartStyle] = useState<'bar' | 'line'>('bar')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [sales, setSales] = useState<SalesBucket[]>([])
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [topCustomers, setTopCustomers] = useState<TopCustomer[]>([])
  const [topLocations, setTopLocations] = useState<TopLocation[]>([])
  const [lowStock, setLowStock] = useState<LowStock[]>([])

  const range = useMemo(() => {
    const end = new Date()
    const start = new Date(end.getTime() - GRANULARITY_CONFIG[granularity].lookbackMs)
    return { start: start.toISOString(), end: end.toISOString() }
  }, [granularity])

  useEffect(() => {
    if (!isSuperAdmin) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      const [salesRes, prodRes, custRes, locRes, stockRes] = await Promise.all([
        supabase.rpc('fn_sales_over_time', { p_granularity: granularity, p_range_start: range.start, p_range_end: range.end }),
        supabase.rpc('fn_top_products', { p_range_start: range.start, p_range_end: range.end, p_limit: 10 }),
        supabase.rpc('fn_top_customers', { p_range_start: range.start, p_range_end: range.end, p_limit: 10 }),
        supabase.rpc('fn_top_locations', { p_range_start: range.start, p_range_end: range.end, p_limit: 10 }),
        supabaseReporting.from('v_low_stock_alerts').select('product_name, warehouse_name, quantity_on_hand, reorder_level'),
      ])

      if (cancelled) return

      const firstError = salesRes.error || prodRes.error || custRes.error || locRes.error || stockRes.error
      if (firstError) {
        setError(firstError.message)
        setLoading(false)
        return
      }

      setSales((salesRes.data as SalesBucket[]) ?? [])
      setTopProducts((prodRes.data as TopProduct[]) ?? [])
      setTopCustomers((custRes.data as TopCustomer[]) ?? [])
      setTopLocations((locRes.data as TopLocation[]) ?? [])
      setLowStock(
        ((stockRes.data as LowStock[]) ?? [])
          .sort((a, b) => (b.reorder_level - b.quantity_on_hand) - (a.reorder_level - a.quantity_on_hand))
          .slice(0, 10)
      )
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [granularity, range, isSuperAdmin])

  if (!isSuperAdmin) {
    return (
      <div className="card max-w-md">
        <h1 className="font-display text-lg font-semibold">Access restricted</h1>
        <p className="mt-2 text-sm text-ink/60">
          Analytics & Reports is only available to super admins.
        </p>
      </div>
    )
  }

  const chartData = sales.map((s) => ({
    label: GRANULARITY_CONFIG[granularity].formatter(new Date(s.bucket)),
    revenue: Math.round(s.revenue),
    orders: s.order_count,
  }))

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Analytics & Reports</h1>
          <p className="mt-1 text-sm text-ink/60">Super admin only.</p>
        </div>
        <div className="flex gap-2">
          {(Object.keys(GRANULARITY_CONFIG) as Granularity[]).map((g) => (
            <button
              key={g}
              onClick={() => setGranularity(g)}
              className={`stamp cursor-pointer ${granularity === g ? 'border-crate-500 bg-crate-500 text-white' : 'border-line text-ink/60'}`}
            >
              {GRANULARITY_CONFIG[g].label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="rounded-md bg-brick-100 px-3 py-2 text-sm text-brick-700">{error}</p>}

      <div className="card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-base font-semibold">
            Sales — {GRANULARITY_CONFIG[granularity].label.toLowerCase()}
          </h2>
          <div className="flex gap-2">
            <button onClick={() => setChartStyle('bar')} className={`stamp cursor-pointer ${chartStyle === 'bar' ? 'border-crate-500 bg-crate-500 text-white' : 'border-line text-ink/60'}`}>bar</button>
            <button onClick={() => setChartStyle('line')} className={`stamp cursor-pointer ${chartStyle === 'line' ? 'border-crate-500 bg-crate-500 text-white' : 'border-line text-ink/60'}`}>line</button>
          </div>
        </div>
        {loading ? (
          <p className="text-sm text-ink/50">Loading…</p>
        ) : chartData.length === 0 ? (
          <p className="text-sm text-ink/50">No orders in this range.</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            {chartStyle === 'bar' ? (
              <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E4DD" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} />
                <YAxis tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} tickFormatter={(v) => `₹${v / 1000}k`} />
                <Tooltip formatter={(v: number, name: string) => (name === 'revenue' ? formatINR(v) : v)} contentStyle={{ fontFamily: 'Inter', fontSize: 12, borderRadius: 6, borderColor: '#E2E4DD' }} />
                <Bar dataKey="revenue" fill="#1B6B4A" radius={[3, 3, 0, 0]} />
              </BarChart>
            ) : (
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E4DD" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} />
                <YAxis tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} tickFormatter={(v) => `₹${v / 1000}k`} />
                <Tooltip formatter={(v: number, name: string) => (name === 'revenue' ? formatINR(v) : v)} contentStyle={{ fontFamily: 'Inter', fontSize: 12, borderRadius: 6, borderColor: '#E2E4DD' }} />
                <Line type="monotone" dataKey="revenue" stroke="#1B6B4A" strokeWidth={2} dot={false} />
              </LineChart>
            )}
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="card">
          <h2 className="mb-4 font-display text-base font-semibold">Top 10 sold products</h2>
          {loading ? <p className="text-sm text-ink/50">Loading…</p> : topProducts.length === 0 ? <p className="text-sm text-ink/50">No sales in this range.</p> : (
            <table className="w-full">
              <thead><tr><th className="th">#</th><th className="th">Product</th><th className="th text-right">Units</th><th className="th text-right">Revenue</th></tr></thead>
              <tbody>
                {topProducts.map((p, i) => (
                  <tr key={p.product_id}>
                    <td className="td font-mono text-xs text-ink/40">{i + 1}</td>
                    <td className="td">{p.product_name}</td>
                    <td className="td text-right font-mono">{p.units_sold}</td>
                    <td className="td text-right font-mono">{formatINR(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h2 className="mb-4 font-display text-base font-semibold">Top 10 low stock products</h2>
          {loading ? <p className="text-sm text-ink/50">Loading…</p> : lowStock.length === 0 ? <p className="text-sm text-ink/50">Nothing below reorder level.</p> : (
            <table className="w-full">
              <thead><tr><th className="th">#</th><th className="th">Product</th><th className="th">Warehouse</th><th className="th text-right">On hand</th></tr></thead>
              <tbody>
                {lowStock.map((s, i) => (
                  <tr key={`${s.product_name}-${s.warehouse_name}`} className="border-l-2 border-l-marigold-500">
                    <td className="td font-mono text-xs text-ink/40">{i + 1}</td>
                    <td className="td">{s.product_name}</td>
                    <td className="td text-ink/60">{s.warehouse_name}</td>
                    <td className="td text-right font-mono text-brick-500">{s.quantity_on_hand}/{s.reorder_level}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h2 className="mb-4 font-display text-base font-semibold">Top 10 locations</h2>
          <p className="mb-3 text-xs text-ink/40">Clustered by delivery coordinates (~100m grid cells).</p>
          {loading ? <p className="text-sm text-ink/50">Loading…</p> : topLocations.length === 0 ? <p className="text-sm text-ink/50">No orders in this range.</p> : (
            <table className="w-full">
              <thead><tr><th className="th">#</th><th className="th">Area</th><th className="th text-right">Orders</th><th className="th text-right">Revenue</th></tr></thead>
              <tbody>
                {topLocations.map((l, i) => (
                  <tr key={`${l.lat_bucket}-${l.lng_bucket}`}>
                    <td className="td font-mono text-xs text-ink/40">{i + 1}</td>
                    <td className="td">
                      {l.city ?? 'Unknown'}
                      <span className="ml-1 font-mono text-xs text-ink/40">({l.lat_bucket}, {l.lng_bucket})</span>
                    </td>
                    <td className="td text-right font-mono">{l.order_count}</td>
                    <td className="td text-right font-mono">{formatINR(l.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h2 className="mb-4 font-display text-base font-semibold">Top 10 customers</h2>
          {loading ? <p className="text-sm text-ink/50">Loading…</p> : topCustomers.length === 0 ? <p className="text-sm text-ink/50">No orders in this range.</p> : (
            <table className="w-full">
              <thead><tr><th className="th">#</th><th className="th">Customer</th><th className="th text-right">Orders</th><th className="th text-right">Spent</th></tr></thead>
              <tbody>
                {topCustomers.map((c, i) => (
                  <tr key={c.customer_id}>
                    <td className="td font-mono text-xs text-ink/40">{i + 1}</td>
                    <td className="td">{c.full_name ?? '—'}<p className="font-mono text-xs text-ink/40">{c.phone}</p></td>
                    <td className="td text-right font-mono">{c.order_count}</td>
                    <td className="td text-right font-mono">{formatINR(c.total_spent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
