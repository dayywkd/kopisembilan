// ══════════════════════════════════════════════
// STATE & CONFIG
// ══════════════════════════════════════════════
let currentUser = null;
let currentRole = 'admin';
let cart = [];
let products = [];
let transactions = [];
let selectedProductForVariant = null;
let editingProductId = null;
let storeInfo = { name: 'KopiSembilan', address: 'Jl. Kopi Nomor 9, Jember, Jawa Timur', phone: '085855180131' };

const DEFAULT_VARIANTS = [
  { group: 'Size', options: [{ name: 'Small', price: 0 }, { name: 'Medium', price: 5000 }, { name: 'Large', price: 10000 }] },
  { group: 'Sugar', options: [{ name: 'Normal', price: 0 }, { name: 'Less Sugar', price: 0 }, { name: 'No Sugar', price: 0 }] },
  { group: 'Add-on', options: [{ name: 'Extra Shot', price: 5000 }, { name: 'Oat Milk', price: 8000 }] }
];

// ══════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════
function switchRole(role) {
  currentRole = role;
  document.querySelectorAll('.role-tab').forEach((t, i) => {
    t.classList.toggle('active', (i === 0 && role === 'admin') || (i === 1 && role === 'kasir'));
  });
  const hint = document.getElementById('login-hint');
  if (role === 'admin') {
    hint.innerHTML = '<strong>Demo Admin:</strong> admin / admin123';
    document.getElementById('login-user').value = 'admin';
    document.getElementById('login-pass').value = 'admin123';
  } else {
    hint.innerHTML = '<strong>Demo Kasir:</strong> kasir / kasir123';
    document.getElementById('login-user').value = 'kasir';
    document.getElementById('login-pass').value = 'kasir123';
  }
}

async function doLogin() {
  const u = document.getElementById('login-user').value.trim();
  const p = document.getElementById('login-pass').value.trim();
  
  const { data: user, error } = await db
    .from('users')
    .select('*')
    .eq('username', u)
    .eq('password', p)
    .eq('active', true)
    .single();

  if (error || !user) {
    showToast('Username atau password salah!', 'error');
    return;
  }

  localStorage.setItem('ks_session', JSON.stringify(user));
  setupUserSession(user);
}

function setupUserSession(user) {
  currentUser = user;
  const frameLogin = document.getElementById('frame-login');
  const frameApp = document.getElementById('frame-app');
  if (frameLogin) frameLogin.classList.remove('active');
  if (frameApp) frameApp.classList.add('active');
  
  const nameEl = document.getElementById('user-display-name');
  const roleEl = document.getElementById('user-display-role');
  const avatarEl = document.getElementById('user-avatar');
  
  if (nameEl) nameEl.textContent = user.name;
  if (roleEl) roleEl.textContent = user.role === 'admin' ? 'Administrator' : 'Kasir';
  if (avatarEl) avatarEl.textContent = user.name[0].toUpperCase();

  const adminMenu = document.getElementById('admin-menu');
  const kasirMenu = document.getElementById('kasir-menu');
  const roleLabel = document.getElementById('sidebar-role-label');

  if (user.role === 'admin') {
    if (adminMenu) adminMenu.classList.remove('hidden');
    if (kasirMenu) kasirMenu.classList.add('hidden');
    if (roleLabel) roleLabel.textContent = 'Admin Panel';
    showPage('dashboard');
  } else {
    if (adminMenu) adminMenu.classList.add('hidden');
    if (kasirMenu) kasirMenu.classList.remove('hidden');
    if (roleLabel) roleLabel.textContent = 'Kasir Panel';
    showPage('cashier');
  }
  
  showToast('Selamat datang, ' + user.name + '!', 'success');
  loadProducts();
}

function doLogout() {
  if (!confirm('Yakin ingin keluar dari sistem?')) return;
  localStorage.removeItem('ks_session');
  currentUser = null;
  cart = [];
  const frameApp = document.getElementById('frame-app');
  const frameLogin = document.getElementById('frame-login');
  if (frameApp) frameApp.classList.remove('active');
  if (frameLogin) frameLogin.classList.add('active');
}

// ══════════════════════════════════════════════
// DATA LOADING
// ══════════════════════════════════════════════
async function loadStoreInfo() {
  try {
    const { data, error } = await db.from('settings').select('value').eq('key', 'store_info').single();
    if (!error && data) {
      storeInfo = data.value;
    }
  } catch (e) { console.log('Store info fail', e); }
}

async function saveStoreInfo() {
  const name = document.getElementById('settings-store-name').value.trim();
  const address = document.getElementById('settings-store-address').value.trim();
  const phone = document.getElementById('settings-store-phone').value.trim();

  const newInfo = { name, address, phone };
  const { error } = await db.from('settings').upsert({ key: 'store_info', value: newInfo });

  if (!error) {
    storeInfo = newInfo;
    showToast('Informasi toko berhasil disimpan!', 'success');
  } else {
    showToast('Gagal menyimpan ke database!', 'error');
  }
}

async function loadProducts() {
  await loadStoreInfo();
  try {
    const { data, error } = await db
      .from('products')
      .select('*, product_variants(*)')
      .eq('active', true);
    
    if (!error && data) {
      products = data;
    }
  } catch (e) { console.log('Products load fail', e); }

  const currentTitle = document.getElementById('page-title').textContent;
  const content = document.getElementById('page-content');
  if (content) {
    if (currentTitle === 'Dashboard') renderDashboard(content);
    if (currentTitle === 'Inventaris Produk') renderInventory(content);
    if (currentTitle === 'Kasir / POS') renderCashier(content);
  }
}

