-- 1. Tabel Pengguna
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
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

-- 5. Tabel Item Transaksi
CREATE TABLE transaction_items (
    id SERIAL PRIMARY KEY,
    transaction_id TEXT REFERENCES transactions(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id),
    qty INTEGER NOT NULL,
    price INTEGER NOT NULL,
    selected_variants JSONB,
    item_note TEXT
);

-- 6. Tabel Pengaturan
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL
);

-- Data Awal Pengaturan
INSERT INTO settings (key, value) VALUES 
('store_info', '{"name": "KopiSembilan", "address": "Jl. Kopi Nomor 9, Jember, Jawa Timur", "phone": "085855180131"}'::jsonb),
('whatsapp_template', '{"template": "*INVOICE [NAMA_TOKO]*\nID: [ID_TRANSAKSI]\nTanggal: [TANGGAL]\n----------------------------\n[ITEMS]\n----------------------------\n*TOTAL: [TOTAL]*\n\nTerima kasih sudah memesan!"}'::jsonb);

-- ... users insertion ...

-- =========================================================
-- Update Menu yg Sesuai
-- =========================================================

-- SPECIALTY COFFEE
INSERT INTO products (id, name, base_price, category, emoji) VALUES 
(1, 'Specialty Classic', 28000, 'Specialty Coffee', '☕'),
(2, 'Specialty Modern', 28000, 'Specialty Coffee', '☕'),
(3, 'Filter Coffee', 30000, 'Specialty Coffee', '🧪');

-- REGULAR COFFEE & OTHERS
INSERT INTO products (id, name, base_price, category, emoji) VALUES 
(4, 'Regular Coffee', 15000, 'Regular Coffee', '☕'),
(5, 'Kopi Susu Sembilan', 18000, 'Regular Coffee', '🥤');

-- NON-COFFEE (NON)
INSERT INTO products (id, name, base_price, category, emoji) VALUES 
(6, 'Matcha U', 28000, 'Non-Coffee', '🍵'),
(7, 'Get Red Velvet', 23000, 'Non-Coffee', '🍰'),
(8, 'Cookie Me', 23000, 'Non-Coffee', '🍪'),
(9, 'Coklat', 25000, 'Non-Coffee', '🍫'),
(10, 'Summer Tea', 18000, 'Non-Coffee', '🍹'),
(11, 'Tropik Tea', 20000, 'Non-Coffee', '🍑');

-- SIGNATURE
INSERT INTO products (id, name, base_price, category, emoji) VALUES 
(12, 'St. Mocktail', 25000, 'Signature', '🍸'),
(13, 'Cocoa Rum', 28000, 'Signature', '🥃'),
(14, 'The Palma', 25000, 'Signature', '🌴'),
(15, 'Starlett', 25000, 'Signature', '✨');

-- VARIANTS
-- Specialty Classic Variants
INSERT INTO product_variants (product_id, group_name, name, price_modifier) VALUES 
(1, 'Type', 'Black (Americano/Espresso)', 0),
(1, 'Type', 'White (Latte/Cappuccino)', 5000),
(1, 'Style', 'Normal', 0),
(1, 'Style', 'Split', 5000),
(1, 'Style', 'Dirty', 5000),
(1, 'Style', 'Magic', 5000);

-- Specialty Modern Variants
INSERT INTO product_variants (product_id, group_name, name, price_modifier) VALUES 
(2, 'Type', 'Black (Americano/Espresso)', 0),
(2, 'Type', 'White (Latte/Cappuccino)', 5000),
(2, 'Style', 'Normal', 0),
(2, 'Style', 'Split', 5000),
(2, 'Style', 'Dirty', 5000),
(2, 'Style', 'Magic', 5000);

-- Regular Coffee Variants
INSERT INTO product_variants (product_id, group_name, name, price_modifier) VALUES 
(4, 'Type', 'Black (Americano/Espresso)', 0),
(4, 'Type', 'White Syrup', 10000),
(4, 'Syrup', 'None', 0),
(4, 'Syrup', 'Hazelnut', 0),
(4, 'Syrup', 'Gula Aren', 0),
(4, 'Syrup', 'Butterscotch', 3000),
(4, 'Syrup', 'Vanilla', 0),
(4, 'Syrup', 'Caramel', 0);
