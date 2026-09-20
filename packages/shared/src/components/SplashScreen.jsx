// Layar splash: tampil penuh sementara aplikasi memuat data awal (auth + daftar
// order/menu/restoran). Komponen ini fixed inset-0 sehingga menutupi seluruh
// layar, lalu otomatis hilang setelah data selesai dimuat.
export default function SplashScreen({ emoji = '🍽️', appName = 'Sa7tein', title = '', subtitle = 'Loading your data…' }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-go-500 to-go-600 px-6 text-center text-white">
      <div className="grid h-20 w-20 place-items-center rounded-3xl bg-white/20 text-4xl shadow-lg animate-pulse">{emoji}</div>
      <h1 className="mt-5 text-2xl font-black tracking-tight">
        {appName} {title && <span className="text-go-200">{title}</span>}
      </h1>
      <p className="mt-1 text-sm text-white/80">{subtitle}</p>
      <div className="mt-6 flex gap-1.5">
        <span className="h-2 w-2 animate-bounce rounded-full bg-white/90 [animation-delay:-0.3s]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-white/90 [animation-delay:-0.15s]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-white/90" />
      </div>
    </div>
  );
}