// ══════════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════════
const PAGE_TITLES = {
  dashboard: 'Dashboard', cashier: 'Kasir / POS', inventory: 'Inventaris Produk',
  report: 'Laporan Keuangan', users: 'Manajemen Pengguna', settings: 'Pengaturan', manual: 'Panduan Pengguna'
};

function showPage(page) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll(`.nav-item`).forEach(n => {
    if (n.getAttribute('onclick') && n.getAttribute('onclick').includes(`'${page}'`)) {
      n.classList.add('active');
    }
  });
  const titleEl = document.getElementById('page-title');
  if (titleEl) titleEl.textContent = PAGE_TITLES[page] || page;
  
  const content = document.getElementById('page-content');
  if (content) {
    content.innerHTML = '';
    const renders = {
      dashboard: renderDashboard, cashier: renderCashier, inventory: renderInventory,
      report: renderReport, users: renderUsers, settings: renderSettings, manual: renderManual
    };
    if (renders[page]) renders[page](content);
  }
  closeSidebar();
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (sidebar) sidebar.classList.toggle('open');
  if (overlay) overlay.classList.toggle('open');
}
function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (sidebar) sidebar.classList.remove('open');
  if (overlay) overlay.classList.remove('open');
}

// ══════════════════════════════════════════════
// KASIR / POS
// ══════════════════════════════════════════════
function renderCashier(el) {
  el.innerHTML = `
    <div class="pos-layout">
      <div style="display:flex;flex-direction:column;gap:16px;overflow:hidden;">
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-brown btn-sm cat-btn active" onclick="filterCat(this,'Semua')">Semua</button>
          ${['Kopi Panas','Kopi Dingin','Non-Kopi','Makanan','Snack'].map(c =>
            `<button class="btn btn-outline btn-sm cat-btn" onclick="filterCat(this,'${c}')">${c}</button>`
          ).join('')}
        </div>
        <div class="menu-grid" id="menu-grid" style="overflow-y:auto;max-height:calc(100vh - 200px);padding-bottom:16px;">
          ${renderMenuItems('Semua')}
        </div>
      </div>
      <div class="cart-panel">
        <div class="cart-header">🛒 Keranjang <span id="cart-count" style="font-size:13px;color:var(--text-muted);font-family:'DM Sans';">0 item</span></div>
        <div class="cart-items" id="cart-items"><div style="text-align:center;padding:40px 20px;color:var(--text-muted);font-size:13px;">Pilih produk dari menu</div></div>
        <div class="cart-summary">
          <div class="summary-row total"><span>TOTAL</span><span id="total-val">Rp 0</span></div>
          <button class="pay-btn" id="pay-btn" disabled onclick="openPayment()">BAYAR</button>
          <button class="btn btn-outline w-full" style="margin-top:8px;" onclick="clearCart()">🗑 Kosongkan</button>
        </div>
      </div>
    </div>
  `;
}

function renderMenuItems(cat) {
  if (!products || products.length === 0) return '<div style="text-align:center; padding:20px; color:var(--text-muted);">Belum ada produk.</div>';
  return products.map(p => {
    if (cat !== 'Semua' && p.category !== cat) return '';
    return `
      <div class="menu-card" onclick="openVariantModal(${p.id})">
        <span class="emoji">${p.emoji || '☕'}</span>
        <div class="mname">${p.name}</div>
        <div class="mprice">${fmtRp(p.base_price)}</div>
      </div>
    `;
  }).join('');
}

function filterCat(btn, cat) {
  document.querySelectorAll('.cat-btn').forEach(b => { b.classList.remove('btn-brown'); b.classList.add('btn-outline'); });
  btn.classList.add('btn-brown'); btn.classList.remove('btn-outline');
  const menuGrid = document.getElementById('menu-grid');
  if (menuGrid) menuGrid.innerHTML = renderMenuItems(cat);
}

// ─── VARIANTS LOGIC ───
function openVariantModal(productId) {
  const product = products.find(p => p.id === productId);
  if (!product) return;
  selectedProductForVariant = product;
  
  const title = document.getElementById('variant-product-name');
  if (title) title.textContent = (product.emoji || '☕') + ' ' + product.name;
  
  const body = document.getElementById('variant-modal-body');
  if (!body) return;
  body.innerHTML = '';

  const variantGroups = product.product_variants && product.product_variants.length > 0 
    ? groupVariants(product.product_variants) 
    : DEFAULT_VARIANTS;

  variantGroups.forEach(group => {
    const groupEl = document.createElement('div');
    groupEl.className = 'variant-group';
    groupEl.innerHTML = `<label class="variant-group-label">${group.group || group.group_name}</label>`;
    const optionsEl = document.createElement('div');
    optionsEl.className = 'variant-options';
    
    group.options.forEach((opt, idx) => {
      const optEl = document.createElement('div');
      optEl.className = `variant-option ${idx === 0 ? 'selected' : ''}`;
      optEl.dataset.group = group.group || group.group_name;
      optEl.dataset.name = opt.name;
      optEl.dataset.price = opt.price ?? opt.price_modifier ?? 0;
      optEl.innerHTML = `${opt.name} <span class="price-mod">${(parseInt(optEl.dataset.price)) > 0 ? '+' + fmtRp(optEl.dataset.price) : ''}</span>`;
      optEl.onclick = () => {
        groupEl.querySelectorAll('.variant-option').forEach(o => o.classList.remove('selected'));
        optEl.classList.add('selected');
      };
      optionsEl.appendChild(optEl);
    });
    groupEl.appendChild(optionsEl);
    body.appendChild(groupEl);
  });

  const noteInput = document.getElementById('item-note');
  if (noteInput) noteInput.value = '';
  
  const confirmBtn = document.getElementById('add-to-cart-confirm');
  if (confirmBtn) confirmBtn.onclick = () => addToCartConfirmed();
  
  openModal('modal-variant');
}

