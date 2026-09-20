#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# ============================================================
#  Sa7tein — Generator Dokumen Word (.docx)
#  Membuat: BRS, SRS, FSD, Dokumentasi API, Database & Server
#  Jalankan: python3 scripts/generate-docs-docx.py
#  Hasil:    docs/Sa7tein-*.docx
# ============================================================
import os
from docx import Document
from docx.shared import Pt, RGBColor, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

GREEN = RGBColor(0x00, 0xAA, 0x13)
DARK = RGBColor(0x1F, 0x29, 0x37)
GRAY = RGBColor(0x6B, 0x72, 0x80)
OUT = os.path.join(os.path.dirname(__file__), '..', 'docs')


def setup(doc):
    st = doc.styles['Normal']
    st.font.name = 'Calibri'
    st.font.size = Pt(11)
    for lvl, sz in [(1, 16), (2, 13), (3, 12), (4, 11)]:
        h = doc.styles['Heading %d' % lvl]
        h.font.name = 'Calibri'
        h.font.size = Pt(sz)
        h.font.bold = True
        h.font.color.rgb = GREEN if lvl == 1 else DARK


def footer(doc, label):
    sec = doc.sections[0]
    p = sec.footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r1 = p.add_run('%s  ·  Halaman ' % label)
    r1.font.size = Pt(8)
    r1.font.color.rgb = GRAY
    run = p.add_run()
    f1 = OxmlElement('w:fldChar'); f1.set(qn('w:fldCharType'), 'begin')
    it = OxmlElement('w:instrText'); it.set(qn('xml:space'), 'preserve'); it.text = 'PAGE'
    f2 = OxmlElement('w:fldChar'); f2.set(qn('w:fldCharType'), 'end')
    run._r.append(f1); run._r.append(it); run._r.append(f2)
    run.font.size = Pt(8)
    run.font.color.rgb = GRAY


def cover(doc, title, subtitle, meta):
    for _ in range(5):
        doc.add_paragraph()
    t = doc.add_paragraph(); t.alignment = WD_ALIGN_PARAGRAPH.CENTER
    tr = t.add_run(title)
    tr.font.size = Pt(42); tr.font.bold = True; tr.font.color.rgb = GREEN
    s = doc.add_paragraph(); s.alignment = WD_ALIGN_PARAGRAPH.CENTER
    sr = s.add_run(subtitle)
    sr.font.size = Pt(16); sr.font.color.rgb = DARK
    for _ in range(3):
        doc.add_paragraph()
    tb = doc.add_table(rows=len(meta), cols=2)
    tb.style = 'Table Grid'
    tb.alignment = WD_TABLE_ALIGNMENT.CENTER
    for i, (k, v) in enumerate(meta):
        c0, c1 = tb.cell(i, 0), tb.cell(i, 1)
        c0.text, c1.text = k, v
        c0.width, c1.width = Inches(2), Inches(4)
        for cell in (c0, c1):
            for par in cell.paragraphs:
                for run in par.runs:
                    run.font.size = Pt(11)
                par.paragraph_format.space_before = Pt(2)
                par.paragraph_format.space_after = Pt(2)
        c0.paragraphs[0].runs[0].font.bold = True
        shd = OxmlElement('w:shd'); shd.set(qn('w:val'), 'clear'); shd.set(qn('w:fill'), 'F0FDF4')
        c0._tc.get_or_add_tcPr().append(shd)
    doc.add_page_break()


def para(doc, text, bold=False, size=11, color=None, italic=False):
    p = doc.add_paragraph()
    r = p.add_run(text)
    r.font.size = Pt(size)
    r.font.bold = bold
    r.font.italic = italic
    if color:
        r.font.color.rgb = color
    return p


def bullets(doc, items, style='List Bullet'):
    for it in items:
        doc.add_paragraph(it, style=style)


def code(doc, text):
    for line in text.split('\n'):
        p = doc.add_paragraph()
        p.paragraph_format.space_after = Pt(0)
        p.paragraph_format.space_before = Pt(0)
        r = p.add_run(line)
        r.font.name = 'Courier New'
        r.font.size = Pt(9)
        shd = OxmlElement('w:shd'); shd.set(qn('w:val'), 'clear'); shd.set(qn('w:fill'), 'F3F4F6')
        p._p.get_or_add_pPr().append(shd)


def table(doc, headers, rows, widths=None):
    t = doc.add_table(rows=1, cols=len(headers))
    t.style = 'Table Grid'
    hdr = t.rows[0].cells
    for i, h in enumerate(headers):
        hdr[i].text = ''
        r = hdr[i].paragraphs[0].add_run(h)
        r.font.bold = True
        r.font.size = Pt(10)
        r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        shd = OxmlElement('w:shd'); shd.set(qn('w:val'), 'clear'); shd.set(qn('w:fill'), '00AA13')
        hdr[i]._tc.get_or_add_tcPr().append(shd)
    for row in rows:
        cells = t.add_row().cells
        for i, val in enumerate(row):
            cells[i].text = ''
            r = cells[i].paragraphs[0].add_run(str(val))
            r.font.size = Pt(9.5)
    if widths:
        for i, w in enumerate(widths):
            for row in t.rows:
                row.cells[i].width = Inches(w)
    doc.add_paragraph()
    return t


def save(doc, name):
    path = os.path.join(OUT, name)
    doc.save(path)
    print('  OK -> %s' % path)


