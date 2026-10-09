// ============================================================
//  Pemilih backend otomatis:
//  - Supabase dikonfigurasi + (default)         -> adapter SKEMA BARU (ERD Irbid)
//  - Supabase dikonfigurasi + VITE_SCHEMA=legacy -> backend cloud skema LAMA
//  - Selain itu                                 -> mode demo lokal (localStorage)
//
//  DEFAULT = SKEMA BARU. Keputusan pemilik produk: 4 portal lama boleh putus,
//  yang penting skema baru bisa dikonsumsi.
//  `VITE_SCHEMA=legacy` tinggal sebagai jalan pulang, bukan lagi syarat untuk
//  memakai skema baru. Lihat docs/backend/M6-ADAPTER.md §1.
// ============================================================
import { isSupabaseConfigured } from '../supabaseClient.js';
import { localBackend } from './localBackend.js';
import { supabaseBackend } from './supabaseBackend.js';
import { irbidBackend } from './irbidBackend.js';

// Ditulis TANPA optional chaining (`import.meta.env.VITE_SCHEMA`) supaya Vite
// menyubstitusi nilainya jadi literal saat build -> Rollup bisa membuang adapter
// yang tidak dipakai dari bundle (bukan sekadar tidak dipanggil).
const TARGET_SCHEMA = import.meta.env.VITE_SCHEMA === 'legacy' ? 'legacy' : 'irbid';

export function getBackend() {
  if (!isSupabaseConfigured) return localBackend;
  return TARGET_SCHEMA === 'legacy' ? supabaseBackend : irbidBackend;
}

export function getBackendMode() {
  return isSupabaseConfigured ? 'supabase' : 'local';
}

export function getTargetSchema() {
  return isSupabaseConfigured ? TARGET_SCHEMA : 'local';
}
