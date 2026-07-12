import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

interface Employee {
  id: string
  employee_code: string
  date_of_joining: string
  salary_monthly: number | null
  status: string
  user_profiles: { full_name: string | null; phone: string | null; role: string } | null
  departments: { name: string } | null
  designations: { title: string } | null
}

export default function Employees() {
  const { profile } = useAuth()
  const isSuperAdmin = profile?.role === 'super_admin'

  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('employees')
      .select('id, employee_code, date_of_joining, salary_monthly, status, user_profiles(full_name, phone, role), departments(name), designations(title)')
      .order('date_of_joining', { ascending: false })
    setEmployees((data as unknown as Employee[]) ?? [])
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Employees</h1>
        <p className="mt-1 text-sm text-ink/60">
          {employees.length} staff on record.
          {!isSuperAdmin && ' Only super admins can edit employee records.'}
        </p>
      </div>

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
                  <td className="td text-ink/60">{e.departments?.name ?? '—'}</td>
                  <td className="td text-ink/60">{e.designations?.title ?? '—'}</td>
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
