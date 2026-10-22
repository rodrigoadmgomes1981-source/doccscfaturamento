import { createClient } from '@supabase/supabase-js';
import { criarPlataforma } from './supabase.js';

// Valores gravados no build por vite.config.js (aceita VITE_*, NEXT_PUBLIC_* e SUPABASE_*).
const URL_SB = __SB_URL__;
const KEY = __SB_KEY__;
export const diagnostico = __SB_DIAG__;

export const configurado = !!(URL_SB && KEY);
export const sb = configurado ? createClient(URL_SB, KEY, { auth: { persistSession: true, autoRefreshToken: true } }) : null;
export const platform = configurado ? criarPlataforma(sb) : null;
