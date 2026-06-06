# Kopi Sembilan - Point of Sale (POS) Web Application

Aplikasi kasir berbasis web (*Point of Sale*) yang dirancang dengan pendekatan *Mobile-First Design* untuk efisiensi manajemen transaksi toko atau kafe. Aplikasi ini terintegrasi langsung dengan database berbasis cloud demi keamanan dan sinkronisasi data yang *real-time*.

---

## 🚀 Fitur Utama

- **Mobile-First Design**: Antarmuka yang responsif, ringan, dan dioptimalkan khusus untuk kenyamanan penggunaan pada perangkat seluler maupun tablet kasir.
- **Manajemen Transaksi**: Pencatatan pesanan, perhitungan total otomatis secara instan, dan pengelolaan proses pembayaran.
- **Integrasi Cloud Real-Time**: Penyimpanan dan pengambilan data produk, transaksi, serta riwayat penjualan langsung yang tersinkronisasi dengan cloud database.

---

## 🛠️ Tech Stack

Aplikasi ini dibangun menggunakan kombinasi teknologi modern yang berfokus pada kecepatan performa, kemudahan pengembangan, dan efisiensi arsitektur:

### Front-End (Sisi Klien)
- **HTML5 & CSS3**: Penyusunan struktur semantik halaman web serta perancangan tata letak antarmuka yang bersih, modern, dan responsif.
- **JavaScript (Vanilla JS - ES6+)**: Pengolahan logika utama aplikasi POS, manipulasi DOM, interaktivitas halaman, dan manajemen *state* keranjang belanja secara dinamis.

### Back-End & Database (Sisi Server)
- **Supabase (PostgreSQL)**: Berperan sebagai infrastruktur *Backend-as-a-Service* (BaaS). Menggunakan basis data relasional PostgreSQL untuk menyimpan dan mengelola data produk, pengguna, dan log transaksi dengan performa tinggi.

### Deployment & Hosting
- **Vercel**: Platform hosting utama yang terintegrasi dengan GitHub untuk menyajikan aplikasi frontend statis ini secara cepat dan aman melalui jaringan CDN global.

---

## 📂 Struktur Repositori

```text
kopisembilan/
├── css/
│   └── styles.css               # Gaya tampilan utama aplikasi (Responsive/Mobile-First)
├── js/
│   ├── scripts.js               # Logika aplikasi POS dan manajemen transaksi
│   └── supabase-config.js       # Konfigurasi koneksi & inisialisasi Supabase Client
├── logo.jpg                     # Aset logo aplikasi
└── index.html                   # Halaman utama aplikasi kasir
