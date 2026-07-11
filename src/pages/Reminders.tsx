import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface Candidate {
  customer_id: string
  phone: string
  full_name: string | null
  last_order_id: string
  last_order_placed_at: string
  days_since_order: number
}

interface SentReminder {
  id: string
  user_id: string
  body: string
  status: string
  sent_at: string | null
  created_at: string
}

export default function Reminders() {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [history, setHistory] = useState<SentReminder[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const [candRes, histRes] = await Promise.all([
      supabase.rpc('fn_get_reorder_reminder_candidates'),
      supabase
        .from('notifications')
        .select('id, user_id, body, status, sent_at, created_at')
        .eq('channel', 'whatsapp')
        .order('created_at', { ascending: false })
        .limit(50),
    ])
    setCandidates((candRes.data as Candidate[]) ?? [])
    setHistory((histRes.data as SentReminder[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function sendNow() {
    setSending(true)
    setResult(null)
    setError(null)
    const { data, error: fnError } = await supabase.functions.invoke('send-reorder-reminders', {
      method: 'POST',
    })
    if (fnError) {
      setError(fnError.message)
    } else {
      setResult(`Sent ${data.sent} of ${data.candidates} reminders${data.failed ? ` (${data.failed} failed)` : ''}.`)
    }
    setSending(false)
    load()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">WhatsApp Reminders</h1>
          <p className="mt-1 text-sm text-ink/60">
            Customers whose last order was ~30 days ago and haven't reordered since.
          </p>
        </div>
        <button className="btn-primary" onClick={sendNow} disabled={sending || candidates.length === 0}>
          {sending ? 'Sending…' : `Send reminders now (${candidates.length})`}
        </button>
      </div>

      {result && <p className="rounded-md bg-crate-50 px-3 py-2 text-sm text-crate-700">{result}</p>}
      {error && <p className="rounded-md bg-brick-100 px-3 py-2 text-sm text-brick-700">{error}</p>}

      <div className="card overflow-hidden !p-0">
        <div className="border-b border-line p-4">
          <h2 className="font-display text-base font-semibold">Due today ({candidates.length})</h2>
        </div>
        {loading ? (
          <p className="p-5 text-sm text-ink/50">Loading…</p>
        ) : candidates.length === 0 ? (
          <p className="p-5 text-sm text-ink/50">No one is due for a reminder right now.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Customer</th>
                <th className="th">Phone</th>
                <th className="th text-right">Last order</th>
                <th className="th text-right">Days since</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => (
                <tr key={c.customer_id}>
                  <td className="td">{c.full_name ?? '—'}</td>
                  <td className="td font-mono text-xs">{c.phone}</td>
                  <td className="td text-right text-ink/60">
                    {new Date(c.last_order_placed_at).toLocaleDateString('en-IN')}
                  </td>
                  <td className="td text-right font-mono">{c.days_since_order}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card overflow-hidden !p-0">
        <div className="border-b border-line p-4">
          <h2 className="font-display text-base font-semibold">Recent sends</h2>
        </div>
        {history.length === 0 ? (
          <p className="p-5 text-sm text-ink/50">No reminders sent yet.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">When</th>
                <th className="th">Status</th>
                <th className="th">Detail</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td className="td text-ink/60">
                    {h.sent_at ? new Date(h.sent_at).toLocaleString('en-IN') : '—'}
                  </td>
                  <td className="td">
                    <span className={`stamp ${h.status === 'sent' ? 'border-crate-300 bg-crate-50 text-crate-700' : 'border-brick-500 bg-brick-100 text-brick-700'}`}>
                      {h.status}
                    </span>
                  </td>
                  <td className="td font-mono text-xs text-ink/50">{h.body}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
