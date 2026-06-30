# 📂 Panduan Integrasi Auto-Backup Laporan Bulanan ke Google Drive (Paginasi Lengkap + Format Rupiah Universal + Tab Ringkasan)

Dokumen ini memandu Anda langkah demi langkah untuk menyiapkan **Skrip Pencadangan Otomatis (Auto-Backup)** laporan keuangan bulanan Kopi Sembilan langsung ke akun Google Drive Anda setiap awal bulan. 

Skrip versi terbaru ini telah disempurnakan untuk:
1. **Menarik Seluruh Transaksi Tanpa Batas (Paginasi)**: Supabase membatasi penarikan data maksimal 1.000 baris per panggilan. Skrip ini kini dilengkapi sistem perulangan (*pagination*) otomatis yang menarik data secara bertahap hingga seluruh transaksi bulan tersebut terambil 100% lengkap (menyelesaikan masalah transaksi malam yang terpotong).
2. **Koreksi Jam Transaksi (WIB)**: Menggunakan konversi zona waktu Jakarta (`Asia/Jakarta`) yang akurat sehingga jam transaksi di Excel sesuai dengan kenyataan di kasir.
3. **Format Rupiah Universal**: Menggunakan kode format `[$Rp-421]#,##0` agar angka tidak kacau akibat perbedaan setelan bahasa/regional (Indonesia/Inggris) pada Google Sheets Anda.
4. **Lebar Kolom Ringkasan Sempurna**: Menetapkan lebar kolom absolut pada tab **Ringkasan** agar semua angka dan keterangan terlihat jelas tanpa terpotong.

---