function groupVariants(variants) {
  const groups = {};
  variants.forEach(v => {
    if (!groups[v.group_name]) groups[v.group_name] = { group: v.group_name, options: [] };
    groups[v.group_name].options.push(v);
  });
  return Object.values(groups);
}

function addToCartConfirmed() {
  const selectedOptions = [];
  let extraPrice = 0;
  document.querySelectorAll('.variant-option.selected').forEach(opt => {
    const p = parseInt(opt.dataset.price) || 0;
    selectedOptions.push({ group: opt.dataset.group, name: opt.dataset.name, price: p });
    extraPrice += p;
  });

  const itemNote = document.getElementById('item-note').value.trim();
  const totalPrice = selectedProductForVariant.base_price + extraPrice;

  cart.push({
    productId: selectedProductForVariant.id,
    name: selectedProductForVariant.name,
    emoji: selectedProductForVariant.emoji,
    basePrice: selectedProductForVariant.base_price,
    totalPrice: totalPrice,
    qty: 1,
    variants: selectedOptions,
    note: itemNote
  });

  updateCartUI();
  closeModal('modal-variant');
  showToast(selectedProductForVariant.name + ' ditambahkan', 'success');
}

function updateCartUI() {
  const cartEl = document.getElementById('cart-items');
  const cartCount = document.getElementById('cart-count');
  const payBtn = document.getElementById('pay-btn');
  const totalValEl = document.getElementById('total-val');
  if (!cartEl) return;

  if (cart.length === 0) {
    cartEl.innerHTML = '<div style="text-align:center;padding:40px 20px;color:var(--text-muted);font-size:13px;">Pilih produk dari menu</div>';
    if (cartCount) cartCount.textContent = '0 item';
    if (payBtn) payBtn.disabled = true;
    if (totalValEl) totalValEl.textContent = 'Rp 0';
    return;
  }

  const total = cart.reduce((s, c) => s + (c.totalPrice * c.qty), 0);
  cartEl.innerHTML = cart.map((c, idx) => `
    <div class="cart-item">
      <div class="cart-item-row">
        <span style="font-size:16px;">${c.emoji || '☕'}</span>
        <div class="ci-name">${c.name}</div>
        <div class="flex items-center gap-2">
           <button class="qty-btn" onclick="changeQty(${idx},-1)">−</button>
           <span style="font-size:13px;font-weight:600;min-width:15px;text-align:center;">${c.qty}</span>
           <button class="qty-btn" onclick="changeQty(${idx},1)">+</button>
        </div>
        <div class="ci-price">${fmtRp(c.totalPrice * c.qty)}</div>
      </div>
      ${c.variants.length > 0 ? `<div class="ci-variants">${c.variants.map(v => v.name).join(', ')}</div>` : ''}
      ${c.note ? `<div class="ci-note">📝 ${c.note}</div>` : ''}
    </div>
  `).join('');

  if (cartCount) cartCount.textContent = cart.length + ' item';
  if (totalValEl) totalValEl.textContent = fmtRp(total);
  if (payBtn) payBtn.disabled = false;
}

function changeQty(idx, delta) {
  cart[idx].qty += delta;
  if (cart[idx].qty <= 0) cart.splice(idx, 1);
  updateCartUI();
}

function clearCart() {
  if (cart.length === 0) return;
  if (!confirm('Kosongkan keranjang?')) return;
  cart = [];
  updateCartUI();
}

// ─── PAYMENT LOGIC ───
let selectedPaymentMethod = 'cash';

function selectPayMethod(el) {
  document.querySelectorAll('.pay-method-card').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  selectedPaymentMethod = el.dataset.method;
  
  const qris = document.getElementById('qris-display');
  const cashWrap = document.getElementById('cash-input-wrap');
  const changeDisplay = document.getElementById('change-display');

  if (qris) qris.style.display = selectedPaymentMethod === 'qris' ? 'block' : 'none';
  if (cashWrap) cashWrap.style.display = selectedPaymentMethod === 'cash' ? 'block' : 'none';
  if (selectedPaymentMethod !== 'cash' && changeDisplay) changeDisplay.style.display = 'none';
}

