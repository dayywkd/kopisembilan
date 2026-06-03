const SUPABASE_URL = 'https://xujuhaddzxxxyvoiwuqo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_7-mdoIDZAYQjeCZwQBkZ4A_YwViZlR5';

// Inisialisasi klien Supabase dengan nama variabel 'db' agar tidak bentrok
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Fungsi pembantu untuk memformat Rupiah
function fmtRp(n) {
  return 'Rp ' + Number(n).toLocaleString('id-ID');
}

/**
 * Memformat input teks menjadi format ribuan (IDR) secara real-time
 */
function formatPriceInput(el) {
  let val = el.value.replace(/\D/g, "");
  if (val === "") {
    el.value = "";
    return;
  }
  el.value = Number(val).toLocaleString('id-ID');
}

/**
 * Mengubah string berformat (titik) kembali menjadi angka mentah
 */
function parsePrice(str) {
  if (!str) return 0;
  // Hapus semua karakter non-digit kecuali jika Anda ingin mendukung desimal (disini kita asumsikan integer IDR)
  return parseInt(String(str).replace(/\D/g, "")) || 0;
}

/**
 * Memformat angka mentah menjadi string ribuan tanpa simbol Rp
 */
function formatIDR(num) {
  return (Number(num) || 0).toLocaleString('id-ID');
}
