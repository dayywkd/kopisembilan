-- ══════════════════════════════════════════════════════════════════════
-- SKRIP MIGRASI DATABASE - TOKO KOPI SEMBILAN (VERSI PERBAIKAN)
-- Fitur: Absensi Karyawan, Kas Modal & Rekap Shift, dan Beans
-- ══════════════════════════════════════════════════════════════════════

-- 1. TABEL ABSENSI KARYAWAN (ATTENDANCE)
-- Catatan: Tipe user_id menggunakan BIGINT agar cocok dengan tipe id di tabel users
CREATE TABLE IF NOT EXISTS attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id BIGINT,
    user_name TEXT NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    shift_name TEXT DEFAULT 'pagi', -- 'pagi' | 'sore'
    clock_in TIMESTAMPTZ DEFAULT NOW(),
    clock_out TIMESTAMPTZ,
    work_duration_minutes INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indeks untuk query harian dan laporan absensi
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
CREATE INDEX IF NOT EXISTS idx_attendance_user ON attendance(user_name);

-- 2. TABEL KAS MODAL & SERAH TERIMA SHIFT (CASH SHIFTS)
CREATE TABLE IF NOT EXISTS cash_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_date DATE NOT NULL DEFAULT CURRENT_DATE,
    shift_type TEXT NOT NULL, -- 'pagi' | 'sore'
    cashier_name TEXT NOT NULL,
    starting_cash NUMERIC NOT NULL DEFAULT 0, -- Modal awal kasir (misal Rp 250.000)
    cash_sales NUMERIC DEFAULT 0, -- Total transaksi tunai selama shift
    expected_cash NUMERIC DEFAULT 0, -- starting_cash + cash_sales
    actual_cash NUMERIC, -- Uang fisik yang dihitung kasir saat handover
    difference NUMERIC, -- actual_cash - expected_cash (negatif = minus, 0 = klop)
    status TEXT NOT NULL DEFAULT 'open', -- 'open' | 'closed'
    opened_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indeks untuk pencarian shift aktif dan rekap
CREATE INDEX IF NOT EXISTS idx_cash_shifts_date ON cash_shifts(shift_date);
CREATE INDEX IF NOT EXISTS idx_cash_shifts_status ON cash_shifts(status);

-- 3. KATEGORI KHUSUS BEANS (BIJI KOPI)
INSERT INTO categories (name, color, icon)
SELECT 'Beans', '#5C381E', 'package'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Beans');

-- 4. CONTOH PRODUK BEANS UNTUK PENGUJIAN
INSERT INTO products (name, base_price, category, emoji, active)
SELECT 'Ananta Beans 100g', 35000, 'Beans', 'package', true
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Ananta Beans 100g');

INSERT INTO products (name, base_price, category, emoji, active)
SELECT 'Damara Beans 250g', 75000, 'Beans', 'package', true
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Damara Beans 250g');

INSERT INTO products (name, base_price, category, emoji, active)
SELECT 'Damara Beans 1kg', 260000, 'Beans', 'package', true
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Damara Beans 1kg');

-- 5. PENGATURAN HAK AKSES RLS (ROW LEVEL SECURITY) AGAR BISA DIAKSES CLIENT
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_shifts ENABLE ROW LEVEL SECURITY;

-- Izinkan SELECT, INSERT, UPDATE untuk client dengan API key publishable / anon
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'attendance_all_access') THEN
        CREATE POLICY attendance_all_access ON attendance FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'cash_shifts_all_access') THEN
        CREATE POLICY cash_shifts_all_access ON cash_shifts FOR ALL USING (true) WITH CHECK (true);
    END IF;
END
$$;
