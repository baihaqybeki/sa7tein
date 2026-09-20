import { useState } from 'react';
import { useStore } from '@sa7tein/shared/lib/store.js';
import { getBackend } from '@sa7tein/shared/lib/backend/index.js';
import { formatRupiah } from '@sa7tein/shared/lib/geo.js';
import { isPhoto } from '@sa7tein/shared/lib/image.js';
import PhotoUploader from '@sa7tein/shared/components/PhotoUploader.jsx';

const EMPTY = { id: '', name: '', description: '', price: 15000, category: 'Main Dishes', stock: 20, image: '🍽️', photo: '', available: true };

const EMOJIS = ['🍛', '🍗', '🍜', '🍢', '🥘', '🥗', '🧋', '🍊', '🍧', '🍌', '🧆', '🥔', '🥟', '🍕', '🍔', '🍰', '☕', '🍹'];

export default function MenuManager() {
  const menu = useStore((s) => s.menu);
  const currentUser = useStore((s) => s.currentUser);
  const [editing, setEditing] = useState(null); // null = tersembunyi, {} = item baru
  const [form, setForm] = useState(EMPTY);

  const merchantId = currentUser?.merchantId || null;
  const myMenu = menu.filter((m) => m.merchantId === merchantId);

  const openAdd = () => {
    setEditing({});
    setForm({ ...EMPTY, id: 'm' + Date.now() });
  };
  const openEdit = (item) => {
    setEditing(item);
    setForm({ ...item });
  };

  const save = async () => {
    if (!form.name.trim()) return alert('Please enter an item name.');
    if (!merchantId) return;
    const next = myMenu.map((m) => (m.id === form.id ? form : m));
    if (!myMenu.find((m) => m.id === form.id)) next.push(form);
    await getBackend().saveMenu(merchantId, next);
    setEditing(null);
  };

  const remove = async (id) => {
    if (!confirm('Delete this item?')) return;
    if (!merchantId) return;
    await getBackend().saveMenu(
      merchantId,
      myMenu.filter((m) => m.id !== id),
    );
  };

  const restock = async (id, qty) => {
    await getBackend().updateStock(id, qty);
  };

  const stats = {
    total: myMenu.length,
    low: myMenu.filter((m) => m.stock > 0 && m.stock <= 5).length,
    out: myMenu.filter((m) => m.stock <= 0).length,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold">Menu & Stock</h1>
        <button onClick={openAdd} className="btn-primary">
          + Add Item
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="card p-3 text-center">
          <div className="text-lg font-extrabold">{stats.total}</div>
          <div className="text-[11px] text-gray-400">Total items</div>
        </div>
        <div className="card p-3 text-center">
          <div className="text-lg font-extrabold text-orange-500">{stats.low}</div>
          <div className="text-[11px] text-gray-400">Low stock</div>
        </div>
        <div className="card p-3 text-center">
          <div className="text-lg font-extrabold text-red-500">{stats.out}</div>
          <div className="text-[11px] text-gray-400">Out of stock</div>
        </div>
      </div>

      {/* Form tambah / edit */}
      {editing && (
        <div className="card space-y-3 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold">{editing.id ? 'Edit Item' : 'Add Item'}</h2>
            <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600">
              ✕
            </button>
          </div>
          <div className="grid grid-cols-[auto_1fr] gap-3">
            <div className="space-y-1">
              <label className="label">Icon</label>
              <select value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} className="input w-20 text-center">
                {EMOJIS.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Name</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Item photo</label>
            <PhotoUploader value={form.photo} onChange={(photo) => setForm({ ...form, photo: photo || '' })} emoji={form.image || '🍽️'} size="sm" hint="Shown to customers. Photos are compressed automatically." />
          </div>
          <div>
            <label className="label">Description</label>
            <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Price (IDR)</label>
              <input type="number" className="input" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">Stock</label>
              <input type="number" className="input" value={form.stock} onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">Category</label>
              <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option>Main Dishes</option>
                <option>Beverages</option>
                <option>Snacks</option>
              </select>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-600">
              <input type="checkbox" checked={form.available} onChange={(e) => setForm({ ...form, available: e.target.checked })} />
              Available
            </label>
            <button onClick={save} className="btn-primary">
              💾 Save
            </button>
          </div>
        </div>
      )}

      {/* Daftar menu */}
      <div className="card divide-y divide-gray-100">
        {myMenu.map((m) => (
          <div key={m.id} className="flex items-center gap-3 p-3">
            {isPhoto(m.photo) ? (
              <img src={m.photo} alt={m.name} className="h-12 w-12 shrink-0 rounded-xl object-cover ring-1 ring-gray-100" />
            ) : (
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-go-50 text-2xl">{m.image}</span>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm font-bold">
                {m.name}
                {!m.available && <span className="badge bg-gray-200 text-gray-500">Unavailable</span>}
              </div>
              <div className="text-xs text-gray-400">
                {formatRupiah(m.price)} · {m.category}
              </div>
              <div className="mt-0.5">
                <span className={`badge ${m.stock <= 0 ? 'bg-red-100 text-red-600' : m.stock <= 5 ? 'bg-orange-100 text-orange-600' : 'bg-go-100 text-go-700'}`}>{m.stock} in stock</span>
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <div className="flex gap-1">
                <button onClick={() => restock(m.id, 10)} title="Add 10 to stock" className="rounded-lg bg-go-50 px-2 py-1 text-xs font-bold text-go-600 hover:bg-go-100">
                  +10
                </button>
                <button onClick={() => restock(m.id, -1)} title="Reduce stock by 1" className="rounded-lg bg-gray-100 px-2 py-1 text-xs font-bold text-gray-500 hover:bg-gray-200">
                  −1
                </button>
                <button onClick={() => openEdit(m)} title="Edit" className="rounded-lg bg-sky-50 px-2 py-1 text-xs text-sky-600 hover:bg-sky-100">
                  ✏️
                </button>
                <button onClick={() => remove(m.id)} title="Delete" className="rounded-lg bg-red-50 px-2 py-1 text-xs text-red-500 hover:bg-red-100">
                  🗑️
                </button>
              </div>
            </div>
          </div>
        ))}
        {myMenu.length === 0 && <div className="p-8 text-center text-sm text-gray-400">No items yet</div>}
      </div>

      <p className="text-center text-[11px] text-gray-400">
        💡 Stock changes show up <b>live</b> on the customer site — stock drops automatically whenever an order comes in.
      </p>
    </div>
  );
}
