// ============================================================
//  Pemilih backend otomatis:
//  - Supabase dikonfigurasi + VITE_SCHEMA=irbid -> adapter SKEMA BARU (M6)
//  - Supabase dikonfigurasi                     -> backend cloud skema lama
//  - Selain itu                                 -> mode demo lokal (localStorage)
//
//  Kenapa pakai saklar VITE_SCHEMA, bukan langsung diganti:
//  4 portal produksi (sa7tein-*.vercel.app) masih memakai skema lama. Saklar ini
//  membuat migrasi bisa diuji di environment terpisah tanpa mematikan produksi.
//  Lihat docs/backend/MIGRATION-RUNBOOK.md §5.
// ============================================================
import { isSupabaseConfigured } from '../supabaseClient.js';
import { localBackend } from './localBackend.js';
import { supabaseBackend } from './supabaseBackend.js';
import { irbidBackend } from './irbidBackend.js';

// 'irbid' = pakai ERD Irbid (42 tabel). Nilai lain/kosong = skema lama.
// Ditulis TANPA optional chaining (`import.meta.env.VITE_SCHEMA`) supaya Vite
// menyubstitusi nilainya jadi literal saat build → Rollup bisa membuang adapter
// yang tidak dipakai dari bundle (bukan sekadar tidak dipanggil).
const TARGET_SCHEMA = import.meta.env.VITE_SCHEMA === 'irbid' ? 'irbid' : 'legacy';

export function getBackend() {
  if (!isSupabaseConfigured) return localBackend;
  return TARGET_SCHEMA === 'irbid' ? irbidBackend : supabaseBackend;
}

export function getBackendMode() {
  return isSupabaseConfigured ? 'supabase' : 'local';
}

export function getTargetSchema() {
  return isSupabaseConfigured ? TARGET_SCHEMA : 'local';
}
