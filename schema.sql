-- 1. Tabel Pengguna
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'kasir',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Tabel Produk
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    base_price INTEGER NOT NULL,
    category TEXT NOT NULL,
    emoji TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Tabel Varian Produk (Ukuran, Add-ons)
CREATE TABLE product_variants (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    group_name TEXT NOT NULL, -- e.g., 'Size', 'Add-on', 'Sugar'
    name TEXT NOT NULL,
    price_modifier INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Tabel Transaksi
CREATE TABLE transactions (
    id TEXT PRIMARY KEY, -- TXN-YYYYMMDD-XXXX
    date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    customer_phone TEXT,
    total INTEGER NOT NULL,
    payment_method TEXT NOT NULL,
    payment_status TEXT NOT NULL DEFAULT 'Lunas', -- Lunas, Belum Bayar
    notes TEXT,
    cashier_name TEXT NOT NULL
);

-- 6. Tabel Pengaturan
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL
);

-- Data Awal Pengaturan
INSERT INTO settings (key, value) VALUES 
('store_info', '{"name": "KopiSembilan", "address": "Jl. Kopi Nomor 9, Jember, Jawa Timur", "phone": "085855180131"}'::jsonb);
INSERT INTO users (name, username, password, role) VALUES 
('Admin Utama', 'admin', 'admin123', 'admin'),
('Siti Kasir', 'kasir', 'kasir123', 'kasir');

INSERT INTO products (name, base_price, category, emoji) VALUES 
('Americano', 18000, 'Kopi Panas', '☕'),
('Cappuccino', 22000, 'Kopi Panas', '☕'),
('Es Kopi Susu', 20000, 'Kopi Dingin', '🥤');

-- Contoh Varian untuk Americano
INSERT INTO product_variants (product_id, group_name, name, price_modifier) VALUES 
(1, 'Size', 'Regular', 0),
(1, 'Size', 'Large', 5000),
(1, 'Sugar', 'Normal', 0),
(1, 'Sugar', 'Less Sugar', 0);
