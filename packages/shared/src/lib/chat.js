// ============================================================
//  Helper chat pesanan
//  Setiap order punya satu percakapan bersama yang dikelompokkan
//  berdasarkan "channel". Channel mana yang bisa dibuka pengguna
//  bergantung pada peran dan tahap pengantaran:
//    customer ↔ merchant : segera setelah pesanan dibuat
//    merchant ↔ kurir    : setelah kurir ditugaskan (siap kirim)
//    kurir ↔ customer    : setelah kurir sedang mengantar
// ============================================================

export const CHAT_CHANNELS = ['customer-merchant', 'merchant-courier', 'courier-customer'];

// Mengembalikan channel yang bisa dibuka pengguna pada sebuah order:
//   [{ key, label, name }]  (name = nama tampilan pihak LAIN)
export function chatChannelsFor(order, user) {
  if (!order || !user) return [];
  const out = [];
  const delivering = ['picked_up', 'on_the_way'].includes(order.status);
  const courierAssigned = !!order.assignedCourierId || !!order.courierId;

  if (user.role === 'customer') {
    out.push({ key: 'customer-merchant', label: 'Merchant', name: order.restaurantName || 'Restaurant' });
    if (delivering) out.push({ key: 'courier-customer', label: 'Courier', name: order.courierName || 'Courier' });
  } else if (user.role === 'merchant') {
    out.push({ key: 'customer-merchant', label: 'Customer', name: order.customerName || 'Customer' });
    if (courierAssigned) {
      out.push({ key: 'merchant-courier', label: 'Courier', name: order.assignedCourierName || order.courierName || 'Courier' });
    }
  } else if (user.role === 'courier') {
    // Cocokkan berdasarkan id, dengan nama sebagai cadangan untuk akun yang
    // dibuat sebelum courierId tersambung (dashboard memetakan kurir dengan cara yang sama).
    const myName = (user.name || '').toLowerCase();
    const mine = order.assignedCourierId === user.courierId || order.courierId === user.courierId || (order.assignedCourierName || '').toLowerCase() === myName || (order.courierName || '').toLowerCase() === myName;
    if (mine) {
      if (['ready', 'picked_up', 'on_the_way', 'delivered'].includes(order.status)) {
        out.push({ key: 'merchant-courier', label: 'Merchant', name: order.restaurantName || 'Restaurant' });
      }
      if (delivering) out.push({ key: 'courier-customer', label: 'Customer', name: order.customerName || 'Customer' });
    }
  } else if (user.role === 'cs') {
    // CS sebagai pengawas bisa membuka semua channel percakapan order
    out.push({ key: 'customer-merchant', label: 'Customer ⇄ Merchant', name: 'Semua pihak' });
    if (courierAssigned || delivering) out.push({ key: 'merchant-courier', label: 'Merchant ⇄ Courier', name: 'Semua pihak' });
    if (delivering) out.push({ key: 'courier-customer', label: 'Courier ⇄ Customer', name: 'Semua pihak' });
  }
  return out;
}
