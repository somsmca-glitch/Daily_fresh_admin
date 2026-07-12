// supabase/functions/send-reorder-reminders/index.ts
//
// Two modes, chosen by the request body:
//
//   { mode: "campaign", campaign_id: "<uuid>" }
//     Runs one configured reminder campaign (see app.reminder_campaigns):
//     finds everyone due per that campaign's interval/grace window, sends
//     each one that campaign's template, logs every attempt.
//
//   { mode: "single", customer_id: "<uuid>", template_code: "...", params: ["...", "..."] }
//     Sends one template message to one specific customer right now, with
//     whatever parameter values you supply — for one-off messages outside
//     the interval-based campaign logic.
//
// Called either by pg_cron (server-to-server, service role key) on a
// schedule per campaign, or on demand from the admin panel's Reminders page.
//
// Required secrets: WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID,
// REORDER_LINK (default parameter value used by campaign sends).

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const WHATSAPP_ACCESS_TOKEN = Deno.env.get('WHATSAPP_ACCESS_TOKEN')
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')
const REORDER_LINK = Deno.env.get('REORDER_LINK') ?? 'https://dailyfresh.example.com/reorder'
const WHATSAPP_TEMPLATE_LANG = Deno.env.get('WHATSAPP_TEMPLATE_LANG') ?? 'en'

interface Candidate {
  customer_id: string
  phone: string
  full_name: string | null
  last_order_id: string
  last_order_placed_at: string
  days_since_order: number
}

async function sendWhatsAppTemplate(
  phone: string,
  templateCode: string,
  params: string[]
): Promise<{ ok: boolean; detail: unknown }> {
  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    return { ok: false, detail: 'WhatsApp credentials not configured' }
  }

  const toNumber = phone.replace(/^\+/, '').replace(/\s/g, '')

  const res = await fetch(`https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: toNumber,
      type: 'template',
      template: {
        name: templateCode,
        language: { code: WHATSAPP_TEMPLATE_LANG },
        components: [
          {
            type: 'body',
            parameters: params.map((text) => ({ type: 'text', text })),
          },
        ],
      },
    }),
  })

  const detail = await res.json().catch(() => null)
  return { ok: res.ok, detail }
}

async function isStaff(supabase: ReturnType<typeof createClient>, authHeader: string | null): Promise<boolean> {
  if (authHeader === `Bearer ${SERVICE_ROLE_KEY}`) return true

  const { data: userData } = await supabase.auth.getUser()
  if (!userData?.user) return false

  const { data: profile } = await supabase
    .schema('app')
    .from('user_profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single()

  const staffRoles = ['super_admin', 'store_manager', 'warehouse_manager', 'employee', 'support_agent']
  return !!profile && staffRoles.includes(profile.role as string)
}

Deno.serve(async (req: Request) => {
  const authHeader = req.headers.get('Authorization')

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    global: { headers: authHeader ? { Authorization: authHeader } : {} },
  })

  const staffOk = await isStaff(supabase, authHeader)
  if (!staffOk) {
    return new Response(JSON.stringify({ error: 'Forbidden: staff access only' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const body = await req.json().catch(() => ({}))

  // ---------------------------------------------------------------
  // Mode: single — one message, one customer, right now
  // ---------------------------------------------------------------
  if (body.mode === 'single') {
    const { customer_id, template_code, params } = body
    if (!customer_id || !template_code) {
      return new Response(JSON.stringify({ error: 'customer_id and template_code are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const { data: profile } = await admin
      .schema('app')
      .from('user_profiles')
      .select('phone, full_name')
      .eq('id', customer_id)
      .single()

    if (!profile?.phone) {
      return new Response(JSON.stringify({ error: 'Customer has no phone number on file' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const { ok, detail } = await sendWhatsAppTemplate(profile.phone, template_code, params ?? [])

    await admin.schema('app').from('notifications').insert({
      user_id: customer_id,
      channel: 'whatsapp',
      title: 'Manual message',
      body: `single:${template_code}:${ok ? 'sent' : 'failed'}`,
      status: ok ? 'sent' : 'failed',
      sent_at: new Date().toISOString(),
    })

    if (!ok) console.error(`WhatsApp send failed for ${customer_id}:`, detail)

    return new Response(JSON.stringify({ ok, detail: ok ? undefined : detail }), {
      status: ok ? 200 : 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // ---------------------------------------------------------------
  // Mode: campaign — everyone due per one configured campaign
  // ---------------------------------------------------------------
  if (body.mode === 'campaign') {
    const { campaign_id } = body
    if (!campaign_id) {
      return new Response(JSON.stringify({ error: 'campaign_id is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const { data: campaign, error: campErr } = await admin
      .schema('app')
      .from('reminder_campaigns')
      .select('id, name, channel, is_active, notification_templates(code)')
      .eq('id', campaign_id)
      .single()

    if (campErr || !campaign) {
      return new Response(JSON.stringify({ error: campErr?.message ?? 'Campaign not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const templateCode = (campaign as unknown as { notification_templates: { code: string } }).notification_templates.code

    const { data: candidates, error: candErr } = await admin
      .schema('app')
      .rpc('fn_get_reminder_candidates', { p_campaign_id: campaign_id })

    if (candErr) {
      return new Response(JSON.stringify({ error: candErr.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const results: { customer_id: string; ok: boolean }[] = []

    for (const c of (candidates as Candidate[]) ?? []) {
      const { ok, detail } = await sendWhatsAppTemplate(c.phone, templateCode, [c.full_name ?? 'there', REORDER_LINK])

      await admin.schema('app').from('notifications').insert({
        user_id: c.customer_id,
        channel: 'whatsapp',
        title: campaign.name,
        body: `campaign:${campaign_id}:${c.last_order_id}:${ok ? 'sent' : 'failed'}`,
        status: ok ? 'sent' : 'failed',
        sent_at: new Date().toISOString(),
      })

      results.push({ customer_id: c.customer_id, ok })
      if (!ok) console.error(`WhatsApp send failed for ${c.customer_id}:`, detail)
    }

    const sent = results.filter((r) => r.ok).length
    return new Response(JSON.stringify({ candidates: results.length, sent, failed: results.length - sent }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ error: 'mode must be "campaign" or "single"' }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  })
})
