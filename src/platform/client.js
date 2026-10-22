import { createClient } from '@supabase/supabase-js';
import { criarPlataforma } from './supabase.js';

const URL_SB = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configurado = !!(URL_SB && KEY);
export const sb = configurado ? createClient(URL_SB, KEY, { auth: { persistSession: true, autoRefreshToken: true } }) : null;
export const platform = configurado ? criarPlataforma(sb) : null;
