import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './lib/auth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Products from './pages/Products'
import Orders from './pages/Orders'
import Inventory from './pages/Inventory'
import Customers from './pages/Customers'
import Reminders from './pages/Reminders'
import Suppliers from './pages/Suppliers'
import DeliveryPartners from './pages/DeliveryPartners'
import Employees from './pages/Employees'
import Coupons from './pages/Coupons'
import Categories from './pages/Categories'
import Stores from './pages/Stores'
import Banners from './pages/Banners'
import Analytics from './pages/Analytics'

export default function App() {
  const { session, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-crate-900">
        <p className="font-mono text-sm text-crate-300">Loading…</p>
      </div>
    )
  }

  if (!session || !profile) {
    return <Login />
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/products" element={<Products />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/reminders" element={<Reminders />} />
        <Route path="/suppliers" element={<Suppliers />} />
        <Route path="/delivery-partners" element={<DeliveryPartners />} />
        <Route path="/employees" element={<Employees />} />
        <Route path="/coupons" element={<Coupons />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/stores" element={<Stores />} />
        <Route path="/banners" element={<Banners />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}
