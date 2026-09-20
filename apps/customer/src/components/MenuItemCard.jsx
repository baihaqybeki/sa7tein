import { useStore } from '@sa7tein/shared/lib/store.js';
import { formatRupiah } from '@sa7tein/shared/lib/geo.js';
import { isPhoto } from '@sa7tein/shared/lib/image.js';

export default function MenuItemCard({ item, disabled = false }) {
  const addToCart = useStore((s) => s.addToCart);
  const cart = useStore((s) => s.cart);
  const inCart = cart[item.id] || 0;
  const soldOut = item.stock <= 0;
  const cannotAdd = disabled || soldOut;

  return (
    <div className={`card flex gap-3 p-3 ${soldOut || disabled ? 'opacity-70' : ''}`} data-item-id={item.id}>
      {isPhoto(item.photo) ? (
        <img src={item.photo} alt={item.name} className="h-20 w-20 shrink-0 rounded-xl object-cover ring-1 ring-gray-100" />
      ) : (
        <div className="grid h-20 w-20 shrink-0 place-items-center rounded-xl bg-go-50 text-4xl">{item.image}</div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-bold text-gray-800">{item.name}</h3>
          <span className="text-sm font-extrabold text-go-600">{formatRupiah(item.price)}</span>
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{item.description}</p>
        <div className="mt-auto flex items-center justify-between pt-2">
          <span className={`text-[11px] font-bold ${soldOut ? 'text-red-500' : disabled ? 'text-gray-400' : item.stock <= 5 ? 'text-orange-500' : 'text-gray-400'}`}>
            {disabled ? 'Store closed' : soldOut ? 'Sold out 🚫' : item.stock <= 5 ? `Only ${item.stock} left` : `${item.stock} in stock`}
          </span>
          {inCart > 0 ? (
            <div className="flex items-center gap-2">
              <button onClick={() => useStore.getState().decreaseFromCart(item.id)} className="grid h-8 w-8 place-items-center rounded-full border border-go-500 text-go-600 font-black hover:bg-go-50">
                −
              </button>
              <span className="w-5 text-center text-sm font-bold">{inCart}</span>
              <button onClick={() => addToCart(item)} disabled={inCart >= item.stock || disabled} className="grid h-8 w-8 place-items-center rounded-full bg-go-500 text-white font-black hover:bg-go-600 disabled:opacity-30">
                +
              </button>
            </div>
          ) : (
            <button onClick={() => addToCart(item)} disabled={cannotAdd} className="rounded-full border border-go-500 px-3 py-1 text-xs font-bold text-go-600 hover:bg-go-50 disabled:opacity-30">
              + Add
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
