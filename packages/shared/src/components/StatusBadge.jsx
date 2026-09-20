import { ORDER_STATUS_LABEL, ORDER_STATUS_COLOR } from '../lib/store.js'

export default function StatusBadge({ status }) {
  return (
    <span className={`badge ${ORDER_STATUS_COLOR[status] || 'bg-gray-100 text-gray-600'}`}>
      {ORDER_STATUS_LABEL[status] || status}
    </span>
  )
}
