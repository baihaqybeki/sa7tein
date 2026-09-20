// ============================================================
//  Helper data-live untuk aplikasi native (Capacitor).
//  Supabase realtime memakai WebSocket; di WebView native socket bisa gagal
//  tersambung (atau mati setelah app di-background), sehingga app hanya
//  ter-update setelah di-restart. Helper ini menambah polling berkala +
//  refresh segera saat app kembali ke foreground. Di web tidak berbahaya —
//  hanya menjaga data tetap segar.
// ============================================================

// Panggil `refreshers` (fungsi async, error ditelan) setiap `intervalMs`.
// Mengembalikan fungsi pembersih.
export function startPolling(refreshers, intervalMs = 8000) {
  const timer = setInterval(() => refreshers.forEach((fn) => fn()), intervalMs);
  return () => clearInterval(timer);
}

// Jalankan `refresh` segera (default), lalu lagi setiap kali document/app
// kembali terlihat (foreground). Mengembalikan fungsi pembersih.
export function onForeground(refresh, immediate = true) {
  const run = () => {
    try {
      const r = refresh();
      if (r && typeof r.catch === 'function') r.catch(console.error);
    } catch (e) {
      console.error(e);
    }
  };
  if (immediate) run();
  document.addEventListener('visibilitychange', run);
  return () => document.removeEventListener('visibilitychange', run);
}
