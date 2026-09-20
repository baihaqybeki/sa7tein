import { useEffect, useRef, useState } from 'react';
import { useStore } from '../lib/store.js';
import { getBackend } from '../lib/backend/index.js';
import { chatChannelsFor } from '../lib/chat.js';

const CHANNEL_META = {
  'customer-merchant': { emoji: '🏪' },
  'merchant-courier': { emoji: '🛵' },
  'courier-customer': { emoji: '📦' },
};

function fmtTime(t) {
  try {
    return new Date(t).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

// Chat inline untuk satu order. Ada tombol "💬 Chat"; setelah dibuka,
// percakapan dimuat dan mengikuti pembaruan secara langsung (realtime),
// sehingga pesan dari portal lain langsung muncul. Pengguna bisa membuka
// satu atau lebih channel tergantung peran & tahap pengantaran (lihat lib/chat.js).
export default function OrderChat({ order, currentUser, className = '' }) {
  const messagesByOrder = useStore((s) => s.messagesByOrder);
  const setOrderMessages = useStore((s) => s.setOrderMessages);
  const [open, setOpen] = useState(false);
  const [channels, setChannels] = useState([]);
  const [active, setActive] = useState(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [lastSeen, setLastSeen] = useState({});
  const bottomRef = useRef(null);

  const allMessages = (order ? messagesByOrder[order.id] : null) || [];
  const messages = active ? allMessages.filter((m) => m.channel === active) : [];

  // Percakapan apa saja yang tersedia untuk pengguna ini pada order ini
  useEffect(() => {
    const cs = chatChannelsFor(order, currentUser);
    setChannels(cs);
    setActive((prev) => (cs.some((c) => c.key === prev) ? prev : cs[0]?.key || null));
  }, [order?.id, order?.status, order?.assignedCourierId, order?.courierId, currentUser?.id, currentUser?.role]);

  // Muat & berlangganan percakapan (realtime lintas portal)
  useEffect(() => {
    if (!order) return undefined;
    const backend = getBackend();
    let cancelled = false;
    backend
      .getMessages(order.id)
      .then((msgs) => {
        if (!cancelled) setOrderMessages(order.id, msgs);
      })
      .catch(console.error);
    const unsub = backend.onMessagesChange(order.id, (msgs) => setOrderMessages(order.id, msgs));
    return () => {
      cancelled = true;
      unsub();
    };
  }, [order?.id, setOrderMessages]);

  // Selama channel terbuka, anggap semua pesan di dalamnya sudah dibaca
  useEffect(() => {
    if (!open || !active) return;
    const latest = messages.length ? messages[messages.length - 1].createdAt : Date.now();
    setLastSeen((s) => ({ ...s, [active]: Math.max(s[active] || 0, latest) }));
  }, [open, active, messages.length]);

  // Jaga pesan terbaru tetap terlihat
  useEffect(() => {
    if (bottomRef.current) bottomRef.current.scrollIntoView({ block: 'nearest' });
  }, [messages.length, open, active]);

  const unreadCount = (key) => {
    const seen = lastSeen[key] || 0;
    return allMessages.filter((m) => m.channel === key && m.createdAt > seen).length;
  };
  const unreadTotal = channels.reduce((sum, c) => sum + unreadCount(c.key), 0);

  const send = async () => {
    const body = text.trim();
    if (!body || !active || sending || !order || !currentUser) return;
    setSending(true);
    try {
      await getBackend().sendMessage(order.id, {
        channel: active,
        senderId: currentUser.id,
        senderName: currentUser.name,
        senderRole: currentUser.role,
        text: body,
      });
      setText('');
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
    }
  };

  if (channels.length === 0) return null;

  const activeMeta = channels.find((c) => c.key === active) || channels[0];

  return (
    <div className={className}>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="btn-ghost !px-3 !py-1.5 text-xs font-bold text-go-600 hover:bg-go-50" aria-label="Open order chat">
          💬 Chat{channels.length === 1 ? ` with ${channels[0].name}` : ''}
          {unreadTotal > 0 && <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-go-500 px-1 text-[10px] font-extrabold text-white">{unreadTotal}</span>}
        </button>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 border-b border-gray-100 bg-go-50 px-3 py-2">
            <div className="min-w-0 text-sm font-bold text-gray-800">
              {CHANNEL_META[active]?.emoji || '💬'} {activeMeta?.name || 'Chat'}
            </div>
            <button type="button" onClick={() => setOpen(false)} className="shrink-0 text-xs font-bold text-gray-400 hover:text-gray-600" aria-label="Close chat">
              ✕
            </button>
          </div>

          {/* Channel tabs (when more than one conversation is available) */}
          {channels.length > 1 && (
            <div className="flex gap-1.5 border-b border-gray-100 px-3 py-2">
              {channels.map((c) => (
                <button key={c.key} type="button" onClick={() => setActive(c.key)} className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${active === c.key ? 'bg-go-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                  {CHANNEL_META[c.key]?.emoji || ''} {c.label}
                  {unreadCount(c.key) > 0 && <span className="ml-1 text-[10px]">·{unreadCount(c.key)}</span>}
                </button>
              ))}
            </div>
          )}

          {/* Messages */}
          <div className="max-h-56 space-y-2 overflow-y-auto bg-gray-50 px-3 py-3">
            {messages.length === 0 && <div className="py-6 text-center text-xs text-gray-400">No messages yet. Say hi 👋</div>}
            {messages.map((m) => {
              const mine = m.senderId === currentUser?.id;
              return (
                <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-sm shadow-sm ${mine ? 'rounded-br-sm bg-go-500 text-white' : 'rounded-bl-sm border border-gray-100 bg-white text-gray-800'}`}>
                    {!mine && <div className="mb-0.5 text-[10px] font-extrabold text-go-600">{m.senderName}</div>}
                    <div className="whitespace-pre-wrap break-words">{m.text}</div>
                    <div className={`mt-0.5 text-right text-[9px] ${mine ? 'text-go-100' : 'text-gray-300'}`}>{fmtTime(m.createdAt)}</div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <form
            className="flex items-center gap-2 border-t border-gray-100 p-2"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder={`Message ${activeMeta?.name || ''}…`} className="input flex-1 !py-2 text-sm" aria-label="Chat message" />
            <button type="submit" disabled={sending || !text.trim()} className="btn-primary shrink-0 !px-3 !py-2 text-sm" aria-label="Send message">
              {sending ? '…' : '➤'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
