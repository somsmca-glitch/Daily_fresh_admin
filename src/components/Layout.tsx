import { type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../lib/auth'

const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [{ to: '/', label: 'Dashboard', icon: '◈' }],
  },
  {
    label: 'Catalog',
    items: [
      { to: '/products', label: 'Products', icon: '▤' },
      { to: '/categories', label: 'Categories & Brands', icon: '▦' },
      { to: '/inventory', label: 'Inventory', icon: '▥' },
      { to: '/suppliers', label: 'Suppliers', icon: '▧' },
    ],
  },
  {
    label: 'Sales',
    items: [
      { to: '/orders', label: 'Orders', icon: '▣' },
      { to: '/customers', label: 'Customers', icon: '◐' },
      { to: '/coupons', label: 'Coupons & Offers', icon: '◆' },
      { to: '/reminders', label: 'Reminders', icon: '◔' },
    ],
  },
  {
    label: 'People & Stores',
    items: [
      { to: '/delivery-partners', label: 'Delivery Partners', icon: '➤' },
      { to: '/employees', label: 'Employees', icon: '◫' },
      { to: '/stores', label: 'Stores & Warehouses', icon: '⌂' },
    ],
  },
]

export default function Layout({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth()

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 flex-col justify-between bg-crate-900 text-crate-50">
        <div>
          <div className="border-b border-white/10 px-5 py-6">
            <p className="font-display text-lg font-semibold tracking-tight text-white">
              Dharapuram
            </p>
            <p className="mt-0.5 font-mono text-[11px] uppercase tracking-widest text-crate-300">
              Grocery · Ops Console
            </p>
          </div>
          <nav className="mt-4 flex flex-col gap-4 px-3 max-h-[calc(100vh-180px)] overflow-y-auto">
            {NAV_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="mb-1 px-3 font-mono text-[10px] uppercase tracking-widest text-crate-300/70">
                  {group.label}
                </p>
                <div className="flex flex-col gap-0.5">
                  {group.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/'}
                      className={({ isActive }) =>
                        `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                          isActive
                            ? 'bg-crate-500 text-white font-medium'
                            : 'text-crate-100 hover:bg-white/5'
                        }`
                      }
                    >
                      <span aria-hidden className="text-base">{item.icon}</span>
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </div>

        <div className="border-t border-white/10 px-5 py-4">
          <p className="truncate text-sm font-medium text-white">
            {profile?.full_name ?? 'Staff'}
          </p>
          <p className="font-mono text-[11px] uppercase tracking-wider text-crate-300">
            {profile?.role.replace('_', ' ')}
          </p>
          <button
            onClick={signOut}
            className="mt-3 text-xs font-medium text-crate-100 underline decoration-crate-500 underline-offset-2 hover:text-white"
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 bg-paper">
        <div className="mx-auto max-w-6xl px-8 py-8">{children}</div>
      </main>
    </div>
  )
}
