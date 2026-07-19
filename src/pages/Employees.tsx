import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

interface Employee {
  id: string
  employee_code: string
  date_of_joining: string
  salary_monthly: number | null
  status: string
  department_id: string | null
  designation_id: string | null
  user_profiles: { full_name: string | null; phone: string | null; role: string } | null
  departments: { name: string } | null
  designations: { title: string } | null
}

interface Department { id: string; name: string }
interface Designation { id: string; title: string; department_id: string }

const emptyCreateForm = {
  email: '', password: '', full_name: '', phone: '', role: 'employee',
  employee_code: '', department_id: '', designation_id: '', salary_monthly: '',
}

export default function Employees() {
  const { profile } = useAuth()
  const isSuperAdmin = profile?.role === 'super_admin'

  const [employees, setEmployees] = useState<Employee[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [designations, setDesignations] = useState<Designation[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)

  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createForm, setCreateForm] = useState(emptyCreateForm)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const [empRes, deptRes, desigRes] = await Promise.all([
      supabase.from('employees').select('id, employee_code, date_of_joining, salary_monthly, status, department_id, designation_id, user_profiles(full_name, phone, role), departments(name), designations(title)').order('date_of_joining', { ascending: false }),
      supabase.from('departments').select('id, name').order('name'),
      supabase.from('designations').select('id, title, department_id').order('title'),
    ])
    setEmployees((empRes.data as unknown as Employee[]) ?? [])
    setDepartments((deptRes.data as Department[]) ?? [])
    setDesignations((desigRes.data as Designation[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function updateStatus(id: string, status: string) {
    setSavingId(id)
    await supabase.from('employees').update({ status }).eq('id', id)
    await load()
    setSavingId(null)
  }

  async function updateSalary(id: string, salary: number) {
    setSavingId(id)
    await supabase.from('employees').update({ salary_monthly: salary }).eq('id', id)
    await load()
    setSavingId(null)
  }

  async function updateDeptDesig(id: string, department_id: string, designation_id: string) {
    setSavingId(id)
    await supabase.from('employees').update({ department_id: department_id || null, designation_id: designation_id || null }).eq('id', id)
    await load()
    setSavingId(null)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setCreateError(null)
    const { error } = await supabase.rpc('fn_create_staff_member', {
      p_email: createForm.email,
      p_password: createForm.password,
      p_full_name: createForm.full_name,
      p_role: createForm.role,
      p_employee_code: createForm.employee_code,
      p_department_id: createForm.department_id || null,
      p_designation_id: createForm.designation_id || null,
      p_salary_monthly: createForm.salary_monthly ? Number(createForm.salary_monthly) : null,
      p_phone: createForm.phone || null,
    })
    if (error) {
      setCreateError(error.message)
      setCreating(false)
      return
    }
    setCreateForm(emptyCreateForm)
    setShowCreateForm(false)
    setCreating(false)
    load()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Employees</h1>
          <p className="mt-1 text-sm text-ink/60">
            {employees.length} staff on record.
            {!isSuperAdmin && ' Only super admins can create or edit employee records.'}
          </p>
        </div>
        {isSuperAdmin && (
          <button className="btn-primary" onClick={showCreateForm ? () => setShowCreateForm(false) : () => { setCreateForm(emptyCreateForm); setCreateError(null); setShowCreateForm(true) }}>
            {showCreateForm ? 'Cancel' : '+ Add employee'}
          </button>
        )}
      </div>

      {showCreateForm && isSuperAdmin && (
        <form onSubmit={handleCreate} className="card grid grid-cols-3 gap-4">
          <p className="col-span-3 font-display text-sm font-semibold text-ink/70">New staff account</p>
          <div><label className="mb-1 block text-xs font-medium text-ink/70">Full name</label>
            <input required className="input" value={createForm.full_name} onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })} /></div>
          <div><label className="mb-1 block text-xs font-medium text-ink/70">Email (login)</label>
            <input required type="email" className="input" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} /></div>
          <div><label className="mb-1 block text-xs font-medium text-ink/70">Temporary password</label>
            <input required type="text" className="input" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} placeholder="They should change this after first login" /></div>
          <div><label className="mb-1 block text-xs font-medium text-ink/70">Phone</label>
            <input className="input" value={createForm.phone} onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })} /></div>
          <div><label className="mb-1 block text-xs font-medium text-ink/70">Role</label>
            <select className="input" value={createForm.role} onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}>
              <option value="employee">Employee</option>
              <option value="store_manager">Store manager</option>
              <option value="warehouse_manager">Warehouse manager</option>
              <option value="support_agent">Support agent</option>
              <option value="delivery_partner">Delivery partner</option>
              <option value="super_admin">Super admin</option>
            </select></div>
          <div><label className="mb-1 block text-xs font-medium text-ink/70">Employee code</label>
            <input required={createForm.role !== 'delivery_partner'} className="input" value={createForm.employee_code} onChange={(e) => setCreateForm({ ...createForm, employee_code: e.target.value })} placeholder="EMP-XXX" disabled={createForm.role === 'delivery_partner'} /></div>
          <div><label className="mb-1 block text-xs font-medium text-ink/70">Department</label>
            <select className="input" value={createForm.department_id} onChange={(e) => setCreateForm({ ...createForm, department_id: e.target.value })} disabled={createForm.role === 'delivery_partner'}>
              <option value="">None</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select></div>
          <div><label className="mb-1 block text-xs font-medium text-ink/70">Designation</label>
            <select className="input" value={createForm.designation_id} onChange={(e) => setCreateForm({ ...createForm, designation_id: e.target.value })} disabled={createForm.role === 'delivery_partner'}>
              <option value="">None</option>
              {designations.filter((d) => !createForm.department_id || d.department_id === createForm.department_id).map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
            </select></div>
          <div><label className="mb-1 block text-xs font-medium text-ink/70">Monthly salary (₹)</label>
            <input type="number" className="input" value={createForm.salary_monthly} onChange={(e) => setCreateForm({ ...createForm, salary_monthly: e.target.value })} disabled={createForm.role === 'delivery_partner'} /></div>

          {createError && <p className="col-span-3 rounded-md bg-brick-100 px-3 py-2 text-sm text-brick-700">{createError}</p>}
          <div className="col-span-3 flex gap-2">
            <button type="submit" disabled={creating} className="btn-primary">{creating ? 'Creating…' : 'Create account'}</button>
            <button type="button" className="btn-secondary" onClick={() => setShowCreateForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="card overflow-hidden !p-0">
        {loading ? <p className="p-5 text-sm text-ink/50">Loading…</p> : (
          <table className="w-full">
            <thead><tr>
              <th className="th">Employee</th><th className="th">Role</th><th className="th">Department</th>
              <th className="th">Designation</th><th className="th text-right">Salary</th><th className="th">Status</th>
            </tr></thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id}>
                  <td className="td">
                    <p className="font-medium">{e.user_profiles?.full_name ?? '—'}</p>
                    <p className="font-mono text-xs text-ink/40">{e.employee_code}</p>
                  </td>
                  <td className="td text-ink/60">{e.user_profiles?.role.replace('_', ' ')}</td>
                  <td className="td">
                    {isSuperAdmin ? (
                      <select className="input py-1 text-xs" value={e.department_id ?? ''} disabled={savingId === e.id}
                        onChange={(ev) => updateDeptDesig(e.id, ev.target.value, e.designation_id ?? '')}>
                        <option value="">None</option>
                        {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    ) : (e.departments?.name ?? '—')}
                  </td>
                  <td className="td">
                    {isSuperAdmin ? (
                      <select className="input py-1 text-xs" value={e.designation_id ?? ''} disabled={savingId === e.id}
                        onChange={(ev) => updateDeptDesig(e.id, e.department_id ?? '', ev.target.value)}>
                        <option value="">None</option>
                        {designations.filter((d) => !e.department_id || d.department_id === e.department_id).map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
                      </select>
                    ) : (e.designations?.title ?? '—')}
                  </td>
                  <td className="td text-right">
                    {isSuperAdmin ? (
                      <input
                        type="number" className="input w-24 py-1 text-right font-mono text-xs"
                        defaultValue={e.salary_monthly ?? 0} disabled={savingId === e.id}
                        onBlur={(ev) => {
                          const v = Number(ev.target.value)
                          if (v !== e.salary_monthly) updateSalary(e.id, v)
                        }}
                      />
                    ) : (
                      <span className="font-mono">₹{e.salary_monthly ?? '—'}</span>
                    )}
                  </td>
                  <td className="td">
                    {isSuperAdmin ? (
                      <select className="input py-1 text-xs" value={e.status} disabled={savingId === e.id} onChange={(ev) => updateStatus(e.id, ev.target.value)}>
                        <option value="active">Active</option>
                        <option value="on_leave">On leave</option>
                        <option value="terminated">Terminated</option>
                      </select>
                    ) : (
                      <span className="stamp border-line text-ink/60">{e.status.replace('_', ' ')}</span>
                    )}
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
