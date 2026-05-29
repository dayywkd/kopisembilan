const SUPABASE_URL = 'https://xujuhaddzxxxyvoiwuqo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_7-mdoIDZAYQjeCZwQBkZ4A_YwViZlR5';

// Inisialisasi klien Supabase dengan nama variabel 'db' agar tidak bentrok
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Fungsi pembantu untuk memformat Rupiah
function fmtRp(n) {
  return 'Rp ' + Number(n).toLocaleString('id-ID');
}
