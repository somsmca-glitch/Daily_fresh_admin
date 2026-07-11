export interface ProductCatalogRow {
  id: string
  sku: string
  name: string
  tamil_name: string | null
  slug: string
  short_description: string | null
  brand_name: string | null
  category_name: string
  subcategory_name: string | null
  mrp: number
  selling_price: number
  discount_percent: number
  gst_percent: number
  is_veg: boolean | null
  is_organic: boolean | null
  is_featured: boolean | null
  is_trending: boolean | null
  is_best_seller: boolean | null
  primary_image: string | null
  available_stock: number
}

export interface OrderSummaryRow {
  order_id: string
  order_number: string
  customer_id: string
  status: OrderStatus
  total_amount: number
  placed_at: string
  store_name: string
  item_count: number
  delivery_status: string | null
  delivered_at: string | null
}

export type OrderStatus =
  | 'pending'
  | 'accepted'
  | 'packing'
  | 'packed'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'returned'
  | 'refunded'

export const ORDER_STATUSES: OrderStatus[] = [
  'pending',
  'accepted',
  'packing',
  'packed',
  'out_for_delivery',
  'delivered',
  'cancelled',
  'returned',
  'refunded',
]

export interface StorePerformanceRow {
  store_id: string
  store_name: string
  orders_30d: number | null
  revenue_30d: number | null
  avg_delivery_minutes: number | null
}

export interface LowStockRow {
  warehouse_name: string
  warehouse_id: string
  product_id: string
  product_name: string
  quantity_on_hand: number
  reorder_level: number
}

export interface TopProductRow {
  product_id: string
  name: string
  units_sold: number
  revenue: number
}

export interface InventoryRow {
  id: string
  warehouse_id: string
  product_id: string
  variant_id: string | null
  quantity_on_hand: number
  quantity_reserved: number
  reorder_level: number
  updated_at: string
  products: { name: string; sku: string } | null
  warehouses: { name: string } | null
}

export interface CustomerRow {
  id: string
  referral_code: string
  wallet_balance: number
  loyalty_points: number
  status: string
  created_at: string
  user_profiles: { full_name: string | null; phone: string | null; email: string | null } | null
}