## 🛠️ Langkah 1: Siapkan Folder di Google Drive
1. Buka [Google Drive](https://drive.google.com) Anda.
2. Buat folder baru khusus untuk menyimpan laporan, misalnya beri nama: **"Laporan Kopi Sembilan"**.
3. Buka folder tersebut dan salin kode **ID Folder** di bagian akhir URL address bar browser Anda.
   * *Contoh*: Jika URL-nya adalah `https://drive.google.com/drive/folders/1aBcDeFgHiJkLmNoPqRsTuVwXyZ`, maka ID foldernya adalah **`1aBcDeFgHiJkLmNoPqRsTuVwXyZ`**.

---

## 📝 Langkah 2: Buat / Perbarui Skrip di Google Apps Script
1. Buka kembali proyek Anda di [Google Apps Script](https://script.google.com).
2. Hapus semua kode lama di dalam editor `Code.gs`.
3. Salin dan tempel (paste) skrip Google Sheets terbaru di bawah ini:

```javascript
/**
 * Skrip Auto-Backup Laporan Keuangan Kopi Sembilan ke Google Sheets
 * Menghasilkan file spreadsheet rapi, berformat Rupiah universal, auto-filter,
 * penarikan data bulanan lengkap (paginasi), dan Tab Ringkasan Formula otomatis.
 */
function backupLaporanKopiSembilan() {
  // ─── KONFIGURASI ───
  const SUPABASE_URL = "https://xujuhaddzxxxyvoiwuqo.supabase.co";
  const SUPABASE_KEY = "sb_publishable_7-mdoIDZAYQjeCZwQBkZ4A_YwViZlR5";
  
  // GANTI dengan ID Folder Google Drive Anda dari Langkah 1
  const FOLDER_ID = "MASUKKAN_ID_FOLDER_GOOGLE_DRIVE_DISINI"; 
  
  // ─── LOGIKA BULAN LALU ───
  const now = new Date();
  const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
  
  const formatISO = (date, isEnd) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return isEnd ? `${y}-${m}-${d}T23:59:59.999Z` : `${y}-${m}-${d}T00:00:00.000Z`;
  };
  
  const startDate = formatISO(firstDayLastMonth, false);
  const endDate = formatISO(lastDayLastMonth, true);
  
  const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const lastMonthName = monthNames[firstDayLastMonth.getMonth()];
  const year = firstDayLastMonth.getFullYear();
  const fileName = `Laporan_Keuangan_KopiSembilan_${lastMonthName}_${year}`;
  
  // ─── GET DATA SUPABASE DENGAN PAGINASI (MENARIK DATA > 1000 BARIS) ───
  const endpoint = `${SUPABASE_URL}/rest/v1/transactions?select=id,date,customer_phone,payment_method,payment_status,total,cash_amount,cash_change,cashier_name&date=gte.${startDate}&date=lte.${endDate}&order=date.asc`;
  
  let transactions = [];
  let fromRange = 0;
  let toRange = 999;
  let hasMore = true;
  
  Logger.log(`Mulai menarik data transaksi dari ${startDate} s/d ${endDate}...`);
  
  while (hasMore) {
    const rangeHeader = `${fromRange}-${toRange}`;
    const headers = {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Range": rangeHeader
    };
    
    const options = {
      "method": "get",
      "headers": headers,
      "muteHttpExceptions": true
    };
    
    try {
      const response = UrlFetchApp.fetch(endpoint, options);
      const code = response.getResponseCode();
      if (code !== 200) {
        Logger.log(`Gagal mengambil data range ${rangeHeader}. Code: ${code}. Detail: ${response.getContentText()}`);
        break;
      }
      
      const data = JSON.parse(response.getContentText());
      if (!data || data.length === 0) {
        hasMore = false;
      } else {
        transactions = transactions.concat(data);
        Logger.log(`Berhasil menarik ${data.length} transaksi (Total saat ini: ${transactions.length}).`);
        
        if (data.length < 1000) {
          hasMore = false; // Data sudah habis
        } else {
          fromRange += 1000;
          toRange += 1000;
        }
      }
    } catch (e) {
      Logger.log(`Error fetch: ${e.toString()}`);
      hasMore = false;
    }
  }
  
  if (transactions.length === 0) {
    Logger.log("Tidak ada transaksi pada bulan tersebut.");
    return;
  }
  
  Logger.log(`Selesai menarik data. Total transaksi terkumpul: ${transactions.length} baris.`);
  
  // ─── BUAT SPREADSHEET GOOGLE SHEETS BARU ───
  const ss = SpreadsheetApp.create(fileName);
  
  // Rename sheet pertama menjadi "Transaksi"
  const sheetTxn = ss.getSheets()[0];
  sheetTxn.setName("Transaksi");
  
  // 1. Tulis Header Laporan di tab Transaksi
  const headersList = [
    "ID Transaksi", "Tanggal & Waktu", "No WhatsApp", "Metode Pembayaran", 
    "Status Pembayaran", "Total Transaksi", "Uang Bayar", "Uang Kembali", "Nama Kasir"
  ];
  sheetTxn.appendRow(headersList);
  
  // 2. Susun Baris Data (Konversi zona waktu ke Asia/Jakarta secara akurat)
  const methodLabel = {
    cash: 'Tunai',
    qris: 'QRIS',
    transfer: 'Transfer',
    card: 'Debit Card'
  };
  
  const rowsData = [];
  transactions.forEach(t => {
    // PERBAIKAN ZONA WAKTU: Konversi UTC dari Supabase langsung ke WIB (Asia/Jakarta)
    const dateObj = new Date(t.date);
    const dateLocal = Utilities.formatDate(dateObj, "Asia/Jakarta", "dd/MM/yyyy HH:mm:ss");
    
    const row = [
      t.id,
      dateLocal,
      t.customer_phone || '-',
      methodLabel[t.payment_method] || String(t.payment_method || '-').toUpperCase(),
      t.payment_status,
      Number(t.total) || 0,
      t.payment_method === 'cash' ? (Number(t.cash_amount) || 0) : 0,
      t.payment_method === 'cash' ? (Number(t.cash_change) || 0) : 0,
      t.cashier_name
    ];
    rowsData.push(row);
  });
  
  // Tulis semua data transaksi ke sheet Transaksi
  if (rowsData.length > 0) {
    sheetTxn.getRange(2, 1, rowsData.length, headersList.length).setValues(rowsData);
  }
  
  // 3. Desain Header Transaksi (Warna cokelat tua Kopi Sembilan)
  const headerRange = sheetTxn.getRange(1, 1, 1, headersList.length);
  headerRange.setBackground("#4A3525")
             .setFontColor("#FFFFFF")
             .setFontWeight("bold")
             .setHorizontalAlignment("center")
             .setFontFamily("Arial")
             .setFontSize(10);
             
  // 4. Aktifkan Fitur Tombol Filter Otomatis
  sheetTxn.getDataRange().createFilter();
  
  // 5. Format Angka Rupiah Universal & Font Data Transaksi
  if (rowsData.length > 0) {
    const numRange = sheetTxn.getRange(2, 6, rowsData.length, 3);
    // Menggunakan format Rupiah universal agar tidak tertukar tanda koma/titik desimal di regional mana pun
    numRange.setNumberFormat('[$Rp-421]#,##0');
    
    const dataRange = sheetTxn.getRange(2, 1, rowsData.length, headersList.length);
    dataRange.setFontFamily("Arial")
             .setFontSize(9)
             .setVerticalAlignment("middle");
  }
  
  // 6. Atur tinggi baris data transaksi
  sheetTxn.setRowHeight(1, 26);
  for (let r = 2; r <= rowsData.length + 1; r++) {
    sheetTxn.setRowHeight(r, 20);
  }
  
  // 7. Auto Resize Lebar Kolom Transaksi
  for (let col = 1; col <= headersList.length; col++) {
    sheetTxn.autoResizeColumn(col);
    sheetTxn.setColumnWidth(col, sheetTxn.getColumnWidth(col) + 15);
  }
  
  // ─── BUAT TAB BARU: RINGKASAN PEMBAYARAN ───
  const sheetSummary = ss.insertSheet("Ringkasan");
  
  // 1. Tulis Judul Laporan Ringkasan
  sheetSummary.getRange("A1:C1").merge().setValue(`RINGKASAN PENDAPATAN BULANAN - ${lastMonthName.toUpperCase()} ${year}`)
              .setFontWeight("bold").setFontSize(11).setHorizontalAlignment("center").setFontColor("#FFFFFF").setBackground("#4A3525");
              
  // 2. Data Formula Ringkasan (Mengacu dinamis ke tab "Transaksi")
  const summaryData = [
    ["Metrik Keuangan", "Nilai", "Keterangan Analisis"],
    ["Total Pendapatan (Lunas)", "=SUMIF(Transaksi!E:E, \"Lunas\", Transaksi!F:F)", "Total uang masuk yang sudah lunas dibayar"],
    ["Rata-rata Transaksi (Lunas)", "=AVERAGEIF(Transaksi!E:E, \"Lunas\", Transaksi!F:F)", "Rata-rata nominal per transaksi berstatus lunas"],
    ["Jumlah Transaksi Lunas", "=COUNTIF(Transaksi!E:E, \"Lunas\")", "Total transaksi berstatus Lunas"],
    ["Jumlah Transaksi Menunggak", "=COUNTIF(Transaksi!E:E, \"Belum Bayar\")", "Total transaksi yang belum lunas dibayar"],
    ["", "", ""], // Baris pemisah
    ["Pendapatan Per Metode (Lunas)", "", ""], // Header sub
    ["Metode Tunai", "=SUMIFS(Transaksi!F:F, Transaksi!E:E, \"Lunas\", Transaksi!D:D, \"Tunai\")", "Total pendapatan via uang tunai"],
    ["Metode QRIS", "=SUMIFS(Transaksi!F:F, Transaksi!E:E, \"Lunas\", Transaksi!D:D, \"QRIS\")", "Total pendapatan via QRIS / E-Wallet"],
    ["Metode Transfer", "=SUMIFS(Transaksi!F:F, Transaksi!E:E, \"Lunas\", Transaksi!D:D, \"Transfer\")", "Total pendapatan via Bank Transfer"],
    ["Metode Debit Card", "=SUMIFS(Transaksi!F:F, Transaksi!E:E, \"Lunas\", Transaksi!D:D, \"Debit Card\")", "Total pendapatan via Mesin EDC / Kartu"]
  ];
  
  sheetSummary.getRange(3, 1, summaryData.length, 3).setValues(summaryData);
  
  // 3. Style Header Ringkasan (Baris 3)
  sheetSummary.getRange("A3:C3").setBackground("#F2EFE9").setFontWeight("bold").setHorizontalAlignment("center").setFontFamily("Arial").setFontSize(9);
  
  // 4. Style Sub-Header Pendapatan Per Metode (Baris 9)
  sheetSummary.getRange("A9:C9").setFontWeight("bold").setBackground("#EADBC8").setFontFamily("Arial").setFontSize(9);
  
  // 5. Format Angka & Rupiah Universal di Ringkasan
  sheetSummary.getRange("B4:B5").setNumberFormat('[$Rp-421]#,##0');
  sheetSummary.getRange("B10:B13").setNumberFormat('[$Rp-421]#,##0');
  sheetSummary.getRange("B6:B7").setNumberFormat('#,##0');
  
  // 6. Border & Font data ringkasan
  sheetSummary.getRange(3, 1, summaryData.length, 3)
              .setFontFamily("Arial")
              .setFontSize(9)
              .setVerticalAlignment("middle")
              .setBorder(true, true, true, true, true, true, "#D3D3D3", SpreadsheetApp.BorderStyle.SOLID);
              
  // 7. Atur tinggi baris ringkasan
  sheetSummary.setRowHeight(1, 26);
  for (let r = 3; r <= summaryData.length + 2; r++) {
    sheetSummary.setRowHeight(r, 20);
  }
  
  // 8. Tentukan Lebar Kolom Ringkasan Secara Pasti (Agar Angka Tidak Terpotong)
  sheetSummary.setColumnWidth(1, 220); // Kolom nama metrik
  sheetSummary.setColumnWidth(2, 130); // Kolom nilai angka
  sheetSummary.setColumnWidth(3, 280); // Kolom keterangan

  // ─── PINDAHKAN FILE KE FOLDER GOOGLE DRIVE ───
  const file = DriveApp.getFileById(ss.getId());
  let folder;
  if (FOLDER_ID && FOLDER_ID !== "MASUKKAN_ID_FOLDER_GOOGLE_DRIVE_DISINI") {
    folder = DriveApp.getFolderById(FOLDER_ID);
  } else {
    folder = DriveApp.getRootFolder();
  }
  folder.addFile(file);
  DriveApp.getRootFolder().removeFile(file);
  
  Logger.log(`Laporan Google Sheets rapi & Ringkasan berhasil dibuat: ${fileName}`);
}
```

4. Ganti ID folder pada baris 14 dengan ID folder Google Drive Anda.
5. Klik tombol **Save** (Simpan).
