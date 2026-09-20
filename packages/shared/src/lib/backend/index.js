// ============================================================
//  Pemilih backend otomatis:
//  - Supabase dikonfigurasi -> backend cloud (realtime lintas perangkat)
//  - Selain itu             -> mode demo lokal (realtime lintas tab browser)
// ============================================================
import { isSupabaseConfigured } from '../supabaseClient.js';
import { localBackend } from './localBackend.js';
import { supabaseBackend } from './supabaseBackend.js';

export function getBackend() {
  return isSupabaseConfigured ? supabaseBackend : localBackend;
}

export function getBackendMode() {
  return isSupabaseConfigured ? 'supabase' : 'local';
}
