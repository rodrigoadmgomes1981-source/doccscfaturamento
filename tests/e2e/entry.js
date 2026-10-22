// Ambiente de teste ponta a ponta: app real + Supabase simulado com a carga inicial.
import '../../src/styles.css';
import * as XLSX from 'xlsx';
import Chart from 'chart.js/auto';
import { criarPlataforma } from '../../src/platform/supabase.js';
import { fakeSupabase } from '../fake-supabase.js';
window.XLSX = XLSX; window.Chart = Chart;
const sb = fakeSupabase();
for (const [path, data] of Object.entries(window.__SEED || {})) sb.rows.set(path, { path, collection: path.split('/')[0], data });
window.__rows = sb.rows; window.__saved = [];
const p = criarPlataforma(sb);
p.downloads.save = async (r) => { window.__saved.push(r.filename); return { status: 'saved' }; };
window.__platform = { use: async (n) => p[n] || null };
window.__logout = async () => {};
import('../../src/app.js');