# ============================================================
#  1. BRS
# ============================================================
def build_brs():
    doc = Document()
    setup(doc)
    footer(doc, 'Sa7tein — BRS')
    cover(doc, 'Sa7tein', 'Business Requirements Specification (BRS)\nPlatform Food Delivery — Customer · Merchant · Courier', [
        ('Aplikasi', 'Sa7tein — Platform Food Delivery (Customer, Merchant, Courier)'),
        ('Versi Dokumen', '1.0'),
        ('Status', 'Final (sesuai implementasi saat ini)'),
        ('Tanggal', '25 Agustus 2026'),
        ('Teknologi', 'React 18 · Vite 5 · Tailwind CSS 3 · Zustand · React Router · Leaflet · Supabase · Capacitor'),
    ])

    doc.add_heading('1. Ringkasan Eksekutif', level=1)
    para(doc, 'Sa7tein adalah platform pesan-antar makanan (food delivery) bergaya GoFood yang menghubungkan tiga pihak '
              'dalam satu ekosistem realtime: Customer (pemesan), Merchant (restoran), dan Courier (kurir pengantar). '
              'Sistem terdiri dari tiga aplikasi web terpisah (portal) yang berbagi satu paket kode bersama '
              '(@sa7tein/shared), dapat diinstall sebagai Progressive Web App (PWA), dan dibungkus menjadi aplikasi '
              'mobile Android & iOS melalui Capacitor.')
    para(doc, 'Produk ini dirancang sebagai purwarupa (prototype) yang berfungsi penuh, mencakup alur end-to-end dari '
              'pencarian restoran, pemesanan, pembayaran simulasi, penugasan kurir terdekat, pelacakan pengiriman '
              'realtime, hingga chat antar pihak. Sistem berjalan dalam dua mode: mode demo lokal (tanpa server eksternal) '
              'dan mode cloud (Supabase + Vercel) sehingga dapat diakses 24/7 tanpa bergantung pada laptop pengembang.')

    doc.add_heading('2. Latar Belakang', level=1)
    bullets(doc, [
        'Kebiasaan memesan makanan secara daring terus meningkat; pengguna mengharapkan pengalaman yang cepat, realtime, dan mudah dipantau.',
        'Diperlukan purwarupa fungsional lengkap untuk demonstrasi produk kepada calon pengguna, investor, maupun tim pengembangan lanjutan.',
        'Tiga portal yang saling terhubung (customer-merchant-kurir) merepresentasikan ekosistem nyata layanan food delivery.',
        'Dukungan mobile (native + PWA) dan mode cloud diperlukan agar produk dapat diuji di perangkat sungguhan dan diakses kapan pun.',
    ])

    doc.add_heading('3. Tujuan Bisnis (Business Objectives)', level=1)
    table(doc, ['Kode', 'Tujuan Bisnis'], [
        ('BO-1', 'Menyediakan platform yang menghubungkan customer, merchant, dan kurir dalam satu ekosistem realtime.'),
        ('BO-2', 'Mendemonstrasikan alur end-to-end pemesanan: cari restoran → pesan → siapkan → antar → selesai.'),
        ('BO-3', 'Menjamin pesanan tidak menggantung: toko tutup membatalkan pesanan pending, offer kurir kadaluwarsa di-alihkan otomatis.'),
        ('BO-4', 'Memberikan pengalaman mobile yang baik melalui PWA dan aplikasi native Android/iOS.'),
        ('BO-5', 'Menyediakan mode cloud (Supabase + Vercel) agar aplikasi berjalan 24/7 tanpa ketergantungan pada laptop.'),
        ('BO-6', 'Mendukung komunikasi antar pihak melalui chat per pesanan yang realtime.'),
    ])

    doc.add_heading('4. Pemangku Kepentingan (Stakeholders)', level=1)
    table(doc, ['Pemangku Kepentingan', 'Peran', 'Kebutuhan Utama'], [
        ('Customer', 'Pemesan makanan', 'Menelusuri restoran & menu, checkout, melacak pesanan, berkomunikasi dengan merchant/kurir.'),
        ('Merchant', 'Pemilik restoran', 'Mengelola toko (buka/tutup), pesanan, menu & stok, lokasi, dan berkomunikasi.'),
        ('Courier', 'Kurir pengantar', 'Menerima tawaran pengiriman, mengambil & mengantar pesanan, berkomunikasi.'),
        ('Pemilik Produk', 'Pemilik ide bisnis', 'Purwarupa yang dapat didemonstrasikan dan dikembangkan lebih lanjut.'),
        ('Pengembang / DevOps', 'Tim teknis', 'Kode yang terstruktur, dokumentasi lengkap, dan pipeline build/deploy yang jelas.'),
        ('Penguji (QA)', 'Tim penguji', 'Spesifikasi kebutuhan yang dapat dilacak ke implementasi.'),
    ])

    doc.add_heading('5. Ruang Lingkup Bisnis', level=1)
    doc.add_heading('5.1 Dalam Lingkup', level=2)
    bullets(doc, [
        'Tiga portal web: Customer (/customer/), Merchant (/merchant/), Courier (/courier/).',
        'Paket kode bersama @sa7tein/shared (store, backend, komponen, helper geo).',
        'Aplikasi native Android & iOS via Capacitor, serta PWA.',
        'Sinkronisasi realtime antar portal (BroadcastChannel untuk mode lokal; Supabase Realtime untuk cloud).',
        'Chat per pesanan (customer↔merchant, merchant↔courier, courier↔customer).',
        'Peta & lokasi: reverse geocoding, autocomplete alamat, pelacakan kurir.',
        'Manajemen akun, profil, verifikasi email/telepon (demo), dan unggah foto.',
    ])
    doc.add_heading('5.2 Di Luar Lingkup', level=2)
    bullets(doc, [
        'Integrasi payment gateway sungguhan (pembayaran bersifat simulasi).',
        'Notifikasi push native (belum ada FCM/APNs).',
        'Pengiriman SMS/email sungguhan (verifikasi hanya simulasi dengan kode ditampilkan di layar).',
        'Sistem rating/ulasan.',
        'Dukungan multi-bahasa.',
        'Modul akuntansi / laporan keuangan.',
    ])

    doc.add_heading('6. Kebutuhan Bisnis (Business Requirements)', level=1)
    table(doc, ['Kode', 'Kebutuhan Bisnis', 'Prioritas'], [
        ('BR-BUS-01', 'Customer dapat mendaftar dan masuk ke akun mereka pada portal customer.', 'Tinggi'),
        ('BR-BUS-02', 'Merchant dapat mendaftar dan mengelola restoran, menu, serta stok mereka.', 'Tinggi'),
        ('BR-BUS-03', 'Kurir memiliki akun sendiri dan menerima tawaran pengiriman (offer) berdasarkan kedekatan.', 'Tinggi'),
        ('BR-BUS-04', 'Status buka/tutup toko tersinkron realtime dan memengaruhi ketersediaan pemesanan.', 'Tinggi'),
        ('BR-BUS-05', 'Pesanan yang dibatalkan/ditolak mengembalikan stok item.', 'Tinggi'),
        ('BR-BUS-06', 'Pesanan pending dibatalkan otomatis bila toko ditutup agar tidak ada pesanan menggantung.', 'Tinggi'),
        ('BR-BUS-07', 'Offer kurir yang tidak direspons dalam 60 detik dialihkan otomatis ke kurir terdekat berikutnya.', 'Tinggi'),
        ('BR-BUS-08', 'Customer dapat membatalkan pesanan dalam 15 detik pertama (jendela konfirmasi ala GoFood).', 'Tinggi'),
        ('BR-BUS-09', 'Biaya pengiriman dihitung dari jarak (haversine) secara transparan.', 'Tinggi'),
        ('BR-BUS-10', 'Komunikasi antar pihak tersedia melalui chat per pesanan secara realtime.', 'Sedang'),
        ('BR-BUS-11', 'Posisi kurir dapat dilacak customer pada peta beserta estimasi waktu tiba.', 'Tinggi'),
        ('BR-BUS-12', 'Aplikasi dapat diakses melalui browser, PWA, Android, dan iOS.', 'Sedang'),
        ('BR-BUS-13', 'Aplikasi dapat berjalan 24/7 melalui deployment cloud (Vercel + Supabase).', 'Tinggi'),
        ('BR-BUS-14', 'Nama & alamat merchant konsisten di seluruh tampilan (satu identitas restoran).', 'Sedang'),
    ], widths=[1.0, 4.6, 1.0])

    doc.add_heading('7. Proses Bisnis Utama', level=1)
    doc.add_heading('7.1 Alur Pemesanan', level=2)
    code(doc, 'Customer menelusuri restoran & menu\n'
              '  -> tambah item ke keranjang\n'
              '  -> checkout (alamat + pin peta + metode bayar)\n'
              '  -> buat pesanan (pending)\n'
              '  -> [15 detik] customer dapat membatalkan\n'
              'Merchant menerima -> accepted -> preparing -> ready\n'
              '  -> sistem menawarkan ke kurir terdekat (offer)\n'
              'Kurir menerima -> picked_up -> on_the_way -> delivered')
    doc.add_heading('7.2 Alur Penugasan Kurir', level=2)
    bullets(doc, [
        'Saat pesanan berstatus ready, sistem memilih kurir terbaik (berdasarkan jarak, prioritas utama) yang sedang idle.',
        'Kurir menerima offer dan dapat menerima (accept) atau menolak (reject).',
        'Penolakan mengalihkan offer ke kurir terdekat berikutnya.',
        'Offer yang tidak direspons dalam 60 detik dianggap kadaluwarsa dan dialihkan otomatis.',
        'Jika semua kurir sibuk/menolak, pesanan tampil sebagai "siap tanpa kurir" (fallback).',
    ])
    doc.add_heading('7.3 Operasional Toko', level=2)
    bullets(doc, [
        'Merchant dapat membuka/menutup toko kapan pun; status tampil realtime ke customer.',
        'Saat tutup: tombol order dinonaktifkan di seluruh alur (menu, keranjang, checkout), dan pesanan pending dibatalkan otomatis.',
        'Pesanan yang sedang berjalan (accepted → delivered) tetap dilanjutkan.',
    ])

    doc.add_heading('8. Model Bisnis & Aliran Pendapatan (Potensial)', level=1)
    table(doc, ['Sumber', 'Deskripsi', 'Status'], [
        ('Ongkos kirim', 'Biaya pengiriman dari customer ke kurir: Rp5.000 + Rp2.500/km (min Rp5.000).', 'Simulasi'),
        ('Komisi merchant', 'Persentase dari nilai pesanan untuk platform (belum diimplementasikan).', 'Rencana'),
        ('Langganan merchant', 'Paket berlangganan untuk fitur prioritas (belum diimplementasikan).', 'Rencana'),
        ('Iklan restoran', 'Penempatan restoran di posisi unggulan (belum diimplementasikan).', 'Rencana'),
    ])

    doc.add_heading('9. Asumsi & Kendala Bisnis', level=1)
    bullets(doc, [
        'Verifikasi email/telepon bersifat simulasi: kode ditampilkan di layar, bukan dikirim SMS/email sungguhan.',
        'Pembayaran bersifat simulasi (tidak ada integrasi payment gateway).',
        'Peta bergantung pada layanan OpenStreetMap/Nominatim gratis dan memerlukan koneksi internet.',
        'Mode demo lokal hanya sinkron antar aplikasi bila disajikan dari origin yang sama.',
        'App native memerlukan koneksi internet untuk sinkronisasi cloud; mode lokal di perangkat terpisah tidak saling tersinkron.',
        'Simulasi pergerakan kurir menggunakan estimasi kecepatan jalan kaki (1,35 m/s).',
    ])

    doc.add_heading('10. Ukuran Keberhasilan (KPI)', level=1)
    table(doc, ['Indikator', 'Target'], [
        ('Alur pemesanan end-to-end', 'Berhasil dilakukan lintas tiga portal secara realtime.'),
        ('Waktu muat aplikasi', 'Build web < 6 detik per aplikasi; muat cepat setelah cache pertama.'),
        ('Ketersediaan layanan', 'Mode cloud aktif 24/7 (Vercel + Supabase).'),
        ('Ketersediaan di perangkat', 'Berjalan di browser, PWA, Android, dan iOS.'),
        ('Tidak ada pesanan menggantung', 'Toko tutup membatalkan pending; offer kadaluwarsa dialihkan otomatis.'),
    ])

    doc.add_heading('11. Rencana Implementasi & Roadmap', level=1)
    table(doc, ['Tahap', 'Cakupan', 'Status'], [
        ('Fondasi', 'Monorepo, 3 portal, shared package, auth, backend dual-mode.', 'Selesai'),
        ('Fitur inti', 'Menu/stok, keranjang, checkout, alur pesanan, penugasan kurir, pelacakan.', 'Selesai'),
        ('Kolaborasi', 'Chat per pesanan, foto, profil & verifikasi, peta & lokasi.', 'Selesai'),
        ('Mobile & PWA', 'Capacitor Android/iOS, PWA, zoom lock, safe-area.', 'Selesai'),
        ('Cloud', 'Supabase (auth, DB, realtime), deploy Vercel 3 portal, seed cloud.', 'Selesai'),
        ('Penguatan bisnis (rencana)', 'Payment gateway, notifikasi push, rating/ulasan, laporan.', 'Rencana'),
    ])

    save(doc, 'Sa7tein-BRS.docx')


