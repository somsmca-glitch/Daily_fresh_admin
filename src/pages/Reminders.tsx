import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

interface Template {
  id: string
  code: string
  channel: string
  body_template: string
  is_active: boolean
}

interface Campaign {
  id: string
  name: string
  channel: string
  template_id: string
  interval_days: number
  grace_days: number
  is_active: boolean
  notification_templates: { code: string } | null
}

interface CustomerOption {
  id: string
  full_name: string | null
  phone: string | null
}

interface SentReminder {
  id: string
  user_id: string
  title: string | null
  body: string
  status: string
  sent_at: string | null
  created_at: string
}

function countParams(bodyTemplate: string): number {
  const matches = bodyTemplate.match(/\{\{\d+\}\}/g)
  if (!matches) return 0
  return new Set(matches).size
}

export default function Reminders() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [history, setHistory] = useState<SentReminder[]>([])
  const [candidateCounts, setCandidateCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  const [sendingCampaign, setSendingCampaign] = useState<string | null>(null)
  const [campaignResult, setCampaignResult] = useState<string | null>(null)

  // new template form
  const [showTemplateForm, setShowTemplateForm] = useState(false)
  const [templateForm, setTemplateForm] = useState({ code: '', channel: 'whatsapp', body_template: '' })
  const [templateSaving, setTemplateSaving] = useState(false)
  const [templateError, setTemplateError] = useState<string | null>(null)

  // new campaign form
  const [showCampaignForm, setShowCampaignForm] = useState(false)
  const [campaignForm, setCampaignForm] = useState({ name: '', template_id: '', interval_days: '30', grace_days: '7' })
  const [campaignSaving, setCampaignSaving] = useState(false)
  const [campaignError, setCampaignError] = useState<string | null>(null)

  // individual send form
  const [customerSearch, setCustomerSearch] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [singleTemplateId, setSingleTemplateId] = useState('')
  const [singleParams, setSingleParams] = useState<string[]>([])
  const [singleSending, setSingleSending] = useState(false)
  const [singleResult, setSingleResult] = useState<string | null>(null)
  const [singleError, setSingleError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const [tplRes, campRes, custRes, histRes] = await Promise.all([
      supabase.from('notification_templates').select('id, code, channel, body_template, is_active').order('code'),
      supabase.from('reminder_campaigns').select('id, name, channel, template_id, interval_days, grace_days, is_active, notification_templates(code)').order('created_at'),
      supabase.from('user_profiles').select('id, full_name, phone').eq('role', 'customer').not('phone', 'is', null),
      supabase.from('notifications').select('id, user_id, title, body, status, sent_at, created_at').eq('channel', 'whatsapp').order('created_at', { ascending: false }).limit(50),
    ])
    setTemplates((tplRes.data as Template[]) ?? [])
    setCampaigns((campRes.data as unknown as Campaign[]) ?? [])
    setCustomers((custRes.data as CustomerOption[]) ?? [])
    setHistory((histRes.data as SentReminder[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  // candidate counts per active campaign
  useEffect(() => {
    async function loadCounts() {
      const counts: Record<string, number> = {}
      for (const c of campaigns.filter((c) => c.is_active)) {
        const { data } = await supabase.rpc('fn_get_reminder_candidates', { p_campaign_id: c.id })
        counts[c.id] = (data as unknown[])?.length ?? 0
      }
      setCandidateCounts(counts)
    }
    if (campaigns.length > 0) loadCounts()
  }, [campaigns])

  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return []
    const q = customerSearch.toLowerCase()
    return customers
      .filter((c) => c.full_name?.toLowerCase().includes(q) || c.phone?.includes(q))
      .slice(0, 8)
  }, [customerSearch, customers])

  const singleTemplate = templates.find((t) => t.id === singleTemplateId)
  useEffect(() => {
    if (singleTemplate) {
      setSingleParams(Array(countParams(singleTemplate.body_template)).fill(''))
    } else {
      setSingleParams([])
    }
  }, [singleTemplateId])

  async function saveTemplate(e: React.FormEvent) {
    e.preventDefault()
    setTemplateSaving(true)
    setTemplateError(null)
    const { error } = await supabase.from('notification_templates').insert({
      code: templateForm.code,
      channel: templateForm.channel,
      body_template: templateForm.body_template,
    })
    if (error) {
      setTemplateError(error.message)
      setTemplateSaving(false)
      return
    }
    setTemplateForm({ code: '', channel: 'whatsapp', body_template: '' })
    setShowTemplateForm(false)
    setTemplateSaving(false)
    load()
  }

  async function saveCampaign(e: React.FormEvent) {
    e.preventDefault()
    setCampaignSaving(true)
    setCampaignError(null)
    const { error } = await supabase.from('reminder_campaigns').insert({
      name: campaignForm.name,
      template_id: campaignForm.template_id,
      interval_days: Number(campaignForm.interval_days),
      grace_days: Number(campaignForm.grace_days),
    })
    if (error) {
      setCampaignError(error.message)
      setCampaignSaving(false)
      return
    }
    setCampaignForm({ name: '', template_id: '', interval_days: '30', grace_days: '7' })
    setShowCampaignForm(false)
    setCampaignSaving(false)
    load()
  }

  async function toggleCampaignActive(c: Campaign) {
    await supabase.from('reminder_campaigns').update({ is_active: !c.is_active }).eq('id', c.id)
    load()
  }

  async function sendCampaignNow(campaignId: string) {
    setSendingCampaign(campaignId)
    setCampaignResult(null)
    const { data, error } = await supabase.functions.invoke('send-reorder-reminders', {
      body: { mode: 'campaign', campaign_id: campaignId },
    })
    setCampaignResult(error ? error.message : `Sent ${data.sent} of ${data.candidates}${data.failed ? ` (${data.failed} failed)` : ''}.`)
    setSendingCampaign(null)
    load()
  }

  async function sendSingleMessage() {
    if (!selectedCustomerId || !singleTemplate) return
    setSingleSending(true)
    setSingleError(null)
    setSingleResult(null)
    const { data, error } = await supabase.functions.invoke('send-reorder-reminders', {
      body: { mode: 'single', customer_id: selectedCustomerId, template_code: singleTemplate.code, params: singleParams },
    })
    if (error || !data?.ok) {
      setSingleError(error?.message ?? 'Send failed — check WhatsApp credentials/template approval.')
    } else {
      setSingleResult('Message sent.')
      setSelectedCustomerId('')
      setCustomerSearch('')
      setSingleTemplateId('')
      load()
    }
    setSingleSending(false)
  }

  if (loading) return <p className="text-sm text-ink/50">Loading…</p>

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">WhatsApp Reminders</h1>
        <p className="mt-1 text-sm text-ink/60">Campaigns, templates, and one-off messages.</p>
      </div>

      {/* CAMPAIGNS */}
      <div className="card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-base font-semibold">Campaigns</h2>
          <button className="btn-secondary" onClick={() => setShowCampaignForm((s) => !s)}>
            {showCampaignForm ? 'Cancel' : '+ New campaign'}
          </button>
        </div>

        {showCampaignForm && (
          <form onSubmit={saveCampaign} className="mb-4 grid grid-cols-4 gap-3 rounded-md bg-crate-50 p-4">
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium text-ink/70">Name</label>
              <input required className="input" value={campaignForm.name} onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })} placeholder="e.g. We miss you (60 days)" />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium text-ink/70">Template</label>
              <select required className="input" value={campaignForm.template_id} onChange={(e) => setCampaignForm({ ...campaignForm, template_id: e.target.value })}>
                <option value="">Select…</option>
                {templates.filter((t) => t.channel === 'whatsapp').map((t) => (
                  <option key={t.id} value={t.id}>{t.code}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink/70">Days since last order</label>
              <input required type="number" min="1" className="input" value={campaignForm.interval_days} onChange={(e) => setCampaignForm({ ...campaignForm, interval_days: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink/70">Grace window (days)</label>
              <input required type="number" min="0" className="input" value={campaignForm.grace_days} onChange={(e) => setCampaignForm({ ...campaignForm, grace_days: e.target.value })} />
            </div>
            {campaignError && <p className="col-span-4 rounded-md bg-brick-100 px-3 py-2 text-sm text-brick-700">{campaignError}</p>}
            <div className="col-span-4">
              <button type="submit" disabled={campaignSaving} className="btn-primary">{campaignSaving ? 'Saving…' : 'Create campaign'}</button>
            </div>
          </form>
        )}

        {campaignResult && <p className="mb-4 rounded-md bg-crate-50 px-3 py-2 text-sm text-crate-700">{campaignResult}</p>}

        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Campaign</th>
              <th className="th">Template</th>
              <th className="th text-right">Interval</th>
              <th className="th text-right">Due now</th>
              <th className="th">Active</th>
              <th className="th"></th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id}>
                <td className="td font-medium">{c.name}</td>
                <td className="td font-mono text-xs text-ink/60">{c.notification_templates?.code}</td>
                <td className="td text-right text-ink/60">{c.interval_days}d (+{c.grace_days}d grace)</td>
                <td className="td text-right font-mono">{candidateCounts[c.id] ?? '—'}</td>
                <td className="td">
                  <button onClick={() => toggleCampaignActive(c)} className={`stamp cursor-pointer ${c.is_active ? 'border-crate-300 bg-crate-50 text-crate-700' : 'border-line text-ink/50'}`}>
                    {c.is_active ? 'active' : 'paused'}
                  </button>
                </td>
                <td className="td text-right">
                  <button
                    className="btn-primary px-3 py-1.5 text-xs"
                    disabled={!c.is_active || sendingCampaign === c.id || !candidateCounts[c.id]}
                    onClick={() => sendCampaignNow(c.id)}
                  >
                    {sendingCampaign === c.id ? 'Sending…' : 'Send now'}
                  </button>
                </td>
              </tr>
            ))}
            {campaigns.length === 0 && (
              <tr><td className="td text-ink/50" colSpan={6}>No campaigns yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* TEMPLATES */}
      <div className="card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-base font-semibold">Templates</h2>
          <button className="btn-secondary" onClick={() => setShowTemplateForm((s) => !s)}>
            {showTemplateForm ? 'Cancel' : '+ New template'}
          </button>
        </div>

        {showTemplateForm && (
          <form onSubmit={saveTemplate} className="mb-4 grid grid-cols-3 gap-3 rounded-md bg-crate-50 p-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink/70">Code (must match Meta template name exactly)</label>
              <input required className="input" value={templateForm.code} onChange={(e) => setTemplateForm({ ...templateForm, code: e.target.value })} placeholder="e.g. winback_60_day" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink/70">Channel</label>
              <select className="input" value={templateForm.channel} onChange={(e) => setTemplateForm({ ...templateForm, channel: e.target.value })}>
                <option value="whatsapp">WhatsApp</option>
                <option value="sms">SMS</option>
                <option value="push">Push</option>
                <option value="email">Email</option>
              </select>
            </div>
            <div className="col-span-3">
              <label className="mb-1 block text-xs font-medium text-ink/70">Body (use {'{{1}}'}, {'{{2}}'}… for parameters — must match what's approved in Meta)</label>
              <textarea required className="input" rows={2} value={templateForm.body_template} onChange={(e) => setTemplateForm({ ...templateForm, body_template: e.target.value })} />
            </div>
            {templateError && <p className="col-span-3 rounded-md bg-brick-100 px-3 py-2 text-sm text-brick-700">{templateError}</p>}
            <div className="col-span-3">
              <button type="submit" disabled={templateSaving} className="btn-primary">{templateSaving ? 'Saving…' : 'Save template'}</button>
            </div>
          </form>
        )}

        <div className="space-y-2">
          {templates.map((t) => (
            <div key={t.id} className="rounded-md border border-line p-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-medium">{t.code}</span>
                <span className="stamp border-line text-ink/50">{t.channel}</span>
              </div>
              <p className="mt-1 text-sm text-ink/60">{t.body_template}</p>
            </div>
          ))}
        </div>
      </div>

      {/* SEND TO INDIVIDUAL */}
      <div className="card">
        <h2 className="mb-4 font-display text-base font-semibold">Send to an individual customer</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="relative">
            <label className="mb-1 block text-xs font-medium text-ink/70">Customer</label>
            <input
              className="input"
              placeholder="Search by name or phone…"
              value={selectedCustomerId ? customerSearch : customerSearch}
              onChange={(e) => { setCustomerSearch(e.target.value); setSelectedCustomerId('') }}
            />
            {customerSearch && !selectedCustomerId && filteredCustomers.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full rounded-md border border-line bg-surface shadow-md">
                {filteredCustomers.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-crate-50"
                      onClick={() => { setSelectedCustomerId(c.id); setCustomerSearch(`${c.full_name ?? 'Unnamed'} (${c.phone})`) }}
                    >
                      {c.full_name ?? 'Unnamed'} <span className="text-ink/40">— {c.phone}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink/70">Template</label>
            <select className="input" value={singleTemplateId} onChange={(e) => setSingleTemplateId(e.target.value)}>
              <option value="">Select…</option>
              {templates.filter((t) => t.channel === 'whatsapp').map((t) => (
                <option key={t.id} value={t.id}>{t.code}</option>
              ))}
            </select>
          </div>

          {singleTemplate && singleParams.map((val, i) => (
            <div key={i}>
              <label className="mb-1 block text-xs font-medium text-ink/70">Param {'{{' + (i + 1) + '}}'}</label>
              <input
                className="input"
                value={val}
                onChange={(e) => {
                  const next = [...singleParams]
                  next[i] = e.target.value
                  setSingleParams(next)
                }}
              />
            </div>
          ))}
        </div>

        {singleError && <p className="mt-3 rounded-md bg-brick-100 px-3 py-2 text-sm text-brick-700">{singleError}</p>}
        {singleResult && <p className="mt-3 rounded-md bg-crate-50 px-3 py-2 text-sm text-crate-700">{singleResult}</p>}

        <button
          className="btn-primary mt-4"
          disabled={!selectedCustomerId || !singleTemplateId || singleSending}
          onClick={sendSingleMessage}
        >
          {singleSending ? 'Sending…' : 'Send message'}
        </button>
      </div>

      {/* HISTORY */}
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
                <th className="th">Title</th>
                <th className="th">Status</th>
                <th className="th">Detail</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td className="td text-ink/60">{h.sent_at ? new Date(h.sent_at).toLocaleString('en-IN') : '—'}</td>
                  <td className="td">{h.title ?? '—'}</td>
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
