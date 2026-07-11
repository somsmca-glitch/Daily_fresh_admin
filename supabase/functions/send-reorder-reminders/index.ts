// supabase/functions/send-reorder-reminders/index.ts
//
// Finds customers due for a "reorder reminder" (via
// app.fn_get_reorder_reminder_candidates) and sends each one a WhatsApp
// template message through Meta's WhatsApp Cloud API. Logs every attempt
// to app.notifications, which also serves as the de-duplication record.
//
// Can be invoked two ways:
//   1. On a schedule, by pg_cron (server-to-server, using the service role
//      key — see the SQL at the bottom of the setup guide in the README).
//   2. On demand, from the admin panel ("Send reminders now" button), using
//      the signed-in staff member's session — this function checks their
//      role in app.user_profiles before doing anything.
//
// Required secrets (set via `supabase secrets set` or the Dashboard):
//   WHATSAPP_ACCESS_TOKEN   — Meta permanent/system-user access token
//   WHATSAPP_PHONE_NUMBER_ID — the "from" number's Phone Number ID
//   REORDER_LINK            — URL to send customers to reorder (your
//                              storefront or Flutter app deep link)

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const WHATSAPP_ACCESS_TOKEN = Deno.env.get('WHATSAPP_ACCESS_TOKEN')
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')
const REORDER_LINK = Deno.env.get('REORDER_LINK') ?? 'https://dailyfresh.example.com/reorder'
const WHATSAPP_TEMPLATE_NAME = Deno.env.get('WHATSAPP_TEMPLATE_NAME') ?? 'reorder_reminder'
const WHATSAPP_TEMPLATE_LANG = Deno.env.get('WHATSAPP_TEMPLATE_LANG') ?? 'en'

interface Candidate {
  customer_id: string
  phone: string
  full_name: string | null
  last_order_id: string
  last_order_placed_at: string
  days_since_order: number
}

async function sendWhatsAppTemplate(phone: string, customerName: string): Promise<{ ok: boolean; detail: unknown }> {
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
        name: WHATSAPP_TEMPLATE_NAME,
        language: { code: WHATSAPP_TEMPLATE_LANG },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: customerName || 'there' },
              { type: 'text', text: REORDER_LINK },
            ],
          },
        ],
      },
    }),
  })

  const detail = await res.json().catch(() => null)
  return { ok: res.ok, detail }
}

async function isStaff(supabase: ReturnType<typeof createClient>, authHeader: string | null): Promise<boolean> {
  // Requests signed with the service role key (pg_cron) are always trusted.
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

  // Candidate lookup + all writes use the service-role-backed client
  // regardless of who called us, since RLS on app.notifications only
  // allows customers to read their own rows, not staff to write others'.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const { data: candidates, error: candErr } = await admin
    .schema('app')
    .rpc('fn_get_reorder_reminder_candidates')

  if (candErr) {
    return new Response(JSON.stringify({ error: candErr.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const results: { customer_id: string; ok: boolean }[] = []

  for (const c of (candidates as Candidate[]) ?? []) {
    const { ok, detail } = await sendWhatsAppTemplate(c.phone, c.full_name ?? '')

    await admin.schema('app').from('notifications').insert({
      user_id: c.customer_id,
      channel: 'whatsapp',
      title: 'Reorder reminder',
      body: `reorder_reminder:${c.last_order_id}:${ok ? 'sent' : 'failed'}`,
      status: ok ? 'sent' : 'failed',
      sent_at: new Date().toISOString(),
    })

    results.push({ customer_id: c.customer_id, ok })
    if (!ok) console.error(`WhatsApp send failed for ${c.customer_id}:`, detail)
  }

  const sent = results.filter((r) => r.ok).length
  const failed = results.length - sent

  return new Response(JSON.stringify({ candidates: results.length, sent, failed }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
