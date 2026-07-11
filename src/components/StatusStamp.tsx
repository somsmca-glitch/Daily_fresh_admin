import type { OrderStatus } from '../lib/types'

const STYLES: Record<OrderStatus, string> = {
  pending: 'border-line text-ink/60',
  accepted: 'border-crate-300 text-crate-700 bg-crate-50',
  packing: 'border-marigold-300 text-marigold-700 bg-marigold-100',
  packed: 'border-marigold-300 text-marigold-700 bg-marigold-100',
  out_for_delivery: 'border-crate-300 text-crate-700 bg-crate-50',
  delivered: 'border-crate-500 text-white bg-crate-500',
  cancelled: 'border-brick-500 text-brick-700 bg-brick-100',
  returned: 'border-brick-500 text-brick-700 bg-brick-100',
  refunded: 'border-brick-500 text-brick-700 bg-brick-100',
}

export default function StatusStamp({ status }: { status: OrderStatus | string }) {
  const style = STYLES[status as OrderStatus] ?? 'border-line text-ink/60'
  return <span className={`stamp ${style}`}>{status.replace(/_/g, ' ')}</span>
}
