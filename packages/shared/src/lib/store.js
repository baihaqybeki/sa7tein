// ============================================================
//  Store global (Zustand) — auth, menu, keranjang, pesanan
//  Setiap portal punya peran tetap: customer / merchant / kurir / cs
// ============================================================
import { create } from 'zustand';
import { seedCustomer } from '../data/seed.js';
import { getBackendMode } from './backend/index.js';
import { RESTAURANT, haversineMeters, calculateCourierCost, walkingTimeSeconds } from './geo.js';

export const useStore = create((set, get) => ({
  backendMode: getBackendMode(),
  currentUser: null,
  authReady: false,
  storeOpen: true,
  merchants: [],
  merchantStatus: {}, // { [merchantId]: boolean }
  selectedMerchantId: null,
  menu: [],
  orders: [],
  cart: {}, // { itemId: qty }
  customer: { ...seedCustomer },
  selectedCourierId: 'c1',
  courierOnline: null, // status online kurir (diatur manual lewat dropdown)
  messagesByOrder: {}, // { [orderId]: Message[] } — pesan chat per-order

  setCurrentUser: (currentUser) => set({ currentUser }),
  setAuthReady: (authReady) => set({ authReady }),
  setStoreOpen: (storeOpen) => set({ storeOpen }),
  setMerchants: (merchants) => set({ merchants }),
  setMerchantStatus: (merchantId, open) => set((s) => ({ merchantStatus: { ...s.merchantStatus, [merchantId]: !!open } })),
  // Ganti restoran mengosongkan keranjang agar item tidak tercampur antar restoran.
  setSelectedMerchantId: (selectedMerchantId) => set({ selectedMerchantId, cart: {} }),
  setMenu: (menu) => set({ menu }),
  setOrders: (orders) => set({ orders }),
  setCustomer: (patch) => set((s) => ({ customer: { ...s.customer, ...patch } })),
  setSelectedCourier: (selectedCourierId) => set({ selectedCourierId }),
  setCourierOnline: (courierOnline) => set({ courierOnline }),
  setOrderMessages: (orderId, messages) => set((s) => ({ messagesByOrder: { ...s.messagesByOrder, [orderId]: messages } })),

  // --- Keranjang ---
  addToCart: (item) =>
    set((s) => {
      const current = s.cart[item.id] || 0;
      const qty = Math.min(current + 1, item.stock);
      return { cart: { ...s.cart, [item.id]: qty } };
    }),
  decreaseFromCart: (id) =>
    set((s) => {
      const current = s.cart[id] || 0;
      const cart = { ...s.cart };
      if (current <= 1) delete cart[id];
      else cart[id] = current - 1;
      return { cart };
    }),
  removeFromCart: (id) =>
    set((s) => {
      const cart = { ...s.cart };
      delete cart[id];
      return { cart };
    }),
  clearCart: () => set({ cart: {} }),
}));

// --- Selector helper ---
export function getCartLines(menu, cart) {
  return Object.entries(cart)
    .map(([itemId, qty]) => {
      const item = menu.find((m) => m.id === itemId);
      if (!item) return null;
      return { item, qty };
    })
    .filter(Boolean);
}

export function cartSubtotal(lines) {
  return lines.reduce((sum, l) => sum + l.item.price * l.qty, 0);
}

export function cartCount(cart) {
  return Object.values(cart).reduce((a, b) => a + b, 0);
}

// Detail pengantaran: jarak, ongkos kurir, waktu jalan kaki
export function deliveryInfo(customerLatLng, from = RESTAURANT) {
  const distanceMeters = haversineMeters(from, customerLatLng);
  return {
    distanceMeters,
    courierCost: calculateCourierCost(distanceMeters),
    travelTimeSeconds: walkingTimeSeconds(distanceMeters),
  };
}

export const ORDER_STATUS_LABEL = {
  pending: 'Awaiting confirmation',
  accepted: 'Accepted',
  preparing: 'Preparing',
  ready: 'Ready for pickup',
  picked_up: 'Picked up',
  on_the_way: 'Out for delivery',
  delivered: 'Delivered',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

export const ORDER_STATUS_COLOR = {
  pending: 'bg-amber-100 text-amber-700',
  accepted: 'bg-sky-100 text-sky-700',
  preparing: 'bg-orange-100 text-orange-700',
  ready: 'bg-violet-100 text-violet-700',
  picked_up: 'bg-blue-100 text-blue-700',
  on_the_way: 'bg-go-100 text-go-700',
  delivered: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-600',
  cancelled: 'bg-gray-200 text-gray-600',
};