# ============================================================
#  2. SRS
# ============================================================
def build_srs():
    doc = Document()
    setup(doc)
    footer(doc, 'Sa7tein — SRS')
    cover(doc, 'Sa7tein', 'Software Requirements Specification (SRS)\nPlatform Food Delivery — Customer · Merchant · Courier', [
        ('Aplikasi', 'Sa7tein — Platform Food Delivery (Customer, Merchant, Courier)'),
        ('Versi Dokumen', '1.0'),
        ('Status', 'Final (sesuai implementasi saat ini)'),
        ('Tanggal', '25 Agustus 2026'),
        ('Teknologi', 'React 18 · Vite 5 · Tailwind CSS 3 · Zustand 4 · React Router 6 · Leaflet · Supabase · Capacitor'),
    ])

    doc.add_heading('1. Pendahuluan', level=1)
    doc.add_heading('1.1 Tujuan', level=2)
    para(doc, 'Dokumen ini mendefinisikan kebutuhan perangkat lunak untuk Sa7tein, platform pesan-antar makanan gaya '
              'GoFood yang terdiri dari tiga aplikasi web terpisah (Customer, Merchant, Courier) yang saling terhubung '
              'secara realtime. Dokumen menjadi acuan bagi pengembang, penguji, dan pihak yang menerima handover proyek.')
    doc.add_heading('1.2 Lingkup', level=2)
    bullets(doc, [
        'Portal Customer: melihat restoran & menu, keranjang, checkout dengan peta, lacak pesanan, chat, profil.',
        'Portal Merchant: kelola status buka/tutup toko, terima/persiapkan pesanan, kelola menu & stok, lokasi restoran (peta), chat, profil.',
        'Portal Courier: terima tawaran pengiriman, ambil & antar pesanan dengan simulasi lokasi, chat, profil.',
        'Portal CS: monitoring & manajemen transaksi lintas semua merchant (batalkan/tolak, tugaskan ulang kurir, selesaikan manual, chat sebagai penengah).',
        'Shared package (@sa7tein/shared): store, backend (local/Supabase), komponen, helper geo.',
        'Native mobile: pembungkusan Android & iOS via Capacitor.',
        'Realtime: sinkronisasi antar portal (BroadcastChannel untuk mode demo lokal; Supabase realtime untuk cloud).',
    ])
    para(doc, 'Di luar lingkup: pembayaran gateway sungguhan, notifikasi push native, integrasi SMS/email sungguhan, '
              'sistem rating/ulasan, multi-bahasa, dan akuntansi.', italic=True)
    doc.add_heading('1.3 Definisi, Akronim, Singkatan', level=2)
    table(doc, ['Istilah', 'Definisi'], [
        ('Portal', 'Salah satu dari tiga aplikasi web (customer/merchant/courier)'),
        ('Order', 'Pesanan yang dibuat customer dan diproses merchant & courier'),
        ('Offer', 'Tawaran pengiriman ke kurir terdekat saat pesanan siap'),
        ('Channel chat', 'Percakapan per pasangan peran pada sebuah order'),
        ('Backend lokal', 'Mode demo: localStorage + BroadcastChannel'),
        ('Backend Supabase', 'Mode cloud: Supabase Auth + Postgres + Realtime'),
        ('PWA', 'Progressive Web App (installable, offline-ready)'),
        ('OTP', 'One-time password (kode verifikasi email/telepon, demo)'),
    ])
    doc.add_heading('1.4 Referensi', level=2)
    bullets(doc, [
        'README.md — panduan menjalankan proyek',
        'docs/FSD.md — Functional Specification Document',
        'docs/BRS.docx — Business Requirements Specification',
        'supabase/schema.sql — skema basis data cloud',
        'packages/shared/src/lib/* — logika backend, geo, store',
    ])

    doc.add_heading('2. Deskripsi Keseluruhan', level=1)
    doc.add_heading('2.1 Perspektif Produk', level=2)
    para(doc, 'Sa7tein adalah monorepo (npm workspaces) dengan tiga aplikasi SPA yang berdiri sendiri namun berbagi kode '
              'melalui package @sa7tein/shared. Setiap aplikasi punya base subpath sendiri (/customer/, /merchant/, '
              '/courier/) dan BrowserRouter basename yang sama. Ketiga aplikasi memiliki sistem akun dengan peran (role) '
              'masing-masing.')
    code(doc, '              @sa7tein/shared (paket)\n'
              '          store · backend · komponen\n'
              '        /           |           \\\n'
              '   Customer      Merchant      Courier\n'
              '   /customer/    /merchant/    /courier/\n'
              '   (port 5173)  (port 5174)   (port 5175)\n'
              '        \\          |          /\n'
              '         \\         v         /\n'
              '   localStorage +         Supabase (opsional)\n'
              '   BroadcastChannel      Auth + Realtime\n'
              '   (mode demo)')
    doc.add_heading('2.2 Fungsi Produk (ringkas)', level=2)
    bullets(doc, [
        'Manajemen akun per peran dengan login/register dan verifikasi email/telepon.',
        'Manajemen restoran, menu, stok, dan status buka/tutup toko.',
        'Alur pesanan lengkap: buat → terima → siapkan → siap → diambil → diantar → selesai (dengan simulasi kurir).',
        'Penugasan kurir terdekat (offer/accept/reject) dan pelacakan posisi kurir realtime di peta.',
        'Chat per order (customer↔merchant, merchant↔courier, courier↔customer).',
        'Upload foto (menu, restoran, kurir).',
        'Pengaturan lokasi berbasis peta (pin drag, geocoding, autocomplete) di merchant & customer.',
        'Profil pengaturan (nama, email/telepon terverifikasi, alamat) dalam dropdown avatar.',
        'PWA (installable) dan aplikasi native Android/iOS via Capacitor.',
    ])
    doc.add_heading('2.3 Karakteristik Pengguna', level=2)
    table(doc, ['Kelas Pengguna', 'Deskripsi', 'Kebutuhan utama'], [
        ('Customer', 'Pemesan makanan', 'Menelusuri menu, checkout, melacak, chat'),
        ('Merchant', 'Pemilik restoran', 'Kelola pesanan, menu, stok, lokasi, chat'),
        ('Courier', 'Kurir pengantar', 'Terima tawaran, antar pesanan, chat'),
        ('CS (Support)', 'Pengawas operasional', 'Monitoring semua pesanan & transaksi, batalkan, tugaskan kurir, selesaikan manual, chat'),
        ('Admin demo', 'Menggunakan akun demo yang tersedia', 'Menjalankan seluruh alur lintas portal'),
    ])
    doc.add_heading('2.4 Lingkungan Operasi', level=2)
    bullets(doc, [
        'Browser: Chrome/Edge/Firefox/Safari modern (mobile-first, PWA).',
        'Server demo: node scripts/serve-demo.mjs di http://localhost:8080 (satu origin agar mode lokal tersinkron).',
        'Development: vite dev pada port 5173/5174/5175.',
        'Cloud: Supabase (URL + anon key pada .env root).',
        'Mobile: Android (SDK 33/36, JDK 17-19) dan iOS (Xcode 14.2+) via Capacitor 5.',
    ])
    doc.add_heading('2.5 Kendala Desain & Implementasi', level=2)
    bullets(doc, [
        'Node.js v20+ (teruji v24); file .mjs tidak boleh memakai komentar "#" (harus //).',
        'Mode lokal hanya sinkron antar tab/aplikasi bila disajikan dari origin yang sama.',
        'App native dalam mode lokal tidak dapat sinkron antar aplikasi/perangkat (butuh Supabase).',
        'Kode verifikasi demo ditampilkan di layar (bukan SMS/email sungguhan).',
        'Peta memakai OpenStreetMap/Nominatim gratis (perlu koneksi internet).',
    ])
    doc.add_heading('2.6 Asumsi & Ketergantungan', level=2)
    bullets(doc, [
        'Semua akun demo ter-seed otomatis (customer@/merchant@/merchant2@/merchant3@/courier@/courier2@/courier3@sa7tein.app, password demo1234).',
        'ensureUsers() menggabungkan akun demo yang hilang dan backfill merchantId/courierId akun lama.',
        'ensureSeed() me-refresh data demo saat versi seed berubah.',
        'Dependensi eksternal: leaflet, react-leaflet, zustand, @supabase/supabase-js, vite-plugin-pwa, @capacitor/*.',
    ])

    doc.add_heading('3. Kebutuhan Fungsional (FR)', level=1)
    para(doc, 'Format: FR-<modul>-<no>. Prioritas: Tinggi / Sedang / Rendah.', italic=True)

    doc.add_heading('3.1 Otentikasi & Akun (AUTH)', level=2)
    table(doc, ['ID', 'Kebutuhan', 'Prioritas'], [
        ('FR-AUTH-01', 'Sistem menyediakan registrasi akun dengan nama, email, telepon, kata sandi, dan peran (customer/merchant/courier).', 'Tinggi'),
        ('FR-AUTH-02', 'Sistem memverifikasi keunikan email saat registrasi.', 'Tinggi'),
        ('FR-AUTH-03', 'Sistem menyediakan login dengan email & kata sandi, terbatas per peran (akun merchant tidak bisa login ke portal customer).', 'Tinggi'),
        ('FR-AUTH-04', 'Kata sandi disimpan ter-hash (SHA-256 + salt) dan tidak pernah diekspos.', 'Tinggi'),
        ('FR-AUTH-05', 'Sistem menyimpan sesi dan memulihkannya saat aplikasi dimuat ulang.', 'Tinggi'),
        ('FR-AUTH-06', 'Registrasi sebagai merchant otomatis membuat restoran; sebagai kurir otomatis membuat profil kurir.', 'Tinggi'),
        ('FR-AUTH-07', 'Setiap portal menampilkan halaman login/registrasi bersama (AuthPage) sesuai peran.', 'Sedang'),
    ])
    doc.add_heading('3.2 Merchant, Menu & Stok (MENU)', level=2)
    table(doc, ['ID', 'Kebutuhan', 'Prioritas'], [
        ('FR-MENU-01', 'Sistem menyediakan banyak merchant; setiap merchant punya identitas, alamat, koordinat, kategori, dan foto.', 'Tinggi'),
        ('FR-MENU-02', 'Merchant dapat mengelola menu miliknya (tambah/ubah/hapus item, harga, kategori, stok, ketersediaan).', 'Tinggi'),
        ('FR-MENU-03', 'Stok otomatis berkurang saat pesanan dibuat dan bertambah saat dibatalkan/ditolak.', 'Tinggi'),
        ('FR-MENU-04', 'Menu dapat memiliki emoji (fallback) dan/atau foto.', 'Sedang'),
        ('FR-MENU-05', 'Customer dapat melihat daftar restoran (dengan jarak & status buka) dan menu per restoran.', 'Tinggi'),
        ('FR-MENU-06', 'Merchant memiliki satu identitas — nama & alamat restoran adalah nama & alamat akun (sinkron antara Settings dan dashboard).', 'Sedang'),
    ])
    doc.add_heading('3.3 Status Buka/Tutup Toko (STORE)', level=2)
    table(doc, ['ID', 'Kebutuhan', 'Prioritas'], [
        ('FR-STORE-01', 'Merchant dapat membuka/menutup tokonya; status tersinkron realtime ke customer.', 'Tinggi'),
        ('FR-STORE-02', 'Saat toko tutup, customer melihat banner dan tombol order dinonaktifkan (menu, keranjang, checkout).', 'Tinggi'),
        ('FR-STORE-03', 'createOrder menolak pesanan bila toko tutup (guard di backend).', 'Tinggi'),
        ('FR-STORE-04', 'Saat toko ditutup, pesanan berstatus pending otomatis dibatalkan dengan alasan store_closed.', 'Tinggi'),
        ('FR-STORE-05', 'Customer yang pesanannya dibatalkan karena toko tutup melihat notifikasi jelas di halaman lacak.', 'Tinggi'),
    ])
    doc.add_heading('3.4 Alur Pesanan (ORDER)', level=2)
    table(doc, ['ID', 'Kebutuhan', 'Prioritas'], [
        ('FR-ORDER-01', 'Customer dapat membuat pesanan (item, alamat, koordinat, catatan, metode pembayaran).', 'Tinggi'),
        ('FR-ORDER-02', 'Sistem menghitung biaya pengiriman dari jarak (haversine): Rp5.000 + Rp2.500/km, min Rp5.000, dibulatkan Rp500.', 'Tinggi'),
        ('FR-ORDER-03', 'Siklus status order: pending → accepted → preparing → ready → picked_up → on_the_way → delivered, plus rejected dan cancelled.', 'Tinggi'),
        ('FR-ORDER-04', 'Merchant menerima (accepted), menetapkan waktu persiapan lalu preparing, dan menandai ready.', 'Tinggi'),
        ('FR-ORDER-05', 'Saat ready, sistem menawarkan pesanan ke kurir terdekat yang tersedia.', 'Tinggi'),
        ('FR-ORDER-06', 'Setiap perubahan status tercatat dengan timestamp.', 'Sedang'),
        ('FR-ORDER-07', 'Customer melihat ringkasan biaya (subtotal, ongkir, total) dan status/lacakan.', 'Tinggi'),
        ('FR-ORDER-08', 'Customer mendapat notifikasi saat pesanan hampir tiba (dari estimasi waktu pengiriman, mis. < 90 detik).', 'Tinggi'),
    ])
    doc.add_heading('3.5 Courier & Pengiriman (COURIER)', level=2)
    table(doc, ['ID', 'Kebutuhan', 'Prioritas'], [
        ('FR-COURIER-01', 'Setiap kurir memiliki akun sendiri (tidak ada dropdown persona); akun terhubung ke profil kurir via courierId.', 'Tinggi'),
        ('FR-COURIER-02', 'Kurir menerima offer pesanan siap yang ditugaskan (terdekat); bisa menerima atau menolak.', 'Tinggi'),
        ('FR-COURIER-03', 'Penolakan meneruskan offer ke kurir terdekat berikutnya.', 'Sedang'),
        ('FR-COURIER-04', 'Menerima offer memindahkan order ke picked_up dan menyimpan info kurir (nama, foto).', 'Tinggi'),
        ('FR-COURIER-05', 'Posisi kurir diperbarui realtime memakai GPS sungguhan (fallback simulasi berjalan bila GPS tidak tersedia).', 'Tinggi'),
        ('FR-COURIER-06', 'Penyelesaian delivery dilakukan MANUAL oleh kurir (tombol Complete Delivery) — tidak bergantung auto-detect peta/simulasi.', 'Tinggi'),
        ('FR-COURIER-07', 'Customer melihat posisi kurir, jarak tersisa, dan ETA di peta.', 'Tinggi'),
        ('FR-COURIER-08', 'Penawaran delivery hanya dikirim ke kurir yang sedang online (login + heartbeat aktif); kurir yang offline/stale tidak menerima tawaran.', 'Tinggi'),
        ('FR-COURIER-09', 'Kurir dapat mengubah status online/offline secara manual (dropdown) kapan pun — tetap bisa login saat offline, namun tidak menerima tawaran baru.', 'Tinggi'),
    ])
    doc.add_heading('3.6 Chat Per Order (CHAT)', level=2)
    table(doc, ['ID', 'Kebutuhan', 'Prioritas'], [
        ('FR-CHAT-01', 'Setiap order memiliki percakapan yang dikelompokkan per channel: customer-merchant, merchant-courier, courier-customer.', 'Tinggi'),
        ('FR-CHAT-02', 'Customer↔Merchant aktif sejak order dibuat; Merchant↔Courier saat kurir ditugaskan; Courier↔Customer saat pengiriman berlangsung.', 'Tinggi'),
        ('FR-CHAT-03', 'Pesan memuat pengirim (id, nama, peran), teks, dan waktu; riwayat tersimpan.', 'Tinggi'),
        ('FR-CHAT-04', 'Pesan baru muncul realtime di semua portal yang terlibat.', 'Tinggi'),
        ('FR-CHAT-05', 'Panel chat menampilkan tab channel bila lebih dari satu, badge pesan belum dibaca, dan input untuk mengirim.', 'Sedang'),
        ('FR-CHAT-06', 'Chat hanya tersedia bagi pengguna yang terlibat pada order tersebut.', 'Sedang'),
    ])
    doc.add_heading('3.7 Profil, Verifikasi & Pengaturan (PROFILE)', level=2)
    table(doc, ['ID', 'Kebutuhan', 'Prioritas'], [
        ('FR-PROFILE-01', 'Setiap pengguna dapat melihat & mengubah nama, email, nomor telepon, dan alamat.', 'Tinggi'),
        ('FR-PROFILE-02', 'Perubahan email/telepon wajib diverifikasi dengan kode OTP (demo: kode ditampilkan di layar).', 'Tinggi'),
        ('FR-PROFILE-03', 'Menu pengaturan diakses dari dropdown avatar (Settings), dengan tombol Sign out di bawahnya.', 'Tinggi'),
        ('FR-PROFILE-04', 'Untuk merchant, field nama & alamat = nama & alamat restoran (satu identitas).', 'Tinggi'),
        ('FR-PROFILE-05', 'Untuk customer, alamat di pengaturan tersinkron ke lokasi pengiriman (kartu "Deliver to").', 'Sedang'),
    ])
    doc.add_heading('3.8 Lokasi & Peta (MAP)', level=2)
    table(doc, ['ID', 'Kebutuhan', 'Prioritas'], [
        ('FR-MAP-01', 'Merchant dapat mengedit lokasi restoran via peta (pin drag/klik) dengan alamat terisi otomatis (reverse geocoding).', 'Tinggi'),
        ('FR-MAP-02', 'Customer dapat mengatur lokasi pengiriman via peta (beranda, checkout, pengaturan).', 'Tinggi'),
        ('FR-MAP-03', 'Autocomplete alamat (Nominatim) dengan pemilihan saran yang memindahkan pin.', 'Sedang'),
        ('FR-MAP-04', 'Lokasi restoran di dashboard merchant bersifat read-only secara default; edit hanya saat mode edit diaktifkan (mencegah mis-klik).', 'Sedang'),
        ('FR-MAP-05', 'Peta menampilkan marker restoran, customer, dan posisi kurir (beserta rute).', 'Tinggi'),
    ])
    doc.add_heading('3.9 Foto (PHOTO)', level=2)
    table(doc, ['ID', 'Kebutuhan', 'Prioritas'], [
        ('FR-PHOTO-01', 'Merchant dapat mengunggah foto menu, foto restoran, dan foto kurir.', 'Tinggi'),
        ('FR-PHOTO-02', 'Customer dapat melihat foto menu, restoran, dan kurir (di daftar, detail, dan pelacakan).', 'Tinggi'),
        ('FR-PHOTO-03', 'Unggahan dikompresi otomatis (max 512px, JPEG) agar hemat penyimpanan.', 'Sedang'),
    ])
    doc.add_heading('3.10 Mobile Native & PWA (MOBILE)', level=2)
    table(doc, ['ID', 'Kebutuhan', 'Prioritas'], [
        ('FR-MOBILE-01', 'Setiap portal dapat diinstall sebagai PWA (offline-ready).', 'Sedang'),
        ('FR-MOBILE-02', 'Setiap portal dibungkus menjadi aplikasi Android & iOS via Capacitor (base "/", tanpa service worker).', 'Tinggi'),
        ('FR-MOBILE-03', 'Build mobile menghasilkan bundle di dist-mobile dan dapat disinkronkan ke proyek native (cap sync).', 'Tinggi'),
    ])
    doc.add_heading('3.11 Customer Service / Monitoring (CS)', level=2)
    table(doc, ['ID', 'Kebutuhan', 'Prioritas'], [
        ('FR-CS-01', 'CS dapat melihat semua pesanan lintas semua merchant beserta status realtime.', 'Tinggi'),
        ('FR-CS-02', 'CS dapat membatalkan pesanan dengan alasan cs_cancelled (stok otomatis dikembalikan).', 'Tinggi'),
        ('FR-CS-03', 'CS dapat menugaskan order ke kurir pilihan (force assign) atau meneruskan offer ke kurir terdekat berikutnya.', 'Tinggi'),
        ('FR-CS-04', 'CS dapat menandai pesanan selesai (delivered) secara manual bila kurir lupa menyelesaikan.', 'Sedang'),
        ('FR-CS-05', 'CS dapat membuka semua channel chat pada sebuah order sebagai penengah (monitoring & intervensi).', 'Sedang'),
        ('FR-CS-06', 'CS dapat memantau transaksi & status pembayaran (simulasi sebelum payment gateway diintegrasikan).', 'Sedang'),
    ])

    doc.add_heading('4. Kebutuhan Antarmuka Eksternal', level=1)
    doc.add_heading('4.1 Antarmuka Pengguna', level=2)
    bullets(doc, [
        'Antarmuka berbasis web responsive (Tailwind CSS), bahasa Inggris, tema hijau (#00aa13).',
        'Komponen bersama di packages/shared/src/components (Navbar, AuthPage, ProfileMenu, ProfileSettings, MapView, AddressAutocomplete, PhotoUploader, OrderChat, StatusBadge, OrderItemsList, OrderStatusTimeline, dll).',
        'Akses di :8080 (demo), :5173/5174/5175 (dev), atau aplikasi native.',
    ])
    doc.add_heading('4.2 Antarmuka Perangkat Keras', level=2)
    bullets(doc, [
        'GPS/geolokasi untuk "Use my location".',
        'Kamera/gallery untuk upload foto (via input file).',
        'Layar sentuh untuk peta & pin.',
    ])
    doc.add_heading('4.3 Antarmuka Perangkat Lunak', level=2)
    bullets(doc, [
        'Leaflet + OpenStreetMap tile + Nominatim (reverse geocoding & search).',
        'Supabase (Auth, Postgres, Realtime) bila dikonfigurasi.',
        'BroadcastChannel (sa7tein-sync) untuk realtime antar tab mode lokal.',
        'Capacitor 5 (Android/iOS) + Gradle (SDK 33/36, JDK 17-19) + Xcode 14.2+.',
    ])
    doc.add_heading('4.4 Antarmuka Komunikasi', level=2)
    bullets(doc, [
        'REST/HTTP untuk Supabase; WebSocket (realtime) via Supabase Realtime.',
        'localStorage (prefix sa7tein:) untuk persisten mode lokal.',
        'BroadcastChannel untuk notifikasi realtime antar aplikasi pada origin sama.',
    ])

    doc.add_heading('5. Kebutuhan Non-Fungsional (NFR)', level=1)
    table(doc, ['ID', 'Kategori', 'Kebutuhan'], [
        ('NFR-PERF-01', 'Performa', 'Aplikasi responsif; simulasi kurir memperbarui posisi tiap detik; build web < 6 detik per app.'),
        ('NFR-PERF-02', 'Performa', 'Aset di-cache (immutable hashed) agar muat cepat setelah pertama kali.'),
        ('NFR-SEC-01', 'Keamanan', 'Kata sandi di-hash; kode verifikasi hanya valid 10 menit & sekali pakai; sanitizeUser tidak mengekspos hash/salt.'),
        ('NFR-SEC-02', 'Keamanan', 'Pesan chat hanya untuk peserta order; peran login dibatasi per portal.'),
        ('NFR-REL-01', 'Keandalan', 'Saat toko tutup, pesanan pending otomatis dibatalkan (tidak ada pesanan menggantung).'),
        ('NFR-REL-02', 'Keandalan', 'Guard ganda toko tutup (UI + backend).'),
        ('NFR-AVAIL-01', 'Ketersediaan', 'Mode demo berjalan tanpa server eksternal (kecuali tile peta).'),
        ('NFR-MAIN-01', 'Maintainability', 'Kode dibagi via @sa7tein/shared; satu sumber kebenaran untuk logika umum.'),
        ('NFR-PORT-01', 'Portabilitas', 'Berjalan di browser, PWA, Android, dan iOS.'),
        ('NFR-COMP-01', 'Kompatibilitas', 'Mode Supabase vs lokal dipilih otomatis (isSupabaseConfigured).'),
        ('NFR-USAB-01', 'Usability', 'Lokasi restoran read-only secara default agar tidak salah geser; tombol penting mudah dilihat.'),
    ])

    doc.add_heading('6. Matriks Traceability (ringkas)', level=1)
    table(doc, ['Modul', 'FR terkait', 'NFR terkait', 'File utama'], [
        ('Auth', 'FR-AUTH-01..07', 'NFR-SEC-01/02', 'backend/*, components/AuthPage.jsx, data/seed.js'),
        ('Menu/Store', 'FR-MENU-01..06, FR-STORE-01..05', 'NFR-REL-01/02', 'AdminDashboard.jsx, MenuManager.jsx, store.js'),
        ('Order', 'FR-ORDER-01..07', 'NFR-PERF-01', 'CheckoutPage.jsx, backend/*, OrderStatusTimeline.jsx'),
        ('Courier', 'FR-COURIER-01..07', 'NFR-PERF-01', 'CourierDashboard.jsx, CourierDelivery.jsx, orders.js'),
        ('Chat', 'FR-CHAT-01..06', 'NFR-SEC-02', 'components/OrderChat.jsx, lib/chat.js'),
        ('Profile', 'FR-PROFILE-01..05', 'NFR-SEC-01', 'components/ProfileSettings.jsx, ProfileMenu.jsx'),
        ('Map', 'FR-MAP-01..05', 'NFR-USAB-01', 'components/MapView.jsx, AddressAutocomplete.jsx, geo.js'),
        ('Photo', 'FR-PHOTO-01..03', 'NFR-PERF-02', 'components/PhotoUploader.jsx, image.js'),
        ('Mobile/PWA', 'FR-MOBILE-01..03', 'NFR-PORT-01', 'vite.config.js, capacitor.config.json'),
        ('CS/Monitoring', 'FR-CS-01..06', 'NFR-REL-01', 'apps/cs/*, CSDashboard.jsx, Transactions.jsx'),
    ], widths=[1.1, 2.2, 1.0, 2.3])

    para(doc, 'Dokumen ini sesuai dengan implementasi terkini dan diperbarui bersama setiap perubahan fitur. '
              'Gunakan npm run handover untuk panduan pengembangan & handover cepat.', italic=True)

    save(doc, 'Sa7tein-SRS.docx')