function openPayment() {
  const total = cart.reduce((s, c) => s + (c.totalPrice * c.qty), 0);
  const now = new Date();
  const txnId = 'TXN-' + now.toISOString().slice(0,10).replace(/-/g,'') + '-' + Math.floor(1000 + Math.random() * 9000);
  
  const preview = document.getElementById('receipt-preview');
  if (preview) {
    preview.innerHTML = `
      <div style="text-align:center; margin-bottom:10px;">
        <h2 style="font-family:'DM Serif Display';">${storeInfo.name}</h2>
        <p style="font-size:11px; color:#666;">${storeInfo.address}</p>
      </div>
      <hr style="border:none; border-top:1px dashed #ccc; margin:10px 0;">
      <div style="font-size:12px; display:flex; justify-content:space-between;"><span>${now.toLocaleDateString('id-ID')}</span><span>${now.toLocaleTimeString('id-ID')}</span></div>
      <div style="font-size:12px;">Kasir: ${currentUser ? currentUser.name : 'Staf'}</div>
      <div style="font-size:12px;">ID: ${txnId}</div>
      <hr style="border:none; border-top:1px dashed #ccc; margin:10px 0;">
      ${cart.map(c => `
        <div style="margin-bottom:6px;">
          <div style="display:flex; justify-content:space-between; font-size:12px; font-weight:600;">
            <span>${c.name} x${c.qty}</span>
            <span>${fmtRp(c.totalPrice * c.qty)}</span>
          </div>
          ${c.variants.length > 0 ? `<div style="font-size:10px; color:#666; font-style:italic;">${c.variants.map(v => v.name).join(', ')}</div>` : ''}
          ${c.note ? `<div style="font-size:10px; color:#888;">Note: ${c.note}</div>` : ''}
        </div>
      `).join('')}
      <hr style="border:none; border-top:1px dashed #ccc; margin:10px 0;">
      <div style="display:flex; justify-content:space-between; font-weight:700; font-size:14px;">
        <span>TOTAL</span>
        <span>${fmtRp(total)}</span>
      </div>
    `;
  }

  const cashIn = document.getElementById('cash-input');
  const custPhone = document.getElementById('customer-phone');
  const txnNote = document.getElementById('txn-note');
  const changeDisp = document.getElementById('change-display');

  if (cashIn) cashIn.value = '';
  if (custPhone) custPhone.value = '';
  if (txnNote) txnNote.value = '';
  if (changeDisp) changeDisp.style.display = 'none';
  
  openModal('modal-payment');
}

function calcChange() {
  const total = cart.reduce((s, c) => s + (c.totalPrice * c.qty), 0);
  const paid = parseInt(document.getElementById('cash-input').value) || 0;
  const changeEl = document.getElementById('change-display');
  const changeAmtEl = document.getElementById('change-amount');
  if (paid >= total) {
    if (changeEl) changeEl.style.display = 'block';
    if (changeAmtEl) changeAmtEl.textContent = fmtRp(paid - total);
  } else {
    if (changeEl) changeEl.style.display = 'none';
  }
}

async function confirmPayment() {
  const total = cart.reduce((s, c) => s + (c.totalPrice * c.qty), 0);
  const phone = document.getElementById('customer-phone').value.trim();
  const status = document.getElementById('payment-status').value;
  const note = document.getElementById('txn-note').value.trim();
  const now = new Date();
  const txnId = 'TXN-' + now.toISOString().slice(0,10).replace(/-/g,'') + '-' + Math.floor(1000 + Math.random() * 9000);

  if (selectedPaymentMethod === 'cash') {
    const paid = parseInt(document.getElementById('cash-input').value) || 0;
    if (paid < total && status === 'Lunas') { showToast('Jumlah bayar kurang!', 'error'); return; }
  }

  try {
    const { data: txn, error: txnErr } = await db
      .from('transactions')
      .insert([{
        id: txnId,
        total: total,
        customer_phone: phone,
        payment_method: selectedPaymentMethod,
        payment_status: status,
        notes: note,
        cashier_name: currentUser ? currentUser.name : 'Kasir'
      }])
      .select()
      .single();

    if (txnErr) { showToast('Gagal menyimpan transaksi!', 'error'); return; }

    const itemsToInsert = cart.map(c => ({
      transaction_id: txnId,
      product_id: c.productId,
      qty: c.qty,
      price: c.totalPrice,
      selected_variants: c.variants,
      item_note: c.note
    }));

    const { error: itemsErr } = await db.from('transaction_items').insert(itemsToInsert);
    if (itemsErr) { console.log('Item insert fail', itemsErr); }

    if (phone) sendWhatsAppReceipt(phone, txnId, total, cart);

    showToast('Transaksi Berhasil!', 'success');
    cart = [];
    updateCartUI();
    closeModal('modal-payment');
    const pageTitle = document.getElementById('page-title').textContent;
    if (pageTitle === 'Dashboard') renderDashboard(document.getElementById('page-content'));
  } catch (e) {
    showToast('Terjadi kesalahan sistem!', 'error');
  }
}

function sendWhatsAppReceipt(phone, txnId, total, items) {
  let message = `*INVOICE ${storeInfo.name.toUpperCase()}*\n`;
  message += `ID: ${txnId}\n`;
  message += `Tanggal: ${new Date().toLocaleDateString()}\n`;
  message += `----------------------------\n`;
  items.forEach(c => {
    message += `• ${c.name} x${c.qty} = ${fmtRp(c.totalPrice * c.qty)}\n`;
    if (c.variants && c.variants.length > 0) message += `  (${c.variants.map(v => v.name).join(', ')})\n`;
    if (c.note) message += `  Note: ${c.note}\n`;
  });
  message += `----------------------------\n`;
  message += `*TOTAL: ${fmtRp(total)}*\n\n`;
  message += `Terima kasih sudah memesan! ☕`;

  const encoded = encodeURIComponent(message);
  const waUrl = `https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${encoded}`;
  window.open(waUrl, '_blank');
}

