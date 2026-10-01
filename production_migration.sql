-- ══════════════════════════════════════════════════════════════════════
-- SKRIP MIGRASI PRODUCTION - TOKO KOPI SEMBILAN
-- Fitur: Absensi Karyawan, Kas Modal & Rekap Shift (Blind Count)
-- Jalankan skrip ini di SQL Editor Supabase Project Production (xujuhaddzxxxyvoiwuqo)
-- ══════════════════════════════════════════════════════════════════════

-- 1. TABEL ABSENSI KARYAWAN (ATTENDANCE)
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

-- Indeks untuk pencarian harian dan filter riwayat tanggal
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
CREATE INDEX IF NOT EXISTS idx_attendance_user ON attendance(user_name);

-- 2. TABEL KAS MODAL & SERAH TERIMA SHIFT (CASH SHIFTS)
CREATE TABLE IF NOT EXISTS cash_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_date DATE NOT NULL DEFAULT CURRENT_DATE,
    shift_type TEXT NOT NULL, -- 'pagi' | 'sore'
    cashier_name TEXT NOT NULL,
    starting_cash NUMERIC NOT NULL DEFAULT 0, -- Modal kas awal di laci (misal Rp 250.000)
    cash_sales NUMERIC DEFAULT 0, -- Total penjualan tunai selama shift
    expected_cash NUMERIC DEFAULT 0, -- starting_cash + cash_sales
    actual_cash NUMERIC, -- Uang fisik yang dihitung kasir saat tutup shift (blind count)
    difference NUMERIC, -- actual_cash - expected_cash (negatif = minus, 0 = klop)
    status TEXT NOT NULL DEFAULT 'open', -- 'open' | 'closed'
    opened_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indeks untuk query shift aktif dan rekap shift
CREATE INDEX IF NOT EXISTS idx_cash_shifts_date ON cash_shifts(shift_date);
CREATE INDEX IF NOT EXISTS idx_cash_shifts_status ON cash_shifts(status);

-- 3. PENGATURAN HAK AKSES RLS (ROW LEVEL SECURITY)
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_shifts ENABLE ROW LEVEL SECURITY;

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