# ============================================================
#  3. FSD
# ============================================================
def build_fsd():
    doc = Document()
    setup(doc)
    footer(doc, 'Sa7tein — FSD')
    cover(doc, 'Sa7tein', 'Functional Specification Document (FSD)\nPlatform Food Delivery — Customer · Merchant · Courier', [
        ('Aplikasi', 'Sa7tein — Platform Food Delivery (Customer, Merchant, Courier)'),
        ('Versi Dokumen', '1.0'),
        ('Status', 'Final (sesuai implementasi saat ini)'),
        ('Tanggal', '25 Agustus 2026'),
        ('Terkait', 'docs/SRS.docx · docs/Sa7tein-Database-Server.docx · supabase/schema.sql'),
    ])

    doc.add_heading('1. Tujuan & Ruang Lingkup', level=1)
    para(doc, 'Dokumen ini merinci spesifikasi fungsional Sa7tein: aktor, modul, alur proses, aturan bisnis, entitas data, '
              'dan antarmuka backend — sehingga pengembang baru dapat memahami perilaku sistem dan mengimplementasikan/'
              'mengubah fitur tanpa menebak.')

    doc.add_heading('2. Aktor & Peran', level=1)
    table(doc, ['Aktor', 'Portal', 'Kemampuan utama'], [
        ('Customer', '/customer/', 'Pesan makanan, checkout, lacak, chat, kelola profil & lokasi pengiriman'),
        ('Merchant', '/merchant/', 'Kelola toko (buka/tutup), pesanan, menu/stok, lokasi, chat, profil'),
        ('Courier', '/courier/', 'Terima tawaran, antar pesanan, chat, kelola profil & foto'),
        ('CS', '/cs/', 'Monitoring semua pesanan & transaksi, batalkan, tugaskan kurir, selesaikan manual, chat penengah'),
    ])

    doc.add_heading('3. Spesifikasi Modul Fungsional', level=1)

    doc.add_heading('3.1 Modul Otentikasi (AUTH)', level=2)
    para(doc, 'Input: email, kata sandi, nama, telepon, peran.', bold=True)
    bullets(doc, [
        'register() — cek duplikat email → hash password (SHA-256 + salt) → simpan user → (merchant: buat restoran; courier: buat profil kurir) → set sesi.',
        'login() — cek akun, cek peran sesuai portal, verifikasi hash, set sesi.',
        'logout() / getCurrentUser() — bersihkan / pulihkan sesi.',
    ])
    para(doc, 'Output: objek user publik { id, name, email, phone, role, merchantId, courierId, address }', bold=True)
    para(doc, 'Aturan: akun tidak boleh lintas peran; user merchant tampil dengan nama restoran (satu identitas).')

    doc.add_heading('3.2 Modul Merchant & Menu (MENU)', level=2)
    bullets(doc, [
        'Merchant (AdminDashboard, MenuManager): ubah foto restoran, edit lokasi (mode edit eksplisit), kelola item menu (CRUD + stok + foto).',
        'Customer (Home): daftar restoran + jarak + badge status + menu per restoran.',
        'saveMenu(merchantId, items) mengganti item milik merchant tsb.',
        'updateStock(itemId, delta) menyesuaikan stok; pemesanan men-decrement stok (decrementStock).',
    ])
    para(doc, 'Aturan bisnis: harga dalam Rupiah (integer); item dengan stock === 0 tidak bisa ditambah.')

    doc.add_heading('3.3 Modul Status Toko (STORE)', level=2)
    bullets(doc, [
        'Toggle di AdminDashboard → setStoreStatus(merchantId, open).',
        'Status disimpan per merchant (storeStatus:{id}), notifikasi store-status.',
        'Dampak tutup: (1) Banner + tombol order nonaktif di customer (Home, Cart, Checkout); (2) createOrder ditolak; (3) Order pending milik merchant otomatis menjadi cancelled (reason store_closed).',
        'Customer melihat notifikasi di TrackOrder; timeline menampilkan status batal.',
    ])

    doc.add_heading('3.4 Modul Alur Pesanan (ORDER)', level=2)
    code(doc, 'pending --accept--> accepted --start--> preparing --done--> ready\n'
              '   |                       |                            |\n'
              '   | reject                +--(rejected)                | offer\n'
              '   v                                                   v\n'
              'rejected                              courier accept --> picked_up\n'
              '(cancelled saat toko tutup / sistem)                   |\n'
              '                          on_the_way <-- start ---------+\n'
              '                              |\n'
              '                              v\n'
              '                          delivered')
    bullets(doc, [
        'Pembuatan (CheckoutPage → createOrder): menyimpan snapshot restoran & item, customerId/UserId/Name/Phone/Address, koordinat, biaya, restaurantPhoto, courierPhoto (saat diambil).',
        'Transisi merchant: Accept → set prep time → Preparing → Ready.',
        'Transisi courier: acceptOffer → picked_up; startDelivery → on_the_way; completeDelivery (manual) → delivered.',
        'Biaya ongkir: haversine meter → max(5000, 5000 + 2500*km) → round 500.',
        'Notifikasi hampir tiba: saat estimasi sisa waktu ≤ 90 detik, customer (TrackOrder) melihat banner “Your order is almost here” — memakai remainingTimeSec dari posisi kurir.',
    ])

    doc.add_heading('3.5 Modul Courier & Tawaran (OFFER)', level=2)
    bullets(doc, [
        'Hanya kurir ONLINE yang dipertimbangkan (online=true + lastSeenAt segar dalam ONLINE_WINDOW_MS, default 2 menit); kurir tidak login / app ditutup dilewati.',
        'Dropdown Online/Offline (manual): kurir mengubah status kapan pun via dropdown — tetap bisa login & melihat halaman saat offline, tetapi tawaran disembunyikan dan tidak diterima. Heartbeat hanya berjalan saat Online.',
        'offerToNearestCourier saat order ready: cari kurir terdekat yang online dari lokasi restoran (exclude rejectedBy).',
        'Order menerima assignedCourierId/Name, offerStatus:"pending".',
        'Kurir (CourierDashboard): Offer (status ready, assigned ke dirinya, pending): Accept → picked_up (navigasi ke halaman pengiriman); Reject → tawarkan ke berikutnya.',
        'available (ready, belum ada kurir): "Pick Up & Deliver".',
        'Pelacakan GPS (CourierDelivery): interval 3 detik memprioritaskan GPS sungguhan (getCurrentPosition, timeout 4 detik); bila gagal fallback stepToward menuju koordinat customer. updateCourierLocation → notifikasi courier-location → peta customer.',
        'Penyelesaian MANUAL: kurir menekan tombol “Complete Delivery” — tidak ada auto-complete dari peta/simulasi (menghindari bug peta / kendala waktu).',
    ])

    doc.add_heading('3.6 Modul Chat Per Order (CHAT)', level=2)
    para(doc, 'Satu thread per order, dikelompokkan channel: customer-merchant | merchant-courier | courier-customer.')
    table(doc, ['Peran', 'Channel'], [
        ('Customer', 'customer-merchant (selalu); courier-customer saat picked_up/on_the_way'),
        ('Merchant', 'customer-merchant (selalu); merchant-courier saat kurir ditugaskan'),
        ('Courier', 'merchant-courier saat ditugaskan & aktif; courier-customer saat mengantar'),
    ])
    bullets(doc, [
        'sendMessage(orderId, {channel, senderId/Name/Role, text}) → simpan + notifikasi chat (kirim daftar pesan lengkap).',
        'Komponen OrderChat subscribe onMessagesChange(orderId) dan menampilkan bubble (pesan sendiri di kanan), badge unread per channel.',
    ])

    doc.add_heading('3.7 Modul Profil & Verifikasi (PROFILE)', level=2)
    bullets(doc, [
        'Halaman /settings (komponen bersama) → dropdown avatar → Settings + Sign out.',
        'Field: Full name / Restaurant name (merchant), Email (verifikasi OTP), Phone (verifikasi OTP), Address / Restaurant address (merchant) / Delivery address (customer, dengan peta).',
        'Verifikasi: sendVerificationCode(channel) → kode 6 digit disimpan 10 menit, dikembalikan sebagai demoCode; verifyCode(channel, code) tidak mengonsumsi kode; updateProfile mengonsumsi setelah valid.',
        'Sinkronisasi merchant: nama/alamat = nama/alamat restoran (dua arah Settings ↔ dashboard). Kurir: nama akun = nama profil kurir.',
    ])

    doc.add_heading('3.8 Modul Lokasi & Peta (MAP)', level=2)
    bullets(doc, [
        'MapView: marker restoran/customer/courier, pin editablePoint (drag/klik → onPointChange), rute.',
        'Reverse geocode & search via Nominatim (geo.js).',
        'AddressAutocomplete: debounce 400ms, min 3 karakter, dropdown saran.',
        'Merchant: kartu lokasi read-only default → tombol "Edit location" → peta + autocomplete + "Use my location" → simpan {address, lat, lng}.',
        'Customer: kartu "Deliver to" (Home), checkout (pin + alamat sinkron), pengaturan (peta).',
        'Race guard: alamat hasil geocode hanya diterapkan bila koordinat tidak berpindah lagi.',
    ])

    doc.add_heading('3.9 Modul Foto (PHOTO)', level=2)
    bullets(doc, [
        'PhotoUploader → readFileAsDataUrl → downscaleDataUrl (max 512px JPEG 0.72) → simpan photo.',
        'isPhoto(value) membedakan foto (data:/http) vs emoji.',
        'updateMerchant/updateCourier/saveMenu menyimpan foto; snapshot order membawa restaurantPhoto + item photo + courierPhoto.',
    ])

    doc.add_heading('3.10 Modul Realtime & Backend (BACKEND)', level=2)
    bullets(doc, [
        'Auto-selection: getBackend() → supabaseBackend bila .env terisi, selain itu localBackend.',
        'Local: data di localStorage (prefix sa7tein:), notifikasi via BroadcastChannel (sa7tein-sync); subscribe(fn) menerima {type, payload}.',
        'Supabase: Auth + Postgres + Realtime (postgres_changes).',
        'Notifikasi utama: menu, orders, merchants, couriers, store-status, courier-location, chat.',
    ])
    doc.add_heading('3.11 Modul Customer Service / Monitoring (CS)', level=2)
    bullets(doc, [
        'Portal ke-4 /cs/ (role cs, akun demo cs@sa7tein.app, password demo1234).',
        'Dashboard: KPI (aktif, menunggu kurir, dalam pengiriman, selesai, pendapatan, batal/tolak); tab filter (Aktif / Perlu perhatian / Selesai / Batal-Tolak); daftar semua order lintas merchant dengan StatusBadge, item, biaya, dan chat.',
        'Aksi CS: Batalkan → updateOrderStatus(id, "cancelled", {cancelledReason: "cs_cancelled"}) (stok dikembalikan otomatis); Force assign → updateOrderStatus(id, "ready", {assignedCourierId/Name, offerStatus: "pending", offerSentAt}) ke kurir pilihan — HANYA kurir ONLINE (online=true + heartbeat segar dalam ONLINE_WINDOW_MS) yang bisa ditugaskan; Re-offer → rejectOffer(...) bila kurir tidak merespons; Selesai manual → updateOrderStatus(id, "delivered", {remainingMeters: 0}); Chat → OrderChat dengan semua channel (CS sebagai penengah).',
        'Transaksi (/transactions): ringkasan dana (pendapatan, total nilai, jumlah transaksi, COD/Non-COD/Refund), rincian per merchant, dan tabel transaksi (metode + status bayar simulasi). Dilengkapi filter tanggal (from–to), filter status order, dan pencarian (kode/customer/merchant/metode); ringkasan & rincian merchant mengikuti hasil filter, plus tombol Clear filters.',
        'Catatan: status pembayaran masih simulasi hingga payment gateway diintegrasikan.',
    ])

    doc.add_heading('4. Aturan Bisnis (ringkasan)', level=1)
    table(doc, ['Kode', 'Aturan'], [
        ('BR-01', 'Ongkir = max(5000, 5000 + 2500×km), dibulatkan ke Rp500 (walking speed 1.35 m/s).'),
        ('BR-02', 'Order pending dibatalkan otomatis bila toko ditutup; order berjalan tetap lanjut.'),
        ('BR-03', 'Stok menu = min 0; berkurang saat order dibuat, bertambah saat batal/tolak.'),
        ('BR-04', 'Email harus unik; perubahan email/telepon wajib OTP terverifikasi.'),
        ('BR-05', 'Nama/alamat merchant = nama/alamat restoran (satu identitas, dua arah).'),
        ('BR-06', 'Offer kurir hanya untuk kurir terdekat yang tersedia; penolakan → kurir berikutnya.'),
        ('BR-07', 'Chat channel mengikuti peran & tahap pengiriman; hanya peserta order.'),
        ('BR-08', 'Kode verifikasi berlaku 10 menit dan dikonsumsi hanya saat simpan berhasil.'),
        ('BR-09', 'Lokasi restoran di dashboard read-only default (cegah mis-klik).'),
        ('BR-10', 'Seed data di-refresh saat versi seed berubah; akun demo yang hilang digabung; merchantId/courierId di-backfill.'),
    ])

    doc.add_heading('5. Entitas Data (Data Dictionary)', level=1)
    doc.add_heading('5.1 User / Profil', level=2)
    table(doc, ['Field', 'Tipe', 'Keterangan'], [
        ('id', 'string', 'id unik (local u-… / Supabase UUID)'),
        ('name', 'string', 'Nama (merchant = nama restoran)'),
        ('email', 'string', 'Login, unik'),
        ('phone', 'string', 'Telepon'),
        ('role', 'enum', 'customer | merchant | courier'),
        ('merchantId', 'string?', 'Kunci ke merchants'),
        ('courierId', 'string?', 'Kunci ke couriers'),
        ('address', 'string', 'Alamat (merchant = alamat restoran)'),
        ('salt/passwordHash', 'string', '(hanya lokal, tidak diekspos)'),
    ])
    doc.add_heading('5.2 Merchant (Restoran)', level=2)
    para(doc, 'id, name, address, lat, lng, emoji, category, photo, open')
    doc.add_heading('5.3 MenuItem', level=2)
    para(doc, 'id, merchantId, name, description, price, category, stock, image(emoji), photo, available')
    doc.add_heading('5.4 Order', level=2)
    para(doc, 'id, code(GE-xxx), status, statusTimestamps, customerId, customerUserId, customerName/Phone/Address/Lat/Lng, '
              'restaurantId/Name/Photo/Lat/Lng, items[{itemId,name,image,photo,price,qty,note}], subtotal, courierCost, '
              'total, distanceMeters, travelTimeSeconds, payment, orderNote, prepTimeMinutes, assignedCourierId/Name, '
              'offerStatus, rejectedBy, courierId/Name/Photo/Lat/Lng, remainingMeters, cancelledReason')
    doc.add_heading('5.5 Courier', level=2)
    para(doc, 'id, name, phone, vehicle, status, lat, lng, photo, online, lastSeenAt')
    bullets(doc, [
        'online (boolean): menandakan kurir aktif; hanya kurir online yang menerima penawaran.',
        'lastSeenAt (number, ms): heartbeat terakhir; kurir dianggap offline bila now - lastSeenAt > ONLINE_WINDOW_MS (2 menit).',
    ])
    doc.add_heading('5.6 Message (chat)', level=2)
    para(doc, 'id, orderId, channel, senderId, senderName, senderRole, text, createdAt')
    doc.add_heading('5.7 Settings (Supabase)', level=2)
    para(doc, 'key (store_status:{id}), value (jsonb)')

    doc.add_heading('6. Antarmuka Backend (method)', level=1)
    para(doc, 'Disusun identik untuk localBackend dan supabaseBackend.', italic=True)
    table(doc, ['Kategori', 'Method'], [
        ('Auth', 'register, login, logout, getCurrentUser'),
        ('Profil', 'sendVerificationCode, verifyCode, updateProfile'),
        ('Merchant', 'getMerchants, updateMerchant, onMerchantsChange'),
        ('Store', 'getStoreStatus, setStoreStatus, onStoreStatusChange'),
        ('Menu', 'getMenu, saveMenu, updateStock, onMenuChange'),
        ('Order', 'createOrder, getOrders, updateOrderStatus, onOrdersChange'),
        ('Courier', 'getCouriers, updateCourier, updateCourierLocation, onCourierLocation, onCouriersChange'),
        ('Chat', 'getMessages, sendMessage, onMessagesChange'),
        ('Utilitas', 'resetDemo'),
    ])
    para(doc, 'Helper alur: packages/shared/src/lib/orders.js → offerToNearestCourier, acceptOffer, rejectOffer, handleStaleOffers.')

    doc.add_heading('7. Konfigurasi & Lingkungan', level=1)
    table(doc, ['Konfigurasi', 'Lokasi', 'Keterangan'], [
        ('base web', 'apps/*/vite.config.js', '/customer/, /merchant/, /courier/; mode mobile SA7TEIN_MOBILE=1 → /'),
        ('Output mobile', '—', 'dist-mobile (tanpa PWA)'),
        ('webDir Capacitor', 'apps/*/capacitor.config.json', 'dist-mobile'),
        ('Env Supabase', '.env (root)', 'VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY'),
        ('Skema DB', 'supabase/schema.sql', 'jalankan di SQL Editor Supabase'),
        ('Server demo', 'scripts/serve-demo.mjs', ':8080, satu origin, HTML no-cache'),
    ])

    para(doc, 'Gunakan npm run doctor untuk memeriksa lingkungan build, dan npm run handover untuk panduan cepat '
              'pengembangan & serah terima.', italic=True)

    save(doc, 'Sa7tein-FSD.docx')