// ══════════════════════════════════════════════
// REPORTS
// ══════════════════════════════════════════════
async function renderReport(el) {
  el.innerHTML = `<div style="text-align:center; padding:40px;">Memuat data laporan...</div>`;
  
  let txns = [];
  try {
    let { data, error } = await db
      .from('transactions')
      .select('*, transaction_items(*)')
      .order('date', { ascending: false });
    
    if (error || !data || data.length === 0) {
      txns = generateDummyTransactions();
    } else {
      txns = data;
    }
  } catch (e) {
    txns = generateDummyTransactions();
  }

  const renderContent = (status) => {
    const filtered = status === 'Semua' ? txns : txns.filter(t => t.payment_status === status);
    const totalRev = filtered.reduce((s, t) => s + t.total, 0);
    const avgTxn = filtered.length ? Math.round(totalRev / filtered.length) : 0;
    const lunasCount = filtered.filter(t => t.payment_status === 'Lunas').length;

    const rows = filtered.map(t => `
      <tr>
        <td><span style="font-family:monospace; font-size:11px;">${t.id}</span></td>
        <td>${new Date(t.date).toLocaleString('id-ID', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'})}</td>
        <td>${t.customer_phone || '-'}</td>
        <td><span class="badge ${t.payment_method === 'cash' ? 'badge-brown' : 'badge-blue'}">${t.payment_method.toUpperCase()}</span></td>
        <td><span class="badge ${t.payment_status === 'Lunas' ? 'badge-green' : 'badge-red'}">${t.payment_status}</span></td>
        <td style="font-weight:600;">${fmtRp(t.total)}</td>
        <td><button class="btn btn-outline btn-sm" onclick="viewTxnDetail('${t.id}')">👁️</button></td>
      </tr>
    `).join('');
    
    return `
      <div class="report-summary">
        <div class="report-card">
          <div class="label">Total Pendapatan</div>
          <div class="value">${fmtRp(totalRev)}</div>
          <div class="sub-value">Dilihat dari ${filtered.length} transaksi</div>
        </div>
        <div class="report-card">
          <div class="label">Rata-rata Transaksi</div>
          <div class="value">${fmtRp(avgTxn)}</div>
          <div class="sub-value">Per kunjungan pelanggan</div>
        </div>
        <div class="report-card">
          <div class="label">Status Lunas</div>
          <div class="value">${lunasCount}</div>
          <div class="sub-value">${filtered.length - lunasCount} Menunggu pembayaran</div>
        </div>
      </div>
      <div class="card">
        <div style="overflow-x:auto;">
          <table class="table">
            <thead><tr><th>ID</th><th>Waktu</th><th>WhatsApp</th><th>Metode</th><th>Status</th><th>Total</th><th>Aksi</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="7" style="text-align:center;">Tidak ada data transaksi</td></tr>'}</tbody>
          </table>
        </div>
      </div>
    `;
  };

  el.innerHTML = `
    <div class="filter-bar">
      <div style="display:flex; align-items:center; gap:10px;">
        <span style="font-size:13px; font-weight:600; color:var(--text-muted);">FILTER:</span>
        <select class="select-input" onchange="document.getElementById('report-container').innerHTML = renderReportTable(this.value)">
          <option value="Semua">Semua Status</option>
          <option value="Lunas">Lunas</option>
          <option value="Belum Bayar">Belum Bayar</option>
        </select>
      </div>
      <button class="btn btn-outline btn-sm" style="margin-left:auto;" onclick="showToast('Export CSV segera hadir')">📥 Export CSV</button>
    </div>
    <div id="report-container">${renderContent('Semua')}</div>
  `;
  window.renderReportTable = renderContent;
}

function generateDummyTransactions() {
  const dummy = [];
  const now = new Date();
  for (let i = 1; i <= 10; i++) {
    const date = new Date(now);
    date.setHours(now.getHours() - i * 2);
    dummy.push({
      id: `TXN-DEMO-${1000 + i}`,
      date: date.toISOString(),
      customer_phone: '081234567' + i,
      total: 25000 + (Math.floor(Math.random() * 5) * 5000),
      payment_method: ['cash', 'qris', 'card'][Math.floor(Math.random() * 3)],
      payment_status: Math.random() > 0.2 ? 'Lunas' : 'Belum Bayar',
      notes: i % 3 === 0 ? 'Tanpa sedotan' : '',
      cashier_name: 'Demo Admin'
    });
  }
  return dummy;
}

// ══════════════════════════════════════════════
// INVENTARIS / PRODUCTS
// ══════════════════════════════════════════════
function renderInventory(el) {
  el.innerHTML = `
    <div class="inv-actions">
      <div class="search-wrapper">
        <span class="search-icon">🔍</span>
        <input type="text" class="search-input" id="inv-search-input" placeholder="Cari nama produk atau kategori..." oninput="filterInventory(this.value)">
      </div>
      <button class="btn btn-brown" onclick="openAddProduct()">+ Tambah Produk</button>
    </div>
    <div class="card">
      <div style="overflow-x:auto;">
        <table class="table">
          <thead><tr><th>Produk</th><th>Kategori</th><th>Harga Dasar</th><th>Aksi</th></tr></thead>
          <tbody id="inv-tbody">${renderInventoryRows(products)}</tbody>
        </table>
      </div>
    </div>
  `;
}