# ============================================================
#  4. API
# ============================================================
def build_api():
    doc = Document()
    setup(doc)
    footer(doc, 'Sa7tein — Service API')
    cover(doc, 'Sa7tein', 'Dokumentasi Service API\nAntarmuka Backend, Event, dan Alur Data', [
        ('Aplikasi', 'Sa7tein — Platform Food Delivery'),
        ('Versi Dokumen', '1.0'),
        ('Status', 'Final (sesuai implementasi saat ini)'),
        ('Tanggal', '25 Agustus 2026'),
        ('Kode Sumber', 'packages/shared/src/lib/backend/*, lib/orders.js, lib/geo.js'),
    ])

    doc.add_heading('1. Arsitektur Backend (Dual-Mode)', level=1)
    para(doc, 'Sa7tein tidak memakai REST API server sendiri; semua logika aplikasi dijalankan di sisi klien (SPA) melalui '
              'sebuah lapisan backend abstrak. Lapisan ini memiliki dua implementasi yang dipertukarkan secara otomatis:')
    table(doc, ['Mode', 'Penyimpanan', 'Realtime', 'Kapan dipakai'], [
        ('localBackend', 'localStorage (prefix sa7tein:)', 'BroadcastChannel (sa7tein-sync)', 'Tanpa .env (mode demo)'),
        ('supabaseBackend', 'Supabase Postgres + Auth', 'Supabase Realtime (WebSocket)', 'Saat .env terisi (mode cloud)'),
    ])
    para(doc, 'Pemilihan mode dilakukan satu kali saat aplikasi dimuat:')
    code(doc, '// packages/shared/src/lib/backend/index.js\nexport function getBackend() {\n'
              '  return isSupabaseConfigured ? supabaseBackend : localBackend;\n}\n'
              'export function getBackendMode() {\n'
              '  return isSupabaseConfigured ? "supabase" : "local";\n}')
    para(doc, 'Konsekuensi: seluruh UI memanggil getBackend().<method>() sehingga perilaku identik di kedua mode; '
              'perbedaan hanya pada mekanisme penyimpanan & realtime di belakang layar.')

    doc.add_heading('2. Kontrak Antarmuka Backend', level=1)
    para(doc, 'Berikut kontrak lengkap (signature) yang dijamin identik oleh kedua implementasi. Semua method '
              'mengembalikan Promise; error dilempar sebagai Error dengan pesan yang dapat ditampilkan ke pengguna.')

    doc.add_heading('2.1 Autentikasi', level=2)
    table(doc, ['Method', 'Parameter', 'Kembalian', 'Deskripsi'], [
        ('register', '{name, email, phone, password, role}', 'user publik', 'Buat akun; merchant→buat restoran, courier→buat profil kurir; set sesi.'),
        ('login', '{email, password, role?}', 'user publik', 'Masuk; verifikasi peran & hash; set sesi.'),
        ('logout', '—', 'void', 'Hapus sesi.'),
        ('getCurrentUser', '—', 'user publik | null', 'Pulihkan sesi saat aplikasi dimuat.'),
    ])
    para(doc, 'Bentuk user publik:', bold=True)
    code(doc, '{ id, name, email, phone, role, merchantId, courierId, address }\n'
              '# Catatan: salt & passwordHash TIDAK pernah diekspos (sanitizeUser).\n'
              '# Untuk merchant, name/address diambil dari record restoran (satu identitas).')

    doc.add_heading('2.2 Profil & Verifikasi', level=2)
    table(doc, ['Method', 'Parameter', 'Kembalian', 'Deskripsi'], [
        ('sendVerificationCode', 'channel ("email"|"phone")', '{demoCode}', 'Simulasikan kirim OTP 6 digit (berlaku 10 menit); kode dikembalikan agar tampil di layar (demo).'),
        ('verifyCode', 'channel, code', 'boolean', 'Cek kode tanpa mengonsumsinya (UI verifikasi tidak menghabiskan kode).'),
        ('updateProfile', 'patch, {emailCode, phoneCode}', 'user publik', 'Ubah nama/alamat langsung; email/telepon hanya setelah OTP valid (lalu kode dikonsumsi).'),
    ])
    para(doc, 'Catatan updateProfile (mode Supabase): jika peran merchant, perubahan nama/alamat juga ditulis ke tabel '
              'merchants (dan sebaliknya, updateMerchant menulis ke profiles) — menjaga satu identitas. Untuk courier, '
              'nama disinkronkan ke tabel couriers.')

    doc.add_heading('2.3 Merchant, Store, Menu', level=2)
    table(doc, ['Method', 'Parameter', 'Kembalian', 'Deskripsi'], [
        ('getMerchants', '—', 'merchants[]', 'Daftar restoran (urut nama).'),
        ('onMerchantsChange', 'cb(merchants)', 'unsubscribe', 'Subscribe perubahan restoran.'),
        ('updateMerchant', 'merchantId, patch', 'void', 'Perbarui restoran; sinkronkan profil merchant yang masuk.'),
        ('getStoreStatus', 'merchantId', 'boolean', 'Baca status buka/tutup.'),
        ('setStoreStatus', 'merchantId, open', 'void', 'Atur status; jika tutup, batalkan order pending (reason store_closed).'),
        ('onStoreStatusChange', 'cb({merchantId, open})', 'unsubscribe', 'Subscribe perubahan status toko.'),
        ('getMenu', 'merchantId?', 'items[]', 'Daftar item menu; mode Supabase memetakan merchant_id → merchantId.'),
        ('saveMenu', 'merchantId, items', 'void', 'Ganti seluruh item milik merchant.'),
        ('updateStock', 'itemId, delta', 'void', 'Sesuaikan stok (dipakai saat order dibuat / dibatalkan).'),
        ('onMenuChange', 'cb(items)', 'unsubscribe', 'Subscribe perubahan menu.'),
    ])

    doc.add_heading('2.4 Order', level=2)
    table(doc, ['Method', 'Parameter', 'Kembalian', 'Deskripsi'], [
        ('createOrder', 'order', 'order', 'Buat pesanan; guard toko tutup; generate id/code; decrement stok.'),
        ('getOrders', '—', 'orders[]', 'Daftar pesanan (semua portal memakai data sama, difilter per peran).'),
        ('updateOrderStatus', 'orderId, status, extra?', 'void', 'Transisi status + timestamp; restore stok saat batal/tolak.'),
        ('onOrdersChange', 'cb(orders)', 'unsubscribe', 'Subscribe perubahan pesanan.'),
    ])
    para(doc, 'Struktur objek order (ringkas):', bold=True)
    code(doc, '{ id, code, status, statusTimestamps, customerId, customerUserId,\n'
              '  customerName/Phone/Address/Lat/Lng, restaurantId/Name/Photo/Lat/Lng,\n'
              '  items[], subtotal, courierCost, total, distanceMeters, travelTimeSeconds,\n'
              '  payment, orderNote, prepTimeMinutes, assignedCourierId/Name, offerStatus,\n'
              '  rejectedBy, courierId/Name/Photo/Lat/Lng, remainingMeters, cancelledReason }')
    para(doc, 'Status order:', bold=True)
    code(doc, 'pending -> accepted -> preparing -> ready -> picked_up -> on_the_way -> delivered\n'
              '                      +--- rejected (penolakan merchant)\n'
              '                      +--- cancelled (toko tutup / jendela cancel customer)')

    doc.add_heading('2.5 Courier', level=2)
    table(doc, ['Method', 'Parameter', 'Kembalian', 'Deskripsi'], [
        ('getCouriers', '—', 'couriers[]', 'Daftar kurir + posisi.'),
        ('updateCourier', 'courierId, patch', 'void', 'Perbarui profil kurir (mis. foto, status online/lastSeenAt untuk heartbeat).'),
        ('updateCourierLocation', 'courierId, {lat, lng}', 'void', 'Perbarui posisi kurir (simulasi).'),
        ('onCourierLocation', 'cb({courierId, lat, lng})', 'unsubscribe', 'Subscribe pergerakan kurir.'),
        ('onCouriersChange', 'cb(couriers)', 'unsubscribe', 'Subscribe perubahan kurir.'),
        ('claimOrder', 'orderId, courier, {expectedAssignedCourierId?}', 'boolean', 'Claim order siap secara ATOMIK (compare-and-swap): hanya satu kurir yang menang; mencegah double-claim. Dipakai oleh acceptOffer.'),
    ])

    doc.add_heading('2.6 Chat', level=2)
    table(doc, ['Method', 'Parameter', 'Kembalian', 'Deskripsi'], [
        ('getMessages', 'orderId', 'messages[]', 'Riwayat pesan sebuah order.'),
        ('sendMessage', 'orderId, msg', 'void', 'Kirim pesan; notifikasi ke semua tab/portal.'),
        ('onMessagesChange', 'orderId, cb(messages)', 'unsubscribe', 'Subscribe pesan order (realtime).'),
    ])
    para(doc, 'Bentuk pesan:', bold=True)
    code(doc, '{ id, orderId, channel, senderId, senderName, senderRole, text, createdAt }\n'
              '# channel: "customer-merchant" | "merchant-courier" | "courier-customer"')

    doc.add_heading('3. Helper Alur Bisnis (lib/orders.js)', level=1)
    table(doc, ['Fungsi', 'Deskripsi'], [
        ('offerToNearestCourier(backend, order)', 'Saat order ready, pilih kurir terdekat yang tersedia; set assignedCourierId/Name, offerStatus:"pending", offerSentAt, dan simpan.'),
        ('acceptOffer(backend, order, courier)', 'Kurir menerima offer/order siap → status picked_up, simpan info kurir + courierPhoto. Memakai backend.claimOrder() yang ATOMIK (conditional update) — bila beberapa kurir menekan tombol bersamaan, hanya satu yang berhasil; yang kalah menerima error ORDER_ALREADY_TAKEN dan tidak pindah halaman.'),
        ('rejectOffer(backend, order, courier)', 'Kurir menolak → tambahkan ke rejectedBy → tawarkan ke kurir terdekat berikutnya.'),
        ('handleStaleOffers(backend, orders)', 'Offer berstatus pending > OFFER_TIMEOUT_MS (60 detik) dianggap kadaluwarsa → dialihkan ke kurir berikutnya / jadi "siap tanpa kurir".'),
        ('OFFER_TIMEOUT_MS', 'Konstanta 60.000 ms — batas waktu respons kurir.'),
    ])

    doc.add_heading('4. Helper Geografi & Lokasi (lib/geo.js)', level=1)
    table(doc, ['Fungsi', 'Deskripsi'], [
        ('haversineMeters(a, b)', 'Jarak dua koordinat dalam meter (rumus haversine).'),
        ('findBestCourier(couriers, target, order)', 'Pilih kurir terbaik: prioritas jarak, skip yang menolak, idle dulu, tie-break jumlah pengiriman paling sedikit; fallback kurir terdekat bila semua sibuk.'),
        ('getCurrentPosition()', 'Ambil posisi perangkat: memakai plugin Capacitor Geolocation saat native, fallback navigator.geolocation di web.'),
        ('reverseGeocode(lat, lng)', 'Ubah koordinat → alamat via Nominatim (OpenStreetMap).'),
        ('searchAddress(query)', 'Cari saran alamat via Nominatim (limit 5).'),
    ])

    doc.add_heading('5. Sistem Event / Notifikasi', level=1)
    para(doc, 'Mode lokal menyebarkan event melalui BroadcastChannel (channel "sa7tein-sync"); mode Supabase menggunakan '
              'Supabase Realtime (postgres_changes). Kedua mode mengangkat event dengan tipe yang sama sehingga UI dapat '
              'memakai satu pola subscribe.')
    table(doc, ['Tipe Event', 'Payload', 'Dipakai untuk'], [
        ('menu', 'items[]', 'Menu/stok berubah'),
        ('orders', 'orders[]', 'Status pesanan berubah'),
        ('merchants', 'merchants[]', 'Restoran berubah'),
        ('couriers', 'couriers[]', 'Profil kurir berubah'),
        ('store-status', '{merchantId, open}', 'Status buka/tutup toko'),
        ('courier-location', '{courierId, lat, lng}', 'Pergerakan kurir (simulasi)'),
        ('chat', '{orderId, messages[]}', 'Pesan baru pada sebuah order'),
    ])

    doc.add_heading('6. API Eksternal yang Digunakan', level=1)
    table(doc, ['Layanan', 'Endpoint / Cara', 'Kegunaan'], [
        ('Supabase Auth', 'REST /auth/v1 (signup, token, user)', 'Login/registrasi cloud (mode Supabase).'),
        ('Supabase PostgREST', 'REST /rest/v1/<tabel>', 'CRUD merchants, menu_items, orders, couriers, profiles, settings, order_messages.'),
        ('Supabase Realtime', 'WebSocket /realtime/v1', 'Subscribe perubahan tabel (postgres_changes).'),
        ('OpenStreetMap Tiles', 'https://{s}.tile.openstreetmap.org/...', 'Peta Leaflet.'),
        ('Nominatim', 'https://nominatim.openstreetmap.org/reverse | /search', 'Reverse geocoding & autocomplete alamat.'),
        ('Capacitor Geolocation', 'Plugin native (Android/iOS)', 'Ambil posisi perangkat di app native.'),
    ])

    doc.add_heading('7. Endpoint Server Demo (scripts/serve-demo.mjs)', level=1)
    table(doc, ['Path', 'Deskripsi'], [
        ('/customer/ · /merchant/ · /courier/', 'Menyajikan build ketiga portal dari satu origin (port 8080) agar mode lokal tersinkron.'),
        ('/ (landing)', 'Halaman indeks dengan tautan ke tiga portal.'),
        ('/apk/', 'Daftar file APK yang dapat diunduh untuk instalasi Android.'),
        ('/apk/<file>.apk', 'Stream file APK (Content-Type application/vnd.android.package-archive).'),
    ])
    para(doc, 'Caching: HTML no-cache; aset ber-hash immutable (max-age 1 tahun) agar update terambil cepat.')

    doc.add_heading('8. Contoh Alur Pemanggilan (Order Flow)', level=1)
    code(doc, '1. Customer: getBackend().createOrder({...})          -> status "pending"\n'
              '2. Merchant: getBackend().onOrdersChange(cb)           -> muncul di queue\n'
              '3. Merchant: updateOrderStatus(id, "accepted")         -> set prep time\n'
              '4. Merchant: updateOrderStatus(id, "preparing")\n'
              '5. Merchant: updateOrderStatus(id, "ready")\n'
              '6. Sistem  : offerToNearestCourier(...)                -> offerStatus "pending"\n'
              '7. Courier : onOrdersChange(cb) -> lihat offer\n'
              '8. Courier : acceptOffer(...) / rejectOffer(...)\n'
              '9. Courier : updateOrderStatus(id, "on_the_way")\n'
              '10. Courier: updateCourierLocation(id, {lat, lng}) tiap detik (simulasi)\n'
              '11. Courier: updateOrderStatus(id, "delivered")')

    doc.add_heading('9. Penanganan Error', level=1)
    bullets(doc, [
        'Semua method melempar Error dengan pesan yang siap tampil (mis. "Email and password are required.", "Incorrect password. Please try again.").',
        'createOrder menolak bila toko tutup (pesan "…is currently closed. Please try again later.").',
        'updateProfile menolak perubahan email/telepon tanpa OTP valid.',
        'Mode Supabase: error dari Supabase (mis. jaringan/duplikat) diteruskan agar UI menampilkan pesan yang jelas.',
    ])

    save(doc, 'Sa7tein-API.docx')