function renderInventoryRows(data) {
  if (!data || data.length === 0) return '<tr><td colspan="4" style="text-align:center; padding:30px; color:var(--text-muted);">Belum ada produk terdaftar.</td></tr>';
  return data.map(p => `
    <tr id="prod-row-${p.id}">
      <td><span style="font-size:18px; margin-right:8px;">${p.emoji || '☕'}</span> <strong>${p.name}</strong></td>
      <td><span class="badge badge-brown">${p.category}</span></td>
      <td style="font-weight:700; color:var(--accent);">${fmtRp(p.base_price)}</td>
      <td>
        <div style="display:flex; gap:6px;">
          <button class="btn btn-outline btn-sm" onclick="editProduct(${p.id})" title="Edit">✏️</button>
          <button class="btn btn-red btn-sm" onclick="deleteProduct(${p.id})" title="Hapus">🗑</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function filterInventory(query) {
  const q = query.toLowerCase();
  const filtered = products.filter(p => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
  const tbody = document.getElementById('inv-tbody');
  if (tbody) tbody.innerHTML = renderInventoryRows(filtered);
}

function openAddProduct() {
  editingProductId = null;
  const title = document.getElementById('modal-product-title');
  if (title) title.textContent = 'Tambah Produk';
  const nameIn = document.getElementById('prod-name');
  const priceIn = document.getElementById('prod-price');
  const emojiIn = document.getElementById('prod-emoji');
  if (nameIn) nameIn.value = '';
  if (priceIn) priceIn.value = '';
  if (emojiIn) emojiIn.value = '☕';
  openModal('modal-product');
}

function editProduct(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  editingProductId = id;
  const title = document.getElementById('modal-product-title');
  if (title) title.textContent = 'Edit Produk';
  document.getElementById('prod-name').value = p.name;
  document.getElementById('prod-price').value = p.base_price;
  document.getElementById('prod-category').value = p.category;
  document.getElementById('prod-emoji').value = p.emoji || '☕';
  openModal('modal-product');
}

async function saveProduct() {
  const name = document.getElementById('prod-name').value.trim();
  const price = parseInt(document.getElementById('prod-price').value);
  const cat = document.getElementById('prod-category').value;
  const emoji = document.getElementById('prod-emoji').value;
  if (!name || isNaN(price)) { showToast('Nama and harga wajib diisi!', 'error'); return; }

  let error;
  if (editingProductId) {
    const { error: err } = await db.from('products').update({ name, base_price: price, category: cat, emoji }).eq('id', editingProductId);
    error = err;
  } else {
    const { error: err } = await db.from('products').insert([{ name, base_price: price, category: cat, emoji }]);
    error = err;
  }

  if (!error) {
    showToast(editingProductId ? 'Produk diperbarui!' : 'Produk ditambahkan!', 'success');
    await loadProducts();
    closeModal('modal-product');
  } else {
    showToast('Gagal menyimpan ke database!', 'error');
  }
}

async function deleteProduct(id) {
  if (!confirm('Hapus produk ini secara permanen?')) return;
  const { error } = await db.from('products').delete().eq('id', id);
  if (!error) {
    showToast('Produk berhasil dihapus!', 'success');
    await loadProducts();
  } else {
    showToast('Gagal menghapus produk!', 'error');
  }
}

// ══════════════════════════════════════════════
// USERS MANAGEMENT
// ══════════════════════════════════════════════
async function renderUsers(el) {
  el.innerHTML = `<div style="text-align:center; padding:40px;">Memuat data pengguna...</div>`;
  let users = [];
  try {
    let { data, error } = await db.from('users').select('*').order('id', { ascending: true });
    if (error || !data || data.length === 0) {
      users = [
        { id: 1, name: 'Admin Utama', username: 'admin', role: 'admin', active: true },
        { id: 2, name: 'Siti Kasir', username: 'kasir', role: 'kasir', active: true }
      ];
    } else { users = data; }
  } catch(e) { users = [{ id: 1, name: 'Demo Admin', username: 'admin', role: 'admin', active: true }]; }

  const rows = users.map(u => `
    <tr>
      <td>
        <div class="flex items-center gap-3">
          <div class="user-avatar" style="background: ${u.role === 'admin' ? 'var(--accent)' : 'var(--brown-600)'}">${u.name ? u.name[0] : 'U'}</div>
          <div><div style="font-weight:600;">${u.name || u.username}</div><div style="font-size:11px; color:var(--text-muted);">Terdaftar: 2026</div></div>
        </div>
      </td>
      <td><span style="font-family:monospace;">@${u.username}</span></td>
      <td><span class="badge ${u.role === 'admin' ? 'badge-amber' : 'badge-blue'}">${u.role.toUpperCase()}</span></td>
      <td><span class="badge ${u.active ? 'badge-green' : 'badge-red'}">${u.active ? 'Aktif' : 'Non-Aktif'}</span></td>
      <td>
        <div class="flex gap-2">
           <button class="btn btn-outline btn-sm" onclick="showToast('Fitur edit segera hadir')">✏️</button>
           <button class="btn btn-red btn-sm" onclick="showToast('Akses ditolak')">🗑</button>
        </div>
      </td>
    </tr>
  `).join('');
  el.innerHTML = `
    <div class="inv-actions">
      <div style="flex:1;"><h3 style="font-family:'DM Serif Display'; font-size:20px; color:var(--brown-800);">Kelola Tim Kasir</h3><p style="font-size:12px; color:var(--text-muted);">Daftar akun yang dapat mengakses sistem KopiSembilan.</p></div>
      <button class="btn btn-brown" onclick="showToast('Fitur tambah pengguna segera hadir')">+ Tambah Akun</button>
    </div>
    <div class="card"><div style="overflow-x:auto;"><table class="table"><thead><tr><th>Nama Lengkap</th><th>Username</th><th>Role</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${rows}</tbody></table></div></div>
  `;
}

function renderSettings(el) {
  el.innerHTML = `
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;" class="responsive-grid">
      <div class="card">
        <div class="card-header"><h3>🏪 Informasi Toko</h3></div>
        <div class="card-body">
          <div class="form-group"><label>Nama Cafe / Toko</label><input type="text" class="form-input" id="settings-store-name" value="${storeInfo.name}"></div>
          <div class="form-group"><label>Alamat Lengkap</label><textarea class="form-input" id="settings-store-address" rows="3" style="resize:none;">${storeInfo.address}</textarea></div>
          <div class="form-group"><label>No. Telepon / WhatsApp Bisnis</label><input type="text" class="form-input" id="settings-store-phone" value="${storeInfo.phone}"></div>
          <button class="btn btn-brown w-full" onclick="saveStoreInfo()">Simpan Identitas</button>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h3>📱 Konfigurasi Pembayaran</h3></div>
        <div class="card-body">
          <div class="form-group"><label>Status Sistem QRIS</label><select class="form-select"><option>Aktif (Auto-Generate)</option><option>Non-Aktif (Manual)</option></select></div>
          <div class="form-group"><label>Metode Pembayaran Tersedia</label><div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:8px;"><span class="badge badge-green">Cash</span><span class="badge badge-green">QRIS</span><span class="badge badge-green">Transfer</span><span class="badge badge-green">Debit Card</span></div></div>
          <div class="form-group"><label>Template Pesan WhatsApp</label><textarea class="form-input" rows="4" style="resize:none; font-size:12px;">Halo [Pelanggan], Terima kasih telah memesan di KopiSembilan. Berikut adalah struk digital Anda: [Link_Invoice]</textarea></div>
          <button class="btn btn-brown w-full" onclick="showToast('Konfigurasi diperbarui!', 'success')">Simpan Konfigurasi</button>
        </div>
      </div>
    </div>
    <style>.responsive-grid{display:grid; grid-template-columns:1fr 1fr;} @media(max-width:768px){.responsive-grid{grid-template-columns:1fr;}}</style>
  `;
}

function renderManual(el) {
  const guides = [
    { title: '☕ Memulai Transaksi Baru', content: 'Klik menu <strong>Kasir / POS</strong>, lalu pilih produk. Jika produk memiliki varian, pilih ukuran dan opsi yang diinginkan sebelum menambahkan ke keranjang.' },
    { title: '💬 Mengirim Struk via WhatsApp', content: 'Di modal pembayaran, masukkan nomor WhatsApp pelanggan (diawali 08...). Setelah klik selesai, browser akan otomatis membuka tab baru menuju WhatsApp dengan format invoice lengkap.' },
    { title: '📝 Catatan Item & Transaksi', content: 'Gunakan fitur <strong>Note</strong> untuk instruksi khusus seperti "Sedikit Es" atau "Tanpa Gula". Catatan ini akan muncul di ringkasan pesanan and struk digital.' },
    { title: '📊 Memantau Laporan', content: 'Halaman Laporan menampilkan pendapatan secara real-time dari Supabase. Anda dapat memfilter transaksi berdasarkan status <strong>Lunas</strong> atau <strong>Belum Bayar</strong>.' }
  ];
  const guideHtml = guides.map((g, i) => `
    <div class="card" style="margin-bottom:12px;"><div class="card-body" style="padding:16px;"><div style="display:flex; gap:12px; align-items:flex-start;"><div style="width:28px; height:28px; border-radius:50%; background:var(--brown-100); color:var(--brown-700); display:flex; align-items:center; justify-content:center; font-weight:700; flex-shrink:0;">${i+1}</div><div><h4 style="color:var(--brown-900); margin-bottom:4px;">${g.title}</h4><p style="font-size:13px; color:var(--text-muted); line-height:1.6;">${g.content}</p></div></div></div></div>
  `).join('');
  el.innerHTML = `
    <div style="max-width:800px; margin:0 auto;"><div style="text-align:center; margin-bottom:30px;"><h2 style="font-family:'DM Serif Display'; font-size:28px; color:var(--brown-900);">Pusat Bantuan KopiSembilan</h2><p style="color:var(--text-muted);">Panduan singkat penggunaan sistem kasir modern berbasis cloud.</p></div>${guideHtml}<div style="background:var(--blue-light); padding:20px; border-radius:var(--radius); border-left:4px solid var(--blue); margin-top:20px;"><h4 style="color:var(--blue); margin-bottom:8px;">💡 Butuh Bantuan Lanjut?</h4><p style="font-size:13px; color:var(--text); line-height:1.6;">Hubungi tim IT KopiSembilan melalui WhatsApp di nomor <strong>085855180131</strong> jika Anda mengalami kendala teknis atau masalah koneksi database.</p></div></div>
  `;
}

async function viewTxnDetail(id) {
  const { data: txn, error } = await db.from('transactions').select('*, transaction_items(*, products(*))').eq('id', id).single();
  if (error || !txn) { showToast('Gagal memuat detail transaksi!', 'error'); return; }
  let itemHtml = txn.transaction_items.map(i => `
    <div style="padding:10px; border-bottom:1px solid var(--border);"><div style="display:flex; justify-content:space-between; font-weight:600;"><span>${i.products?.emoji || '☕'} ${i.products?.name} x${i.qty}</span><span>${fmtRp(i.price * i.qty)}</span></div>${i.selected_variants ? `<div style="font-size:11px; color:var(--text-muted); font-style:italic;">${i.selected_variants.map(v => v.name).join(', ')}</div>` : ''}${i.item_note ? `<div style="font-size:11px; color:var(--brown-500);">Note: ${i.item_note}</div>` : ''}</div>
  `).join('');
  const detailHtml = `<div style="font-family:'Courier New', monospace; font-size:13px;"><p><strong>ID:</strong> ${txn.id}</p><p><strong>Waktu:</strong> ${new Date(txn.date).toLocaleString('id-ID')}</p><p><strong>Kasir:</strong> ${txn.cashier_name}</p><p><strong>Status:</strong> ${txn.payment_status}</p><p><strong>WA:</strong> ${txn.customer_phone || '-'}</p>${txn.notes ? `<p><strong>Note:</strong> ${txn.notes}</p>` : ''}<hr style="border:none; border-top:1px dashed #ccc; margin:10px 0;">${itemHtml}<div style="display:flex; justify-content:space-between; font-weight:700; font-size:15px; margin-top:10px;"><span>TOTAL</span><span>${fmtRp(txn.total)}</span></div></div>`;
  document.getElementById('receipt-preview').innerHTML = detailHtml;
  document.getElementById('modal-payment').classList.add('open');
  const modalTitle = document.querySelector('#modal-payment .modal-header h3');
  if (modalTitle) modalTitle.textContent = 'Detail Transaksi';
  const payInputs = document.querySelector('#modal-payment .modal-body > div:nth-child(2)');
  if (payInputs) payInputs.style.display = 'none';
  const footer = document.querySelector('#modal-payment .modal-footer');
  if (footer) footer.innerHTML = `<button class="btn btn-brown w-full" onclick="closeModal('modal-payment'); showPage('report');">Tutup</button>`;
}

async function renderDashboard(el) {
  let txns = [];
  try {
    let { data } = await db.from('transactions').select('*');
    if (!data || data.length === 0) { txns = generateDummyTransactions(); } else { txns = data; }
  } catch(e) { txns = generateDummyTransactions(); }

  const totalRev = (txns || []).reduce((s, t) => s + t.total, 0);
  const totalCount = (txns || []).length;

  el.innerHTML = `
    <div style="margin-bottom:24px; text-align:left;">
      <h2 style="font-family:'DM Serif Display'; font-size:32px; color:var(--brown-900); margin-bottom:4px;">Halo, ${currentUser ? currentUser.name : 'User'}! 👋</h2>
      <p style="color:var(--text-muted);">Berikut adalah ringkasan performa cafe Anda hari ini.</p>
    </div>
    <div class="stats-grid">
      <div class="stat-card"><div class="label">Total Pendapatan</div><div class="value">${fmtRp(totalRev)}</div><div class="change up">✓ Akumulasi Semua</div></div>
      <div class="stat-card"><div class="label">Total Transaksi</div><div class="value">${totalCount}</div><div class="change up">▲ Transaksi Berhasil</div></div>
      <div class="stat-card"><div class="label">Produk Aktif</div><div class="value">${products.length || 12}</div><div class="change up">✓ Menu Terdaftar</div></div>
    </div>
    <div class="card" style="background: var(--brown-900); color: white; border: none; padding: 10px;">
      <div class="card-body" style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 20px;">
        <div><h3 style="font-family:'DM Serif Display'; font-size:24px; color: var(--brown-100); margin-bottom: 8px;">Siap Melayani Pelanggan?</h3><p style="color: var(--brown-300); font-size: 14px; max-width: 400px;">Buka halaman kasir sekarang untuk mulai mencatat pesanan, memilih varian, dan mengirim struk via WhatsApp.</p></div>
        <button class="btn btn-brown" style="background: var(--accent); border: none; padding: 14px 28px; font-size: 16px;" onclick="showPage('cashier')">Buka Kasir / POS 🛒</button>
      </div>
    </div>
  `;
}

// ══════════════════════════════════════════════
// UTILS
// ══════════════════════════════════════════════
function openModal(id) { const el = document.getElementById(id); if (el) el.classList.add('open'); }
function closeModal(id) { const el = document.getElementById(id); if (el) el.classList.remove('open'); }
function showToast(msg, type = '') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}
function updateClock() {
  const el = document.getElementById('current-datetime');
  if (el) {
    const now = new Date();
    el.textContent = now.toLocaleDateString('id-ID', { weekday: 'short', day: '2-digit', month: 'short' }) + ' ' + now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  }
}
setInterval(updateClock, 1000);
updateClock();
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('open'); });
});

// Auto load on start
window.onload = async () => {
  await loadStoreInfo();
  const savedSession = localStorage.getItem('ks_session');
  if (savedSession) {
    try { setupUserSession(JSON.parse(savedSession)); } catch (e) { localStorage.removeItem('ks_session'); switchRole('admin'); }
  } else { switchRole('admin'); }
};