# ============================================================
#  5. Database & Server
# ============================================================
def build_dbserver():
    doc = Document()
    setup(doc)
    footer(doc, 'Sa7tein — Database & Server')
    cover(doc, 'Sa7tein', 'Dokumentasi Database & Server\nArsitektur Data, Skema PostgreSQL, dan Infrastruktur', [
        ('Aplikasi', 'Sa7tein — Platform Food Delivery'),
        ('Versi Dokumen', '1.0'),
        ('Status', 'Final (sesuai implementasi saat ini)'),
        ('Tanggal', '25 Agustus 2026'),
        ('Sumber', 'supabase/schema.sql · scripts/*.mjs · apps/*/vite.config.js'),
    ])

    doc.add_heading('1. Arsitektur Deployment', level=1)
    para(doc, 'Sa7tein berjalan dalam beberapa skenario deployment: mode demo lokal (tanpa server), mode development, dan '
              'mode cloud (produksi 24/7).')
    code(doc, '            [ Perangkat Pengguna ]\n'
              '    Browser / PWA / Android / iOS\n'
              '                 |\n'
              '     +-----------+----------------+\n'
              '     |                            |\n'
              '  MODE LOKAL                 MODE CLOUD\n'
              '  serve-demo.mjs             Vercel (4 portal)\n'
              '  http://localhost:8080      sa7tein-{customer,merchant,courier,cs}.vercel.app\n'
              '  localStorage +             |\n'
              '  BroadcastChannel           v\n'
              '                        Supabase\n'
              '                        dwzxtnfesmpobnepilhl.supabase.co\n'
              '                        Auth + Postgres + Realtime')
    bullets(doc, [
        'Mode lokal: data di localStorage per perangkat; sinkron antar tab hanya bila satu origin (server demo :8080).',
        'Mode cloud: semua data di Supabase; sinkron lintas perangkat/perangkat melalui Supabase Realtime.',
        'Tiga portal adalah tiga project Vercel terpisah, semuanya memakai backend yang sama.',
    ])

    doc.add_heading('2. Database (Supabase PostgreSQL)', level=1)
    para(doc, 'Skema didefinisikan di supabase/schema.sql (idempotent — aman dijalankan ulang) dan dijalankan di SQL '
              'Editor Supabase. Seluruh tabel berada di schema public.')

    doc.add_heading('2.1 Diagram Relasi (ringkas)', level=2)
    code(doc, 'merchants 1---* menu_items\n'
              'merchants 1---* orders        (merchant_id)\n'
              'orders    1---* order_messages (order_id)\n'
              'auth.users 1---1 profiles      (id)\n'
              'profiles   *---1 merchants     (merchant_id)\n'
              'profiles   *---1 couriers      (courier_id)\n'
              'settings   (key-value, key = "store_status:{merchantId}")')

    doc.add_heading('2.2 Tabel merchants', level=2)
    table(doc, ['Kolom', 'Tipe', 'Keterangan'], [
        ('id', 'text PK', 'id unik (mis. merchant-1)'),
        ('name', 'text NOT NULL', 'Nama restoran (satu identitas)'),
        ('address', 'text', 'Alamat restoran'),
        ('lat / lng', 'double precision', 'Koordinat restoran'),
        ('emoji', 'text', 'Ikon fallback'),
        ('category', 'text', 'Kategori (mis. General)'),
        ('photo', 'text', 'URL atau data URL foto restoran'),
        ('open', 'boolean DEFAULT true', 'Status buka default'),
        ('created_at', 'timestamptz DEFAULT now()', 'Waktu dibuat'),
    ])

    doc.add_heading('2.3 Tabel menu_items', level=2)
    table(doc, ['Kolom', 'Tipe', 'Keterangan'], [
        ('id', 'text PK', 'id item'),
        ('merchant_id', 'text FK → merchants ON DELETE CASCADE', 'Pemilik menu'),
        ('name', 'text NOT NULL', 'Nama item'),
        ('description', 'text', 'Deskripsi'),
        ('price', 'integer DEFAULT 0', 'Harga Rupiah (integer)'),
        ('category', 'text DEFAULT "Main Dishes"', 'Kategori'),
        ('stock', 'integer DEFAULT 0', 'Stok (min 0)'),
        ('image', 'text', 'Emoji fallback'),
        ('photo', 'text', 'URL/data URL foto item'),
        ('available', 'boolean DEFAULT true', 'Ketersediaan'),
        ('created_at', 'timestamptz DEFAULT now()', 'Waktu dibuat'),
    ])

    doc.add_heading('2.4 Tabel orders', level=2)
    table(doc, ['Kolom', 'Tipe', 'Keterangan'], [
        ('id', 'text PK', 'id pesanan (String(Date.now()))'),
        ('code', 'text', 'Kode tampilan (GE-<id>)'),
        ('status', 'text DEFAULT "pending"', 'Status pesanan'),
        ('merchant_id', 'text FK → merchants ON DELETE CASCADE', 'Restoran pemesan'),
        ('data', 'jsonb DEFAULT {}', 'Seluruh objek order lengkap (camelCase)'),
        ('created_at', 'timestamptz DEFAULT now()', 'Waktu dibuat'),
    ])
    para(doc, 'Catatan: objek order lengkap disimpan pada kolom jsonb data (termasuk items, biaya, koordinat, info kurir, '
              'timestamp status) sehingga UI dapat membaca satu baris tanpa join. Timestamp status disimpan sebagai angka '
              '(millisecond) agar perhitungan ETA tetap akurat.')

    doc.add_heading('2.5 Tabel couriers', level=2)
    table(doc, ['Kolom', 'Tipe', 'Keterangan'], [
        ('id', 'text PK', 'id kurir (mis. c1)'),
        ('name', 'text NOT NULL', 'Nama kurir'),
        ('phone', 'text', 'Telepon'),
        ('vehicle', 'text', 'Kendaraan (mis. "On foot")'),
        ('status', 'text DEFAULT "idle"', 'idle | busy (sedang mengantar)'),
        ('lat / lng', 'double precision', 'Posisi kurir'),
        ('photo', 'text', 'Foto kurir'),
    ])

    doc.add_heading('2.6 Tabel profiles', level=2)
    table(doc, ['Kolom', 'Tipe', 'Keterangan'], [
        ('id', 'uuid PK FK → auth.users ON DELETE CASCADE', 'Tautan ke akun Supabase Auth'),
        ('email', 'text', 'Email'),
        ('name', 'text', 'Nama'),
        ('phone', 'text', 'Telepon'),
        ('address', 'text', 'Alamat'),
        ('role', 'text DEFAULT "customer"', 'customer | merchant | courier'),
        ('merchant_id', 'text FK → merchants ON DELETE SET NULL', 'Restoran milik merchant'),
        ('courier_id', 'text FK → couriers ON DELETE SET NULL', 'Profil kurir milik courier'),
        ('created_at', 'timestamptz DEFAULT now()', 'Waktu dibuat'),
    ])

    doc.add_heading('2.7 Tabel settings', level=2)
    table(doc, ['Kolom', 'Tipe', 'Keterangan'], [
        ('key', 'text PK', 'Kunci (mis. "store_status:{merchantId}")'),
        ('value', 'jsonb DEFAULT {}', 'Nilai (mis. true/false)'),
    ])

    doc.add_heading('2.8 Tabel order_messages', level=2)
    table(doc, ['Kolom', 'Tipe', 'Keterangan'], [
        ('id', 'uuid PK DEFAULT gen_random_uuid()', 'id pesan'),
        ('order_id', 'text FK → orders ON DELETE CASCADE', 'Order terkait'),
        ('channel', 'text NOT NULL', 'customer-merchant | merchant-courier | courier-customer'),
        ('sender_id', 'text', 'id pengirim'),
        ('sender_name', 'text', 'Nama pengirim'),
        ('sender_role', 'text', 'Peran pengirim'),
        ('text', 'text NOT NULL', 'Isi pesan'),
        ('created_at', 'timestamptz DEFAULT now()', 'Waktu kirim'),
    ])

    doc.add_heading('2.9 Realtime Publication', level=2)
    para(doc, 'Skema mengaktifkan realtime untuk tabel berikut (idempotent): merchants, couriers, menu_items, orders, '
              'settings, order_messages. Dengan ini perubahan pada tabel memicu event postgres_changes yang dikonsumsi '
              'aplikasi melalui Supabase Realtime.')
    code(doc, 'alter publication supabase_realtime add table public.merchants;\n'
              'alter publication supabase_realtime add table public.couriers;\n'
              'alter publication supabase_realtime add table public.menu_items;\n'
              'alter publication supabase_realtime add table public.orders;\n'
              'alter publication supabase_realtime add table public.settings;\n'
              'alter publication supabase_realtime add table public.order_messages;')

    doc.add_heading('2.10 Keamanan (RLS)', level=2)
    para(doc, 'Row Level Security diaktifkan pada semua tabel. Untuk tahap MVP, policy dibuat permisif (membaca & menulis '
              'anon diperbolehkan) agar seluruh alur demo berjalan. Untuk produksi, policy harus diganti berbasis auth.')
    code(doc, 'alter table public.merchants enable row level security;\n'
              'create policy "public read merchants" on public.merchants for select using (true);\n'
              'create policy "public write merchants" on public.merchants for all using (true) with check (true);\n'
              '# ... pola yang sama untuk menu_items, orders, couriers, profiles, settings, order_messages')

    doc.add_heading('2.11 Data Seed', level=2)
    bullets(doc, [
        'Local: seed di packages/shared/src/data/seed.js (3 merchant, 24 item menu, 3 kurir, user demo, lokasi customer default).',
        'Cloud: scripts/seed-supabase.mjs — membuat user demo via service role (email dikonfirmasi otomatis karena domain @sa7tein.app ditolak pada signup normal) + seed merchants/menu/couriers/profiles (upsert, aman diulang).',
        'SEED_VERSION menandai perubahan bentuk seed; data lama di localStorage di-refresh saat versi berubah.',
    ])

    doc.add_heading('3. Server & Infrastruktur', level=1)
    doc.add_heading('3.1 Server Demo Lokal', level=2)
    table(doc, ['Aspek', 'Nilai'], [
        ('File', 'scripts/serve-demo.mjs (Node HTTP tanpa dependensi)'),
        ('Port', '8080 (dapat diubah via PORT)'),
        ('Fungsi', 'Menyajikan tiga portal dari satu origin agar mode lokal tersinkron lintas tab'),
        ('Akses HP', 'Menampilkan URL http://<IP-LAN>:8080 untuk perangkat di Wi-Fi yang sama'),
        ('Caching', 'HTML no-cache; aset hashed immutable (max-age 1 tahun)'),
        ('Rute tambahan', '/apk/ dan /apk/<file>.apk untuk unduh APK'),
        ('Menjalankan', 'npm run demo (build dulu) atau npm run build && node scripts/serve-demo.mjs'),
    ])
    doc.add_heading('3.2 Server Development (Vite)', level=2)
    table(doc, ['App', 'Port', 'Base Path'], [
        ('Customer', '5173', '/customer/'),
        ('Merchant', '5174', '/merchant/'),
        ('Courier', '5175', '/courier/'),
    ])
    doc.add_heading('3.3 Cloud — Vercel', level=2)
    bullets(doc, [
        'Empat project: sa7tein-customer, sa7tein-merchant, sa7tein-courier, sa7tein-cs → sa7tein-{customer,merchant,courier,cs}.vercel.app.',
        'Build dilakukan lokal (monorepo + @sa7tein/shared), lalu deploy --prebuilt: scripts/deploy-vercel.mjs <app>.',
        'Mode build SA7TEIN_VERCEL=1 → base "/" (root), output dist, PWA tetap aktif.',
        'Env VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (production, non-sensitive) terpasang di tiap project.',
        'Sinkron lintas perangkat di Vercel memakai Supabase (localStorage per domain tidak tersinkron).',
    ])
    doc.add_heading('3.4 Cloud — Supabase', level=2)
    table(doc, ['Aspek', 'Nilai'], [
        ('Project URL', 'https://dwzxtnfesmpobnepilhl.supabase.co'),
        ('Auth', 'Supabase Auth (email/password); user demo dibuat via service role (email_confirm:true)'),
        ('Database', 'PostgreSQL (schema public, lihat bagian 2)'),
        ('Realtime', 'Supabase Realtime (postgres_changes)'),
        ('Inisialisasi', 'Jalankan supabase/schema.sql di SQL Editor, lalu npm run seed:supabase'),
        ('Env', '.env root: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (rahasia)'),
    ])
    doc.add_heading('3.5 Tunnel (Akses dari HP via Internet)', level=2)
    bullets(doc, [
        'scripts/tunnel.mjs memakai cloudflared (quick tunnel) untuk membuka :8080 ke URL https://….trycloudflare.com.',
        'URL tunnel berubah setiap restart (untuk produksi pakai named tunnel atau Vercel langsung).',
        'Menjalankan: npm run tunnel (pastikan server demo :8080 aktif).',
    ])
    doc.add_heading('3.6 Lingkungan Build Mobile', level=2)
    table(doc, ['Aspek', 'Persyaratan'], [
        ('Android', 'Gradle (Capacitor 5 → SDK 33; juga kompatibel SDK 36), JDK 17-19, build: npm run apk → mobile-builds/*.apk'),
        ('iOS', 'Xcode 14.2+ (Capacitor 5, CocoaPods), signing Personal Team GNRFT8UG88; build: npm run ipa → mobile-builds/ios/*.ipa'),
        ('Bundle web mobile', 'SA7TEIN_MOBILE=1 → base "/", outDir dist-mobile, tanpa PWA'),
        ('Geolokasi native', 'Plugin @capacitor/geolocation + NSLocationWhenInUseUsageDescription (iOS) + ACCESS_FINE/COARSE_LOCATION (Android)'),
    ])

    doc.add_heading('4. Konfigurasi Lingkungan (Environment Variables)', level=1)
    table(doc, ['Variabel', 'Lokasi', 'Kegunaan'], [
        ('VITE_SUPABASE_URL', '.env root', 'URL project Supabase; memicu mode cloud bila terisi'),
        ('VITE_SUPABASE_ANON_KEY', '.env root', 'Anon key Supabase'),
        ('SUPABASE_SERVICE_ROLE_KEY', '.env root (rahasia)', 'Dipakai seed-supabase.mjs untuk membuat user via admin API'),
        ('SA7TEIN_MOBILE=1', 'env build', 'Mode mobile (base "/", dist-mobile, tanpa PWA)'),
        ('SA7TEIN_VERCEL=1', 'env build', 'Mode Vercel (base "/", dist, PWA)'),
        ('PORT', 'env runtime', 'Port server demo (default 8080)'),
    ])

    doc.add_heading('5. Cara Menjalankan (Ringkas)', level=1)
    code(doc, '# Mode demo lokal\nnpm run build && node scripts/serve-demo.mjs   # buka http://localhost:8080\n\n'
              '# Development (per app)\nnpm run dev:customer | dev:merchant | dev:courier\n\n'
              '# Mode cloud (setelah isi .env + jalankan schema.sql)\nnpm run seed:supabase\n'
              'npm run build\nnode scripts/deploy-vercel.mjs customer | merchant | courier\n\n'
              '# Build mobile\nnpm run apk     # mobile-builds/*.apk\nnpm run ipa      # mobile-builds/ios/*.ipa\n\n'
              '# Cek lingkungan\nnpm run doctor\nnpm run handover')

    doc.add_heading('6. Backup & Catatan Operasional', level=1)
    bullets(doc, [
        'Supabase menyediakan backup otomatis (PITR untuk plan berbayar; daily backup untuk free tier) melalui dashboard.',
        'Skema bersifat idempotent — dapat dijalankan ulang tanpa merusak data (menggunakan IF NOT EXISTS dan drop policy if exists).',
        'Seed cloud aman diulang (upsert + skip user yang sudah ada).',
        'Profil provisioning iOS bersifat personal (7 hari) — perlu diperbarui via Xcode bila kedaluwarsa.',
    ])

    save(doc, 'Sa7tein-Database-Server.docx')


if __name__ == '__main__':
    print('Membuat dokumen Word Sa7tein...')
    build_brs()
    build_srs()
    build_fsd()
    build_api()
    build_dbserver()
    print('Selesai. Semua dokumen tersimpan di folder docs/')
