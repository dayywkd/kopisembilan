// ══════════════════════════════════════════════
// STATE & CONFIG
// ══════════════════════════════════════════════
let currentUser = null;
let cart = [];
let products = [];
let categories = [];
let cashierProducts = [];
let transactions = [];
let selectedProductForVariant = null;
let editingProductId = null;
let editingUserId = null;
let editingTransactionId = null;
let revenueChartInstance = null;
let activeCashierCategory = 'Semua';
let cashierSearchQuery = '';
let cartItemSeq = 0;
let storeInfo = { name: 'KopiSembilan', address: 'Jl. Kopi Nomor 9, Jember, Jawa Timur', phone: '085855180131' };
let waTemplate = `*INVOICE [NAMA_TOKO]*
ID: [ID_TXN]
Tanggal: [TANGGAL]
----------------------------
[ITEMS]
----------------------------
*TOTAL: [TOTAL]*

Terima kasih sudah memesan!`;

const DEFAULT_VARIANTS = [];

// Tambahan fungsi kategori dinamis
async function loadCategories() {
  try {
    const { data, error } = await db.from('categories').select('*').order('name');
    if (!error && data) {
      categories = data;
      // Perbarui dropdown kategori di modal produk jika ada
      const select = document.getElementById('prod-category');
      if (select) {
        select.innerHTML = categories.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
      }
    }
  } catch (e) { console.error('Categories load fail', e); }
}

// Fungsi pembantu kategori
function getCategoryColor(categoryName) {
  const cat = categories.find(c => c.name === categoryName);
  if (cat && cat.color) return cat.color;
  switch(categoryName) {
    case 'Specialty Coffee': return '#D4A05A';
    case 'Regular Coffee': return '#8B5320';
    case 'Signature': return '#2D5A27';
    case 'Non-Coffee': return '#C8602A';
    default: return '#6B3F1A';
  }
}

function getCategoryIcon(categoryName) {
  const cat = categories.find(c => c.name === categoryName);
  if (cat && cat.icon) return cat.icon;
  switch(categoryName) {
    case 'Specialty Coffee': return 'coffee';
    case 'Regular Coffee': return 'coffee';
    case 'Signature': return 'glass-water';
    case 'Non-Coffee': return 'cup-soda';
    default: return 'coffee';
  }
}

function escapeAttr(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ══════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════
async function doLogin() {
  const u = document.getElementById('login-user').value.trim();
  const p = document.getElementById('login-pass').value.trim();
  
  if (!u || !p) {
    showToast('Username dan Password wajib diisi!', 'error');
    return;
  }

  console.log("Attempting Supabase Auth login for:", u);

  // Menggunakan email bayangan karena Supabase Auth memerlukan email.
  // Format: username@kopi9.local
  const fakeEmail = `${u}@kopi9.local`;

  const { data, error } = await db.auth.signInWithPassword({
    email: fakeEmail,
    password: p
  });

  if (error) {
    console.error("Auth Error:", error.message);
    if (error.message.includes("Invalid login credentials")) {
      showToast('Username atau Password salah!', 'error');
    } else {
      showToast('Login Gagal: ' + error.message, 'error');
    }
    return;
  }

  // Jika auth berhasil, ambil data detail dari tabel users lama
  const { data: userProfile, error: profileErr } = await db
    .from('users')
    .select('*')
    .eq('auth_id', data.user.id)
    .single();

  if (profileErr || !userProfile) {
    console.error("Profile Fetch Error:", profileErr);
    // Fallback jika profile belum terhubung ke auth_id
    // Coba cari berdasarkan username (untuk user migrasi)
    const { data: legacyUser, error: legacyErr } = await db
      .from('users')
      .select('*')
      .eq('username', u)
      .single();

    if (!legacyErr && legacyUser) {
      // Hubungkan auth_id secara otomatis jika belum ada
      if (!legacyUser.auth_id) {
        await db.from('users').update({ auth_id: data.user.id }).eq('id', legacyUser.id);
      }
      setupUserSession(legacyUser);
      addActivityLog('Login Berhasil', `User ${legacyUser.name} masuk ke sistem`);
    } else {
      showToast('Profil user tidak ditemukan!', 'error');
    }
  } else {
    setupUserSession(userProfile);
    addActivityLog('Login Berhasil', `User ${userProfile.name} masuk ke sistem`);
  }
}

function setupUserSession(user) {
  currentUser = user;
  localStorage.setItem('ks_session', JSON.stringify(user));
  
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

function showConfirmDialog({ title, message, icon = 'alert-circle', confirmText = 'Ya', cancelText = 'Batal', onConfirm }) {
  const modal = document.getElementById('modal-confirm');
  if (!modal) {
    if (confirm(message)) onConfirm();
    return;
  }

  const titleEl = document.getElementById('confirm-title');
  const messageEl = document.getElementById('confirm-message');
  const iconEl = modal.querySelector('.confirm-icon');
  const cancelBtn = document.getElementById('confirm-cancel');
  const okBtn = document.getElementById('confirm-ok');

  if (titleEl) titleEl.textContent = title;
  if (messageEl) messageEl.textContent = message;
  if (iconEl) iconEl.innerHTML = `<i data-lucide="${icon}" style="width:24px;height:24px;"></i>`;
  if (cancelBtn) cancelBtn.textContent = cancelText;
  if (okBtn) okBtn.textContent = confirmText;

  const close = () => modal.classList.remove('open');
  if (cancelBtn) cancelBtn.onclick = close;
  if (okBtn) okBtn.onclick = () => {
    close();
    onConfirm();
  };
  modal.onclick = (e) => {
    if (e.target === modal) close();
  };

  modal.classList.add('open');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function doLogout() {
  showConfirmDialog({
    title: 'Keluar dari sistem?',
    message: 'Sesi Anda akan ditutup dan kembali ke halaman login.',
    icon: 'log-out',
    confirmText: 'Keluar',
    cancelText: 'Batal',
    onConfirm: performLogout
  });
}

async function performLogout() {
  await db.auth.signOut();
  localStorage.removeItem('ks_session');
  currentUser = null;
  cart = [];
  cartItemSeq = 0;
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
    const { data: info } = await db.from('settings').select('value').eq('key', 'store_info').single();
    if (info) storeInfo = info.value;

    const { data: template } = await db.from('settings').select('value').eq('key', 'wa_template').single();
    if (template) waTemplate = template.value;
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
    addActivityLog('Update Info Toko', `Nama: ${name}`);
  } else {
    showToast('Gagal menyimpan ke database!', 'error');
  }
}

async function saveWATemplate() {
  const template = document.getElementById('settings-wa-template').value.trim();
  if (!template) return;

  const { error } = await db.from('settings').upsert({ key: 'wa_template', value: template });
  if (!error) {
    waTemplate = template;
    showToast('Template WhatsApp berhasil disimpan!', 'success');
    addActivityLog('Update Template WA', 'Perubahan format struk');
  } else {
    showToast('Gagal menyimpan template!', 'error');
  }
}

async function loadProducts() {
  await loadStoreInfo();
  await loadCategories();
  try {
    const { data, error } = await db
      .from('products')
      .select('*, product_variants(*)')
      .eq('active', true);
    
    if (!error && data) {
      products = data;
      cashierProducts = buildCashierMenuProducts(data);
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
  report: 'Laporan Keuangan', users: 'Manajemen Pengguna', settings: 'Pengaturan', manual: 'Panduan Pengguna',
  logs: 'Log Aktivitas'
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
      report: renderReport, users: renderUsers, settings: renderSettings, manual: renderManual,
      logs: renderLogs
    };
    if (renders[page]) renders[page](content);
    if (typeof lucide !== 'undefined') lucide.createIcons();
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

function toggleMobileCart() {
  if (window.innerWidth > 768) return;
  const cartPanel = document.getElementById('cart-panel');
  if (cartPanel) {
    cartPanel.classList.toggle('expanded');
    const icon = cartPanel.querySelector('.cart-toggle-icon');
    if (icon) {
      const isExpanded = cartPanel.classList.contains('expanded');
      icon.innerHTML = `<i data-lucide="${isExpanded ? 'chevron-down' : 'chevron-up'}" style="width:20px;height:20px;"></i>`;
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
  }
}

// ══════════════════════════════════════════════
// KASIR / POS
// ══════════════════════════════════════════════
function renderCashier(el) {
  activeCashierCategory = activeCashierCategory || 'Semua';
  cashierSearchQuery = cashierSearchQuery || '';
  el.innerHTML = `
    <div class="pos-layout">
      <div style="display:flex;flex-direction:column;gap:16px;overflow:hidden; grid-column: 1 / -1;">
        ${editingTransactionId ? `
          <div style="background: var(--brown-50); border: 1px solid var(--brown-200); padding: 12px 16px; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
            <div style="display: flex; align-items: center; gap: 10px; color: var(--brown-800); font-weight: 600;">
              <i data-lucide="edit-3" style="width: 20px; height: 20px;"></i>
              <div style="display:flex; flex-direction:column;">
                <span style="font-size:14px;">Mode Edit Aktif</span>
                <small style="font-weight:400; opacity:0.8;">Mengubah Transaksi: ${editingTransactionId}</small>
              </div>
            </div>
            <button class="btn btn-red btn-sm" onclick="cancelCashierEdit()" style="display:flex; align-items:center; gap:6px;">
              <i data-lucide="x-circle" style="width:14px;height:14px;"></i> Batalkan Edit
            </button>
          </div>
        ` : ''}
      </div>
      <div style="display:flex;flex-direction:column;gap:16px;overflow:hidden;">
        <div class="cashier-toolbar">
          <div class="cashier-category-row">
            <button class="btn ${activeCashierCategory === 'Semua' ? 'btn-brown' : 'btn-outline'} btn-sm cat-btn" onclick="filterCat(this,'Semua')">Semua</button>
            ${categories.map(c =>
              `<button class="btn ${activeCashierCategory === c.name ? 'btn-brown' : 'btn-outline'} btn-sm cat-btn" onclick="filterCat(this,'${c.name}')">${c.name}</button>`
            ).join('')}
          </div>
          <div class="search-wrapper cashier-search">
            <i data-lucide="search" class="search-icon" style="width:16px;height:16px;"></i>
            <input type="text" class="search-input" id="cashier-search-input" placeholder="Cari menu..." value="${escapeAttr(cashierSearchQuery)}" oninput="searchCashierMenu(this.value)">
            <button class="cashier-search-clear ${cashierSearchQuery ? '' : 'hidden'}" id="cashier-search-clear" type="button" onclick="clearCashierSearch()" title="Bersihkan pencarian"><i data-lucide="x" style="width:14px;height:14px;"></i></button>
          </div>
        </div>
        <div class="menu-grid" id="menu-grid" style="overflow-y:auto;max-height:calc(100vh - 200px);padding-bottom:16px;">
          ${renderMenuItems(activeCashierCategory, cashierSearchQuery)}
        </div>
      </div>
      <div class="cart-panel" id="cart-panel">
        <div class="cart-header" onclick="toggleMobileCart()">
          <div class="cart-mobile-summary mobile-only">
             <div style="display:flex;align-items:center;gap:12px;">
               <div style="position:relative; display:flex; align-items:center;">
                 <i data-lucide="shopping-cart" style="width:22px;height:22px;color:var(--brown-800);"></i>
                 <span id="cart-mobile-badge" class="badge badge-red" style="position:absolute; top:-10px; right:-10px; padding:2px 6px; font-size:10px; border:2px solid white; min-width:20px; text-align:center;">0</span>
               </div>
               <div id="cart-mobile-total" class="cart-mobile-total">Rp 0</div>
             </div>
          </div>
          <div class="desktop-only" style="display:flex;align-items:center;gap:8px;">
            <i data-lucide="shopping-bag" style="width:18px;height:18px;"></i> Keranjang
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <span id="cart-count" class="desktop-only" style="font-size:13px;color:var(--text-muted);font-family:'DM Sans';font-weight:normal;">0 item</span>
            <div class="cart-toggle-icon mobile-only" style="display:flex;align-items:center;"><i data-lucide="chevron-up" style="width:20px;height:20px;"></i></div>
          </div>
        </div>
        <div class="cart-items" id="cart-items"><div style="text-align:center;padding:40px 20px;color:var(--text-muted);font-size:13px;">Pilih produk dari menu</div></div>
        <div class="cart-summary">
          <div class="summary-row total"><span>TOTAL</span><span id="total-val">Rp 0</span></div>
          <button class="pay-btn" id="pay-btn" disabled onclick="openPayment()">${editingTransactionId ? 'UPDATE TRANSAKSI' : 'BAYAR'}</button>
          <button class="btn btn-outline w-full" style="margin-top:8px;" onclick="clearCart()"><i data-lucide="trash-2" style="width:16px;height:16px;"></i> Kosongkan</button>
        </div>
      </div>
    </div>
  `;
  updateCartUI();
}

function renderMenuItems(cat, query = '') {
  const menuProducts = cashierProducts.length ? cashierProducts : buildCashierMenuProducts(products);
  if (!menuProducts || menuProducts.length === 0) return '<div style="text-align:center; padding:20px; color:var(--text-muted);">Belum ada produk.</div>';
  const search = query.trim().toLowerCase();
  
  const filteredProducts = menuProducts.filter(p => {
    const productName = String(p.name || '').toLowerCase();
    const productCategory = String(p.category || '').toLowerCase();
    const matchesCategory = search ? true : cat === 'Semua' || p.category === cat;
    const matchesSearch = !search ||
      productName.includes(search) ||
      productCategory.includes(search);
    return matchesCategory && matchesSearch;
  });

  if (filteredProducts.length === 0) {
    return '<div style="grid-column:1/-1;text-align:center; padding:32px 20px; color:var(--text-muted); font-size:13px;">Menu tidak ditemukan.</div>';
  }

  return filteredProducts.map(p => {
    const bgColor = getCategoryColor(p.category);
    const icon = getCategoryIcon(p.category);
    
    return `
      <div class="menu-card" onclick='addMenuToCart(${JSON.stringify(String(p.id))})'>
        <div class="icon-circle" style="background: ${bgColor}15; color: ${bgColor}; border-color: ${bgColor}30;">
          <i data-lucide="${icon}" style="width:24px;height:24px;"></i>
        </div>
        <div class="mname">${p.name}</div>
        <div class="mprice">${fmtRp(p.base_price)}</div>
      </div>
    `;
  }).join('');
}

function filterCat(btn, cat) {
  activeCashierCategory = cat;
  updateCashierCategoryButtons();
  refreshCashierMenu();
}

function searchCashierMenu(value) {
  cashierSearchQuery = value;
  if (cashierSearchQuery.trim()) {
    activeCashierCategory = 'Semua';
    updateCashierCategoryButtons();
  }
  updateCashierSearchClear();
  refreshCashierMenu();
}

function clearCashierSearch() {
  cashierSearchQuery = '';
  const input = document.getElementById('cashier-search-input');
  if (input) input.value = '';
  updateCashierSearchClear();
  refreshCashierMenu();
}

function updateCashierCategoryButtons() {
  document.querySelectorAll('.cat-btn').forEach(btn => {
    const isActive = btn.textContent.trim() === activeCashierCategory;
    btn.classList.toggle('btn-brown', isActive);
    btn.classList.toggle('btn-outline', !isActive);
  });
}

function updateCashierSearchClear() {
  const clearBtn = document.getElementById('cashier-search-clear');
  if (clearBtn) clearBtn.classList.toggle('hidden', !cashierSearchQuery.trim());
}

function refreshCashierMenu() {
  const menuGrid = document.getElementById('menu-grid');
  if (menuGrid) {
    menuGrid.innerHTML = renderMenuItems(activeCashierCategory, cashierSearchQuery);
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
}

function buildCashierMenuProducts(sourceProducts) {
  // Sekarang database sudah berisi menu flat (tanpa perlu ekspansi manual di JS)
  return sourceProducts.map(p => ({
    ...p,
    sourceProductId: p.id,
    product_variants: p.product_variants || []
  }));
}

// ─── CART LOGIC ───
function addMenuToCart(productId) {
  const product = cashierProducts.find(p => String(p.id) === String(productId));
  if (!product) return;

  cart.push({
    cartId: ++cartItemSeq,
    productId: product.id,
    name: product.name,
    emoji: product.emoji,
    basePrice: product.base_price,
    totalPrice: product.base_price,
    qty: 1,
    variants: [],
    note: ''
  });

  updateCartUI();
  showToast(product.name + ' ditambahkan', 'success');
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
    
    const mobileBadge = document.getElementById('cart-mobile-badge');
    const mobileTotal = document.getElementById('cart-mobile-total');
    if (mobileBadge) mobileBadge.textContent = '0';
    if (mobileTotal) mobileTotal.textContent = 'Rp 0';
    
    return;
  }

  const getCategoryColor = (category) => {
    switch(category) {
      case 'Specialty Coffee': return '#D4A05A';
      case 'Regular Coffee': return '#8B5320';
      case 'Signature': return '#2D5A27';
      case 'Non-Coffee': return '#C8602A';
      default: return '#6B3F1A';
    }
  };

  const getCategoryIcon = (category) => {
    switch(category) {
      case 'Specialty Coffee': return 'coffee';
      case 'Regular Coffee': return 'coffee';
      case 'Signature': return 'glass-water';
      case 'Non-Coffee': return 'cup-soda';
      default: return 'coffee';
    }
  };

  const total = cart.reduce((s, c) => s + (c.totalPrice * c.qty), 0);
  cartEl.innerHTML = cart.map((c) => {
    const category = products.find(p => p.id === c.productId)?.category;
    const bgColor = getCategoryColor(category);
    const icon = getCategoryIcon(category);
    return `
    <div class="cart-item">
      <div class="cart-item-row">
        <div style="width: 28px; height: 28px; border-radius: 50%; background: ${bgColor}15; color: ${bgColor}; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 12px; border: 1px solid ${bgColor}30; flex-shrink: 0;">
          <i data-lucide="${icon}" style="width:14px;height:14px;"></i>
        </div>
        <div class="ci-name">${c.name}</div>
        <div class="flex items-center gap-2">
           <button class="qty-btn" onclick="changeQty(${c.cartId},-1)">−</button>
           <span style="font-size:13px;font-weight:600;min-width:15px;text-align:center;">${c.qty}</span>
           <button class="qty-btn" onclick="changeQty(${c.cartId},1)">+</button>
        </div>
        <div class="ci-price">${fmtRp(c.totalPrice * c.qty)}</div>
        <button class="cart-remove-btn" onclick="removeCartItem(${c.cartId})" title="Hapus item"><i data-lucide="trash-2" style="width:15px;height:15px;"></i></button>
      </div>
      <div class="cart-item-actions">
        <button class="cart-note-btn ${c.note ? 'has-note' : ''}" onclick="editCartNote(${c.cartId})" title="Catatan item"><i data-lucide="message-square" style="width:14px;height:14px;"></i> ${c.note ? 'Ubah note' : 'Tambah note'}</button>
      </div>
      ${c.note ? `<div class="ci-note" style="display:flex;align-items:center;gap:4px;"><i data-lucide="message-square" style="width:12px;height:12px;"></i> ${escapeAttr(c.note)}</div>` : ''}
    </div>
  `}).join('');

  if (cartCount) cartCount.textContent = cart.length + ' item';
  
  // Update Mobile Summary
  const mobileBadge = document.getElementById('cart-mobile-badge');
  const mobileTotal = document.getElementById('cart-mobile-total');
  if (mobileBadge) mobileBadge.textContent = cart.reduce((sum, item) => sum + item.qty, 0);
  if (mobileTotal) mobileTotal.textContent = fmtRp(total);

  if (totalValEl) totalValEl.textContent = fmtRp(total);
  if (payBtn) payBtn.disabled = false;
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function changeQty(cartId, delta) {
  const item = cart.find(c => c.cartId === cartId);
  if (!item) {
    updateCartUI();
    return;
  }

  item.qty += delta;
  if (item.qty <= 0) {
    removeCartItem(cartId);
    return;
  }
  updateCartUI();
}

function removeCartItem(cartId) {
  cart = cart.filter(c => c.cartId !== cartId);
  updateCartUI();
}

function editCartNote(cartId) {
  const item = cart.find(c => c.cartId === cartId);
  if (!item) return;

  const label = document.getElementById('note-item-label');
  const input = document.getElementById('note-input');
  const saveBtn = document.getElementById('note-save-btn');

  if (label) label.textContent = 'Catatan untuk ' + item.name;
  if (input) {
    input.value = item.note || '';
    // Sinkronisasi shortcut saat modal dibuka
    setTimeout(() => syncShortcutChips('note-input'), 50);
    
    // Sinkronisasi saat mengetik manual
    input.oninput = () => syncShortcutChips('note-input');
  }
  
  if (saveBtn) {
    saveBtn.onclick = () => {
      item.note = input.value.trim();
      updateCartUI();
      closeModal('modal-note');
    };
  }

  openModal('modal-note');
}

function clearCart() {
  if (cart.length === 0) return;
  
  showConfirmDialog({
    title: 'Kosongkan Keranjang?',
    message: 'Semua item yang sudah dipilih akan dihapus dari daftar belanja.',
    icon: 'trash-2',
    confirmText: 'Ya, Kosongkan',
    cancelText: 'Batal',
    onConfirm: () => {
      cart = [];
      cartItemSeq = 0;
      updateCartUI();
      showToast('Keranjang telah dikosongkan', 'success');
    }
  });
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

function resetPaymentModalForCheckout() {
  const modalTitle = document.querySelector('#modal-payment .modal-header h3');
  if (modalTitle) {
    modalTitle.innerHTML = `<i data-lucide="credit-card" style="width:20px;height:20px;color:var(--brown-800);"></i> Pembayaran`;
  }

  const paymentControls = document.querySelector('#modal-payment .modal-body > div:nth-child(2)');
  if (paymentControls) paymentControls.style.display = 'block';

  const footer = document.querySelector('#modal-payment .modal-footer');
  if (footer) {
  footer.innerHTML = `
    <button class="btn btn-outline" onclick="closeModal('modal-payment')">Batal</button>
    <div style="display:flex; gap:8px; width:100%;">
      <button class="btn btn-green" style="flex:1; display:flex; align-items:center; justify-content:center; gap:6px;" onclick="confirmPaymentWithWA()">
        <i data-lucide="send" style="width:16px;height:16px;"></i> Kirim WA
      </button>
      <button class="btn btn-brown" style="flex:1.5;" onclick="confirmPayment(false)">Selesai</button>
    </div>
  `;
  }

  selectedPaymentMethod = 'cash';
  document.querySelectorAll('.pay-method-card').forEach(c => c.classList.toggle('active', c.dataset.method === 'cash'));
  const qris = document.getElementById('qris-display');
  const cashWrap = document.getElementById('cash-input-wrap');
  if (qris) qris.style.display = 'none';
  if (cashWrap) cashWrap.style.display = 'block';
  
  const phoneGroup = document.getElementById('phone-input-group');
  if (phoneGroup) phoneGroup.style.display = 'none';

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

/**
 * Handle konfirmasi pembayaran dengan pengiriman WA (meminta nomor via modal)
 */
function confirmPaymentWithWA() {
  const phoneEl = document.getElementById('customer-phone');
  const modalInput = document.getElementById('phone-modal-input');
  
  if (modalInput) {
    modalInput.value = phoneEl ? phoneEl.value.trim() : '';
  }
  
  openModal('modal-phone');
  if (modalInput) setTimeout(() => modalInput.focus(), 200);
}

/**
 * Memproses aksi dari modal input nomor WA
 * @param {boolean} sendNow 
 */
function processPhoneAction(sendNow) {
  const modalInput = document.getElementById('phone-modal-input');
  const phoneEl = document.getElementById('customer-phone');
  const phone = modalInput ? modalInput.value.trim() : '';

  if (!phone) {
    showToast("Nomor WhatsApp wajib diisi!", "error");
    if (modalInput) modalInput.focus();
    return;
  }

  if (phoneEl) phoneEl.value = phone;
  closeModal('modal-phone');
  confirmPayment(sendNow);
}

function openPayment() {
  resetPaymentModalForCheckout();
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

async function loadTransactionToCashier() {
  const id = document.getElementById('edit-txn-id').value;
  if (!id) return;

  try {
    const { data: txn, error } = await db.from('transactions').select('*, transaction_items(*, products(*))').eq('id', id).single();
    if (error || !txn) { showToast('Gagal memuat data!', 'error'); return; }

    // Set mode edit
    editingTransactionId = id;
    
    // Konversi item transaksi ke format keranjang
    cart = txn.transaction_items.map((i, idx) => ({
      cartId: idx + 1,
      productId: i.product_id,
      name: i.products?.name || 'Produk',
      basePrice: i.price,
      totalPrice: i.price,
      qty: i.qty,
      variants: i.selected_variants || [],
      note: i.item_note || ''
    }));
    cartItemSeq = cart.length;

    closeModal('modal-edit-txn');
    showPage('cashier');
    showToast('Mode Edit: Silakan tambah menu baru', 'success');
  } catch (e) { console.error(e); }
}

function cancelCashierEdit() {
  showConfirmDialog({
    title: 'Batalkan Edit?',
    message: 'Perubahan yang belum disimpan akan hilang.',
    icon: 'x-circle',
    confirmText: 'Ya, Batalkan',
    onConfirm: () => {
      editingTransactionId = null;
      cart = [];
      cartItemSeq = 0;
      showPage('report');
      showToast('Edit dibatalkan', 'info');
    }
  });
}

async function confirmPayment(sendWA = false) {
  const total = cart.reduce((s, c) => s + (c.totalPrice * c.qty), 0);
  const phoneEl = document.getElementById('customer-phone');
  const phone = phoneEl ? phoneEl.value.trim() : '';
  const status = document.getElementById('payment-status').value;
  const note = document.getElementById('txn-note').value.trim();
  const now = new Date();
  
  // Gunakan ID lama jika sedang edit, jika tidak buat ID baru
  const txnId = editingTransactionId || ('TXN-' + now.toISOString().slice(0,10).replace(/-/g,'') + '-' + Math.floor(1000 + Math.random() * 9000));

  if (sendWA && !phone) {
    showToast('Masukkan nomor WA untuk kirim struk!', 'error');
    if (phoneEl) phoneEl.focus();
    return;
  }

  let cashAmount = 0;
  let cashChange = 0;
  if (selectedPaymentMethod === 'cash') {
    cashAmount = parseInt(document.getElementById('cash-input').value) || 0;
    if (cashAmount < total && status === 'Lunas') { showToast('Jumlah bayar kurang!', 'error'); return; }
    cashChange = cashAmount - total;
  }

  try {
    let txnResult;
    if (editingTransactionId) {
      // UPDATE transaksi yang sudah ada
      const { data, error } = await db.from('transactions').update({
        total: total,
        customer_phone: phone,
        payment_method: selectedPaymentMethod,
        payment_status: status,
        notes: note,
        cash_amount: cashAmount,
        cash_change: cashChange
      }).eq('id', txnId).select().single();
      
      if (error) throw error;
      txnResult = data;

      // Hapus item lama dan insert ulang (cara paling simpel untuk sinkronisasi)
      await db.from('transaction_items').delete().eq('transaction_id', txnId);
    } else {
      // INSERT transaksi baru
      const { data, error } = await db.from('transactions').insert([{
        id: txnId,
        total: total,
        customer_phone: phone,
        payment_method: selectedPaymentMethod,
        payment_status: status,
        notes: note,
        cashier_name: currentUser ? currentUser.name : 'Kasir',
        cash_amount: cashAmount,
        cash_change: cashChange
      }]).select().single();
      
      if (error) throw error;
      txnResult = data;
    }

    const itemsToInsert = cart.map(c => ({
      transaction_id: txnId,
      product_id: c.productId,
      qty: c.qty,
      price: c.totalPrice,
      selected_variants: c.variants,
      item_note: c.note
    }));

    const { error: itemsErr } = await db.from('transaction_items').insert(itemsToInsert);
    if (itemsErr) throw itemsErr;

    if (sendWA && phone) sendWhatsAppReceipt(phone, txnId, total, cart);

    showToast(editingTransactionId ? 'Transaksi diperbarui!' : 'Transaksi Berhasil!', 'success');
    addActivityLog(editingTransactionId ? 'Update Transaksi' : 'Transaksi Baru', `ID: ${txnId}, Total: ${fmtRp(total)}`);
    
    // Reset state
    editingTransactionId = null;
    cart = [];
    cartItemSeq = 0;
    updateCartUI();
    closeModal('modal-payment');
    
    const pageTitle = document.getElementById('page-title').textContent;
    if (pageTitle === 'Dashboard') renderDashboard(document.getElementById('page-content'));
    else if (pageTitle.includes('Laporan')) renderReport(document.getElementById('page-content'));
    else showPage('report');

  } catch (e) {
    console.error(e);
    showToast('Terjadi kesalahan sistem!', 'error');
  }
}

function formatPhoneWA(phone) {
  let nomor = phone.replace(/\D/g, '');
  if (nomor.startsWith('0'))      nomor = '62' + nomor.slice(1);
  else if (nomor.startsWith('8')) nomor = '62' + nomor;
  else if (nomor.startsWith('+')) nomor = nomor.replace('+', '');
  return nomor;
}

function sendWhatsAppReceipt(phone, txnId, total, items) {
  const itemsText = items.map(c => {
    let text = `• ${c.name} x${c.qty} = ${fmtRp(c.totalPrice * c.qty)}`;
    if (c.note) text += `\n  Note: ${c.note}`;
    return text;
  }).join('\n');

  let message = waTemplate
    .replace('[NAMA_TOKO]', storeInfo.name)
    .replace('[ID_TXN]', txnId)
    .replace('[TANGGAL]', new Date().toLocaleDateString('id-ID'))
    .replace('[ITEMS]', itemsText)
    .replace('[TOTAL]', fmtRp(total));

  const encoded = encodeURIComponent(message);
  const waUrl = `https://wa.me/${formatPhoneWA(phone)}?text=${encoded}`;
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
    
    if (!error && data) {
      txns = data;
    }
  } catch (e) {
    console.error('Report load fail', e);
  }

  const renderContent = (status = 'Semua', method = 'Semua') => {
    const filtered = txns.filter(t => {
      const matchesStatus = status === 'Semua' || t.payment_status === status;
      const matchesMethod = method === 'Semua' || t.payment_method === method;
      return matchesStatus && matchesMethod;
    });
    window.currentReportTxns = filtered; // Simpan untuk export CSV
    const totalRev = filtered.reduce((s, t) => s + t.total, 0);
    const avgTxn = filtered.length ? Math.round(totalRev / filtered.length) : 0;
    const lunasCount = filtered.filter(t => t.payment_status === 'Lunas').length;
    const methodLabel = {
      cash: 'Tunai',
      qris: 'QRIS',
      transfer: 'Transfer',
      card: 'Debit Card'
    };

    const rows = filtered.map(t => `
      <tr>
        <td><span style="font-family:monospace; font-size:11px;">${t.id}</span></td>
        <td>${new Date(t.date).toLocaleString('id-ID', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'})}</td>
        <td>${t.customer_phone || '-'}</td>
        <td><span class="badge ${t.payment_method === 'cash' ? 'badge-brown' : 'badge-blue'}">${methodLabel[t.payment_method] || String(t.payment_method || '-').toUpperCase()}</span></td>
        <td><span class="badge ${t.payment_status === 'Lunas' ? 'badge-green' : 'badge-red'}">${t.payment_status}</span></td>
        <td style="font-weight:600;">${fmtRp(t.total)}</td>
        <td style="font-size:11px; color:var(--text-muted);">${t.payment_method === 'cash' ? fmtRp(t.cash_amount || 0) : '-'}</td>
        <td style="font-size:11px; color:var(--text-muted);">${t.payment_method === 'cash' ? fmtRp(t.cash_change || 0) : '-'}</td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-outline btn-sm" onclick="viewTxnDetail('${t.id}')" title="Detail"><i data-lucide="eye" style="width:14px;height:14px;"></i></button>
            <button class="btn btn-outline btn-sm" onclick="editTransaction('${t.id}')" title="Edit Transaksi"><i data-lucide="pencil" style="width:14px;height:14px;"></i></button>
            <button class="btn btn-red btn-sm" onclick="deleteTransaction('${t.id}')" title="Hapus Transaksi"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button>
            ${t.customer_phone ? `<button class="btn btn-green btn-sm" onclick="resendWhatsAppReceipt('${t.id}')" title="Kirim WA"><i data-lucide="send" style="width:14px;height:14px;"></i></button>` : ''}
          </div>
        </td>
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
        <div class="report-card">
          <div class="label">Metode Dipilih</div>
          <div class="value" style="font-size:20px;">${method === 'Semua' ? 'Semua' : methodLabel[method]}</div>
          <div class="sub-value">${filtered.length} transaksi cocok</div>
        </div>
      </div>
      <div class="card">
        <div style="overflow-x:auto;">
          <table class="table">
            <thead><tr><th>ID</th><th>Waktu</th><th>WhatsApp</th><th>Metode</th><th>Status</th><th>Total</th><th>Bayar</th><th>Kembali</th><th>Aksi</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="9" style="text-align:center;">Tidak ada data transaksi</td></tr>'}</tbody>
          </table>
        </div>
      </div>
    `;
  };

  el.innerHTML = `
    <div class="filter-bar">
      <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
        <span style="font-size:13px; font-weight:600; color:var(--text-muted);">FILTER:</span>
        <select class="select-input" id="report-status-filter" onchange="applyReportFilters()">
          <option value="Semua">Semua Status</option>
          <option value="Lunas">Lunas</option>
          <option value="Belum Bayar">Belum Bayar</option>
        </select>
        <select class="select-input" id="report-method-filter" onchange="applyReportFilters()">
          <option value="Semua">Semua Metode</option>
          <option value="cash">Tunai</option>
          <option value="qris">QRIS</option>
          <option value="transfer">Transfer</option>
          <option value="card">Debit Card</option>
        </select>
      </div>
      <button class="btn btn-outline btn-sm" style="margin-left:auto;" onclick="exportToCSV()"><i data-lucide="download" style="width:16px;height:16px;"></i> Export CSV</button>
    </div>
    <div id="report-container">${renderContent('Semua', 'Semua')}</div>
  `;
  if (typeof lucide !== 'undefined') lucide.createIcons();
  window.renderReportTable = (status = 'Semua', method = 'Semua') => {
    const html = renderContent(status, method);
    if (typeof lucide !== 'undefined') {
      // Jalankan setelah DOM terupdate
      requestAnimationFrame(() => lucide.createIcons());
    }
    return html;
  };
  window.applyReportFilters = () => {
    const status = document.getElementById('report-status-filter')?.value || 'Semua';
    const method = document.getElementById('report-method-filter')?.value || 'Semua';
    const container = document.getElementById('report-container');
    if (container) container.innerHTML = window.renderReportTable(status, method);
  };
}

function exportToCSV() {
  if (typeof window.currentReportTxns === 'undefined' || window.currentReportTxns.length === 0) {
    showToast('Tidak ada data untuk di-export', 'error');
    return;
  }
  const txns = window.currentReportTxns;
  let csvContent = "data:text/csv;charset=utf-8,";
  csvContent += "ID Transaksi,Waktu,WhatsApp,Metode,Status,Total,Bayar,Kembali,Kasir\n";
  
  txns.forEach(t => {
    const row = [
      t.id,
      new Date(t.date).toLocaleString('id-ID').replace(/,/g, ''),
      t.customer_phone || '-',
      t.payment_method,
      t.payment_status,
      t.total,
      t.payment_method === 'cash' ? (t.cash_amount || 0) : '-',
      t.payment_method === 'cash' ? (t.cash_change || 0) : '-',
      t.cashier_name
    ];
    csvContent += row.join(",") + "\n";
  });
  
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "Laporan_KopiSembilan_" + new Date().toISOString().slice(0,10) + ".csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}



// ══════════════════════════════════════════════
// INVENTARIS / PRODUCTS
// ══════════════════════════════════════════════
function renderInventory(el) {
  el.innerHTML = `
    <div class="inv-actions">
      <div class="search-wrapper">
        <i data-lucide="search" class="search-icon" style="width:16px;height:16px;"></i>
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
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function renderInventoryRows(data) {
  if (!data || data.length === 0) return '<tr><td colspan="4" style="text-align:center; padding:30px; color:var(--text-muted);">Belum ada produk terdaftar.</td></tr>';
  
  const getCategoryColor = (category) => {
    switch(category) {
      case 'Specialty Coffee': return '#D4A05A';
      case 'Regular Coffee': return '#8B5320';
      case 'Signature': return '#2D5A27';
      case 'Non-Coffee': return '#C8602A';
      default: return '#6B3F1A';
    }
  };

  const getCategoryIcon = (category) => {
    switch(category) {
      case 'Specialty Coffee': return 'coffee';
      case 'Regular Coffee': return 'coffee';
      case 'Signature': return 'glass-water';
      case 'Non-Coffee': return 'cup-soda';
      default: return 'coffee';
    }
  };

  return data.map(p => {
    const bgColor = getCategoryColor(p.category);
    const icon = getCategoryIcon(p.category);
    return `
    <tr id="prod-row-${p.id}">
      <td>
        <div style="display:flex; align-items:center; gap:12px;">
          <div style="width: 32px; height: 32px; border-radius: 50%; background: ${bgColor}15; color: ${bgColor}; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; border: 1px solid ${bgColor}30; flex-shrink: 0;">
            <i data-lucide="${icon}" style="width:16px;height:16px;"></i>
          </div>
          <strong>${p.name}</strong>
        </div>
      </td>
      <td><span class="badge badge-brown">${p.category}</span></td>
      <td style="font-weight:700; color:var(--accent);">${fmtRp(p.base_price)}</td>
      <td>
        <div style="display:flex; gap:6px;">
          <button class="btn btn-outline btn-sm" onclick="editProduct(${p.id})" title="Edit"><i data-lucide="edit-2" style="width:14px;height:14px;"></i></button>
          <button class="btn btn-red btn-sm" onclick="deleteProduct(${p.id})" title="Hapus"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button>
        </div>
      </td>
    </tr>
  `}).join('');
}

function filterInventory(query) {
  const q = query.toLowerCase();
  const filtered = products.filter(p => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
  const tbody = document.getElementById('inv-tbody');
  if (tbody) {
    tbody.innerHTML = renderInventoryRows(filtered);
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
}

function openAddProduct() {
  editingProductId = null;
  const title = document.getElementById('modal-product-title');
  if (title) title.textContent = 'Tambah Produk';
  const nameIn = document.getElementById('prod-name');
  const priceIn = document.getElementById('prod-price');
  if (nameIn) nameIn.value = '';
  if (priceIn) priceIn.value = '';
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
  openModal('modal-product');
}

async function saveProduct() {
  const name = document.getElementById('prod-name').value.trim();
  const price = parseInt(document.getElementById('prod-price').value);
  const cat = document.getElementById('prod-category').value;
  if (!name || isNaN(price)) { showToast('Nama and harga wajib diisi!', 'error'); return; }

  let error;
  const productData = { name, base_price: price, category: cat };
  
  if (editingProductId) {
    const { error: err } = await db.from('products').update(productData).eq('id', editingProductId);
    error = err;
  } else {
    const { error: err } = await db.from('products').insert([productData]);
    error = err;
  }

  if (!error) {
    showToast(editingProductId ? 'Produk diperbarui!' : 'Produk ditambahkan!', 'success');
    addActivityLog(editingProductId ? 'Edit Produk' : 'Tambah Produk', `Nama: ${name}, Kategori: ${cat}, Harga: ${fmtRp(price)}`);
    await loadProducts();
    closeModal('modal-product');
  } else {
    showToast('Gagal menyimpan ke database!', 'error');
  }
}

async function deleteProduct(id) {
  showConfirmDialog({
    title: 'Hapus Produk?',
    message: 'Produk ini akan dinonaktifkan dari sistem (histori transaksi tetap aman).',
    icon: 'trash-2',
    confirmText: 'Ya, Hapus',
    cancelText: 'Batal',
    onConfirm: async () => {
      // Gunakan "Soft Delete" dengan mengubah status active menjadi false
      // Ini agar histori transaksi lama tidak rusak/error
      const { error } = await db.from('products').update({ active: false }).eq('id', id);
      
      if (!error) {
        showToast('Produk berhasil dihapus!', 'success');
        addActivityLog('Hapus Produk', `ID: ${id}`);
        await loadProducts();
      } else {
        console.error('Delete Error:', error);
        showToast('Gagal menghapus produk!', 'error');
      }
    }
  });
}

// ══════════════════════════════════════════════
// USERS MANAGEMENT
// ══════════════════════════════════════════════
async function renderUsers(el) {
  el.innerHTML = `<div style="text-align:center; padding:40px;">Memuat data pengguna...</div>`;
  let users = [];
  try {
    let { data, error } = await db.from('users').select('*').order('id', { ascending: true });
    if (error || !data) {
      showToast('Gagal memuat data pengguna!', 'error');
      users = [];
    } else { users = data; }
  } catch(e) { users = []; }

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
           <button class="btn btn-outline btn-sm" onclick="editUser(${u.id})" title="Edit"><i data-lucide="pencil" style="width:14px;height:14px;"></i></button>
           <button class="btn btn-red btn-sm" onclick="deleteUser(${u.id})" title="Hapus"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button>
        </div>
      </td>
    </tr>
  `).join('');
  el.innerHTML = `
    <div class="inv-actions">
      <div style="flex:1;"><h3 style="font-family:'DM Serif Display'; font-size:20px; color:var(--brown-800);">Kelola Tim Kasir</h3><p style="font-size:12px; color:var(--text-muted);">Daftar akun yang dapat mengakses sistem KopiSembilan.</p></div>
      <button class="btn btn-brown" onclick="openAddUser()">+ Tambah Akun</button>
    </div>
    <div class="card"><div style="overflow-x:auto;"><table class="table"><thead><tr><th>Nama Lengkap</th><th>Username</th><th>Role</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${rows || '<tr><td colspan="5" style="text-align:center;">Belum ada pengguna.</td></tr>'}</tbody></table></div></div>
  `;
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function openAddUser() {
  editingUserId = null;
  const title = document.getElementById('modal-user-title');
  if (title) title.textContent = 'Tambah Pengguna';
  document.getElementById('user-fullname').value = '';
  document.getElementById('user-username').value = '';
  document.getElementById('user-password').value = '';
  document.getElementById('user-role').value = 'kasir';
  document.getElementById('user-active').checked = true;
  openModal('modal-user');
}

async function editUser(id) {
  try {
    const { data: u, error } = await db.from('users').select('*').eq('id', id).single();
    if (error || !u) { showToast('Gagal memuat data pengguna!', 'error'); return; }
    
    editingUserId = id;
    const title = document.getElementById('modal-user-title');
    if (title) title.textContent = 'Edit Pengguna';
    document.getElementById('user-fullname').value = u.name;
    document.getElementById('user-username').value = u.username;
    document.getElementById('user-password').value = ''; // Kosongkan saat edit
    document.getElementById('user-password').placeholder = '(Biarkan kosong jika tidak ganti password)';
    document.getElementById('user-role').value = u.role;
    document.getElementById('user-active').checked = u.active;
    openModal('modal-user');
  } catch(e) { showToast('Terjadi kesalahan!', 'error'); }
}

async function saveUser() {
  const name = document.getElementById('user-fullname').value.trim();
  const username = document.getElementById('user-username').value.trim();
  const password = document.getElementById('user-password').value.trim();
  const role = document.getElementById('user-role').value;
  const active = document.getElementById('user-active').checked;

  if (!name || !username) { showToast('Nama dan Username wajib diisi!', 'error'); return; }
  if (!editingUserId && !password) { showToast('Password wajib diisi untuk akun baru!', 'error'); return; }

  const userData = { name, username, role, active };
  
  // Hash password jika diisi
  if (password) {
    const salt = dcodeIO.bcrypt.genSaltSync(10);
    userData.password_hash = dcodeIO.bcrypt.hashSync(password, salt);
  }
  
  let error;
  if (editingUserId) {
    const { error: err } = await db.from('users').update(userData).eq('id', editingUserId);
    error = err;
  } else {
    const { error: err } = await db.from('users').insert([userData]);
    error = err;
  }

  if (!error) {
    showToast(editingUserId ? 'Akun diperbarui!' : 'Akun berhasil dibuat!', 'success');
    addActivityLog(editingUserId ? 'Edit Pengguna' : 'Tambah Pengguna', `Username: ${username}, Role: ${role}`);
    closeModal('modal-user');
    renderUsers(document.getElementById('page-content'));
  } else {
    showToast('Gagal menyimpan ke database!', 'error');
  }
}

async function deleteUser(id) {
  if (currentUser && currentUser.id === id) { showToast('Tidak bisa menghapus akun sendiri!', 'error'); return; }
  if (!confirm('Hapus akun ini secara permanen?')) return;
  
  const { error } = await db.from('users').delete().eq('id', id);
  if (!error) {
    showToast('Akun berhasil dihapus!', 'success');
    addActivityLog('Hapus Pengguna', `ID: ${id}`);
    renderUsers(document.getElementById('page-content'));
  } else {
    showToast('Gagal menghapus akun!', 'error');
  }
}

function renderSettings(el) {
  el.innerHTML = `
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;" class="responsive-grid">
      <div class="card">
        <div class="card-header"><h3 style="display:flex;align-items:center;gap:8px;"><i data-lucide="store" style="width:18px;height:18px;color:var(--accent);"></i> Informasi Toko</h3></div>
        <div class="card-body">
          <div class="form-group"><label>Nama Cafe / Toko</label><input type="text" class="form-input" id="settings-store-name" value="${storeInfo.name}"></div>
          <div class="form-group"><label>Alamat Lengkap</label><textarea class="form-input" id="settings-store-address" rows="3" style="resize:none;">${storeInfo.address}</textarea></div>
          <div class="form-group"><label>No. Telepon / WhatsApp Bisnis</label><input type="text" class="form-input" id="settings-store-phone" value="${storeInfo.phone}"></div>
          <button class="btn btn-brown w-full" onclick="saveStoreInfo()">Simpan Identitas</button>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h3 style="display:flex;align-items:center;gap:8px;"><i data-lucide="tag" style="width:18px;height:18px;color:var(--accent);"></i> Kelola Kategori Produk</h3></div>
        <div class="card-body">
          <div style="max-height: 250px; overflow-y: auto; margin-bottom: 16px;">
            <table class="table" style="font-size: 13px;">
              <thead><tr><th>Nama</th><th>Warna</th><th>Aksi</th></tr></thead>
              <tbody>
                ${categories.map(c => `
                  <tr>
                    <td><strong>${c.name}</strong></td>
                    <td><div style="width:20px;height:20px;border-radius:4px;background:${c.color || '#ccc'};border:1px solid rgba(0,0,0,0.1);"></div></td>
                    <td>
                      <div class="flex gap-2">
                        <button class="btn btn-outline btn-sm" onclick="editCategory(${c.id})" title="Edit"><i data-lucide="pencil" style="width:12px;height:12px;"></i></button>
                        <button class="btn btn-red btn-sm" onclick="deleteCategory(${c.id})" title="Hapus"><i data-lucide="trash-2" style="width:12px;height:12px;"></i></button>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          <button class="btn btn-outline w-full" onclick="openAddCategory()">+ Tambah Kategori Baru</button>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h3 style="display:flex;align-items:center;gap:8px;"><i data-lucide="settings-2" style="width:18px;height:18px;color:var(--accent);"></i> Konfigurasi WhatsApp</h3></div>
        <div class="card-body">
          <div class="form-group">
            <label>Template Pesan WhatsApp</label>
            <textarea class="form-input" id="settings-wa-template" rows="8" style="resize:none; font-size:12px; font-family:monospace;">${waTemplate}</textarea>
            <p style="font-size:10px; color:var(--text-muted); margin-top:8px;">Placeholder: [NAMA_TOKO], [ID_TXN], [TANGGAL], [ITEMS], [TOTAL]</p>
          </div>
          <button class="btn btn-brown w-full" onclick="saveWATemplate()">Simpan Konfigurasi</button>
        </div>
      </div>
    </div>
    <style>.responsive-grid{display:grid; grid-template-columns:1fr 1fr;} @media(max-width:768px){.responsive-grid{grid-template-columns:1fr;}}</style>
    
    <div class="card" style="grid-column: 1 / -1; margin-top: 20px;">
      <div class="card-header"><h3 style="display:flex;align-items:center;gap:8px;"><i data-lucide="database" style="width:18px;height:18px;color:var(--accent);"></i> Backup & Pemulihan Data</h3></div>
      <div class="card-body">
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;" class="responsive-grid">
          <div>
            <h4 style="margin-bottom:8px; font-size:14px; color:var(--brown-800);">Backup Manual</h4>
            <p style="font-size:12px; color:var(--text-muted); margin-bottom:12px;">Unduh seluruh data sistem (Menu, Transaksi, Pengguna) ke dalam satu file untuk cadangan lokal.</p>
            <button class="btn btn-brown w-full" onclick="downloadSystemBackup()" style="display:flex; align-items:center; justify-content:center; gap:8px;">
              <i data-lucide="download-cloud" style="width:18px;height:18px;"></i> Unduh Backup (JSON)
            </button>
          </div>
          <div>
            <h4 style="margin-bottom:8px; font-size:14px; color:var(--brown-800);">Ekspor Data Menu</h4>
            <p style="font-size:12px; color:var(--text-muted); margin-bottom:12px;">Ekspor daftar menu dan harga ke dalam format CSV agar dapat dibuka di Excel.</p>
            <button class="btn btn-outline w-full" onclick="exportMenuToCSV()" style="display:flex; align-items:center; justify-content:center; gap:8px;">
              <i data-lucide="file-spreadsheet" style="width:18px;height:18px;"></i> Ekspor Menu (CSV)
            </button>
          </div>
        </div>
        <div style="margin-top:20px; padding-top:16px; border-top:1px solid var(--border);">
          <div style="background:var(--brown-50); padding:12px; border-radius:8px; border:1px dashed var(--brown-200);">
            <p style="font-size:11px; color:var(--brown-700); line-height:1.5;">
              <strong>Info Backup Otomatis:</strong> Sistem ini sudah dilengkapi dengan pencadangan harian otomatis ke server GitHub setiap pukul 00:00 WIB. Backup manual di atas berguna sebagai cadangan tambahan di perangkat Anda sendiri.
            </p>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ─── LOGIKA KATEGORI ───
let editingCategoryId = null;

function openAddCategory() {
  editingCategoryId = null;
  document.getElementById('cat-name').value = '';
  document.getElementById('cat-color').value = '#6B3F1A';
  document.getElementById('cat-icon').value = 'coffee';
  document.getElementById('modal-category-title').textContent = 'Tambah Kategori';
  openModal('modal-category');
}

async function editCategory(id) {
  const cat = categories.find(c => c.id === id);
  if (!cat) return;
  editingCategoryId = id;
  document.getElementById('cat-name').value = cat.name;
  document.getElementById('cat-color').value = cat.color || '#6B3F1A';
  document.getElementById('cat-icon').value = cat.icon || 'coffee';
  document.getElementById('modal-category-title').textContent = 'Edit Kategori';
  openModal('modal-category');
}

async function saveCategory() {
  const name = document.getElementById('cat-name').value.trim();
  const color = document.getElementById('cat-color').value;
  const icon = document.getElementById('cat-icon').value;
  
  if (!name) { showToast('Nama kategori wajib diisi!', 'error'); return; }

  const data = { name, color, icon };
  let errorSave;

  if (editingCategoryId) {
    const { error: err } = await db.from('categories').update(data).eq('id', editingCategoryId);
    errorSave = err;
  } else {
    const { error: err } = await db.from('categories').insert([data]);
    errorSave = err;
  }

  if (!errorSave) {
    showToast('Kategori berhasil disimpan!', 'success');
    await loadCategories();
    closeModal('modal-category');
    renderSettings(document.getElementById('page-content'));
  } else {
    console.error('Save category error:', errorSave);
    showToast('Gagal menyimpan kategori! Cek console untuk detail.', 'error');
  }
}

async function deleteCategory(id) {
  const cat = categories.find(c => c.id === id);
  if (!cat) return;

  // Cek apakah ada produk yang pakai kategori ini
  const { count, error: countErr } = await db.from('products').select('*', { count: 'exact', head: true }).eq('category', cat.name).eq('active', true);
  
  if (count > 0) {
    showToast(`Tidak bisa menghapus! Ada ${count} produk yang masih menggunakan kategori ini.`, 'error');
    return;
  }

  showConfirmDialog({
    title: 'Hapus Kategori?',
    message: `Hapus kategori "${cat.name}"? Tindakan ini tidak bisa dibatalkan.`,
    icon: 'trash-2',
    confirmText: 'Ya, Hapus',
    cancelText: 'Batal',
    onConfirm: async () => {
      const { error } = await db.from('categories').delete().eq('id', id);
      if (!error) {
        showToast('Kategori dihapus!', 'success');
        await loadCategories();
        renderSettings(document.getElementById('page-content'));
      } else {
        showToast('Gagal menghapus kategori!', 'error');
      }
    }
  });
}

function renderManual(el) {
  const guides = [
    { title: 'Memulai Transaksi Baru', content: 'Klik menu <strong>Kasir / POS</strong>, lalu pilih produk. Gunakan fitur Note untuk instruksi khusus.' },
    { title: 'Mengirim Struk via WhatsApp', content: 'Di modal pembayaran, masukkan nomor WhatsApp pelanggan. Klik <strong>Kirim WA</strong> untuk membuka WhatsApp dengan invoice otomatis.' },
    { title: 'Manajemen Template WA', content: 'Buka <strong>Pengaturan</strong> untuk mengubah format pesan struk. Gunakan kode seperti [ITEMS] agar daftar pesanan muncul otomatis.' },
    { title: 'Memantau Laporan', content: 'Halaman Laporan menampilkan pendapatan secara real-time. Anda dapat memfilter transaksi berdasarkan periode waktu.' }
  ];
  const guideHtml = guides.map((g, i) => `
    <div class="card" style="margin-bottom:12px;"><div class="card-body" style="padding:16px;"><div style="display:flex; gap:12px; align-items:flex-start;"><div style="width:28px; height:28px; border-radius:50%; background:var(--brown-100); color:var(--brown-700); display:flex; align-items:center; justify-content:center; font-weight:700; flex-shrink:0;">${i+1}</div><div><h4 style="color:var(--brown-900); margin-bottom:4px;">${g.title}</h4><p style="font-size:13px; color:var(--text-muted); line-height:1.6;">${g.content}</p></div></div></div></div>
  `).join('');
  el.innerHTML = `
    <div style="max-width:800px; margin:0 auto;"><div style="text-align:center; margin-bottom:30px;"><h2 style="font-family:'DM Serif Display'; font-size:28px; color:var(--brown-900);">Pusat Bantuan KopiSembilan</h2><p style="color:var(--text-muted);">Panduan singkat penggunaan sistem kasir modern berbasis cloud.</p></div>${guideHtml}<div style="background:var(--blue-light); padding:20px; border-radius:var(--radius); border-left:4px solid var(--blue); margin-top:20px;"><h4 style="color:var(--blue); margin-bottom:8px; display:flex; align-items:center; gap:6px;"><i data-lucide="help-circle" style="width:16px;height:16px;"></i> Butuh Bantuan Lanjut?</h4><p style="font-size:13px; color:var(--text); line-height:1.6;">Hubungi tim IT KopiSembilan melalui WhatsApp di nomor <strong>085855180131</strong> jika Anda mengalami kendala teknis atau masalah koneksi database.</p></div></div>
  `;
}

async function viewTxnDetail(id) {
  const { data: txn, error } = await db.from('transactions').select('*, transaction_items(*, products(*))').eq('id', id).single();
  if (error || !txn) { showToast('Gagal memuat detail transaksi!', 'error'); return; }
  let itemHtml = txn.transaction_items.map(i => `
    <div style="padding:10px; border-bottom:1px solid var(--border);"><div style="display:flex; justify-content:space-between; gap:12px; font-weight:600;"><span style="display:flex; align-items:center; gap:6px;"><i data-lucide="coffee" style="width:14px;height:14px;flex-shrink:0;"></i>${i.products?.name} x${i.qty}</span><span>${fmtRp(i.price * i.qty)}</span></div>${i.selected_variants ? `<div style="font-size:11px; color:var(--text-muted); font-style:italic;">${i.selected_variants.map(v => v.name).join(', ')}</div>` : ''}${i.item_note ? `<div style="font-size:11px; color:var(--brown-500);">Note: ${i.item_note}</div>` : ''}</div>
  `).join('');
  const detailHtml = `<div style="font-family:'Courier New', monospace; font-size:13px;"><p><strong>ID:</strong> ${txn.id}</p><p><strong>Waktu:</strong> ${new Date(txn.date).toLocaleString('id-ID')}</p><p><strong>Kasir:</strong> ${txn.cashier_name}</p><p><strong>Status:</strong> ${txn.payment_status}</p><p><strong>Metode:</strong> ${txn.payment_method.toUpperCase()}</p><p><strong>WA:</strong> ${txn.customer_phone || '-'}</p>${txn.notes ? `<p><strong>Note:</strong> ${txn.notes}</p>` : ''}<hr style="border:none; border-top:1px dashed #ccc; margin:10px 0;">${itemHtml}<div style="display:flex; justify-content:space-between; font-weight:700; font-size:15px; margin-top:10px;"><span>TOTAL</span><span>${fmtRp(txn.total)}</span></div>${txn.payment_method === 'cash' ? `<div style="display:flex; justify-content:space-between; font-size:13px; margin-top:4px;"><span>BAYAR</span><span>${fmtRp(txn.cash_amount || 0)}</span></div><div style="display:flex; justify-content:space-between; font-size:13px; margin-top:2px;"><span>KEMBALI</span><span>${fmtRp(txn.cash_change || 0)}</span></div>` : ''}</div>`;
  document.getElementById('receipt-preview').innerHTML = detailHtml;
  if (typeof lucide !== 'undefined') lucide.createIcons();
  document.getElementById('modal-payment').classList.add('open');
  const modalTitle = document.querySelector('#modal-payment .modal-header h3');
  if (modalTitle) modalTitle.textContent = 'Detail Transaksi';
  const payInputs = document.querySelector('#modal-payment .modal-body > div:nth-child(2)');
  if (payInputs) payInputs.style.display = 'none';
  const footer = document.querySelector('#modal-payment .modal-footer');
  if (footer) footer.innerHTML = `
    <button class="btn btn-brown w-full" onclick="closeModal('modal-payment'); showPage('report');">Tutup</button>
  `;
}

function getRevenueSeries(txns, period) {
  const now = new Date();
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const dateKey = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  if (period === 'daily') {
    const labels = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00'];
    const values = labels.map(() => 0);
    txns.forEach(t => {
      const d = new Date(t.date);
      if (d.toDateString() === now.toDateString()) {
        const hour = d.getHours();
        if (hour >= 8 && hour < 10) values[0] += Number(t.total) || 0;
        else if (hour >= 10 && hour < 12) values[1] += Number(t.total) || 0;
        else if (hour >= 12 && hour < 14) values[2] += Number(t.total) || 0;
        else if (hour >= 14 && hour < 16) values[3] += Number(t.total) || 0;
        else if (hour >= 16 && hour < 18) values[4] += Number(t.total) || 0;
        else if (hour >= 18 && hour < 20) values[5] += Number(t.total) || 0;
        else if (hour >= 20 && hour < 22) values[6] += Number(t.total) || 0;
        else if (hour >= 22) values[7] += Number(t.total) || 0;
      }
    });
    return { labels, values, title: 'Pendapatan Hari Ini' };
  }

  if (period === 'yearly') {
    const startYear = now.getFullYear() - 4;
    const labels = Array.from({ length: 5 }, (_, i) => String(startYear + i));
    const values = labels.map(() => 0);
    txns.forEach(t => {
      const d = new Date(t.date);
      const idx = d.getFullYear() - startYear;
      if (idx >= 0 && idx < values.length) values[idx] += Number(t.total) || 0;
    });
    return { labels, values, title: 'Pendapatan Tahunan' };
  }

  if (period === 'monthly') {
    const labels = monthNames;
    const values = labels.map(() => 0);
    txns.forEach(t => {
      const d = new Date(t.date);
      if (d.getFullYear() === now.getFullYear()) values[d.getMonth()] += Number(t.total) || 0;
    });
    return { labels, values, title: 'Pendapatan Bulanan' };
  }

  const labels = [];
  const keys = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    labels.push(d.toLocaleDateString('id-ID', { weekday: 'short' }));
    keys.push(dateKey(d));
  }
  const values = labels.map(() => 0);
  txns.forEach(t => {
    const key = dateKey(new Date(t.date));
    const idx = keys.indexOf(key);
    if (idx >= 0) values[idx] += Number(t.total) || 0;
  });
  return { labels, values, title: 'Pendapatan Mingguan' };
}

function renderDashboardRevenueChart(period = 'weekly') {
  const ctx = document.getElementById('revenueChart');
  if (!ctx || typeof Chart === 'undefined') return;

  const series = getRevenueSeries(window.dashboardTxns || [], period);
  const titleEl = document.getElementById('revenue-chart-title');
  if (titleEl) titleEl.innerHTML = `<i data-lucide="bar-chart-2" style="width:18px;height:18px;color:var(--accent);"></i> ${series.title}`;
  if (typeof lucide !== 'undefined') lucide.createIcons();

  if (revenueChartInstance) revenueChartInstance.destroy();
  revenueChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: series.labels,
      datasets: [{
        label: 'Pendapatan (Rp)',
        data: series.values,
        borderColor: '#B8763A',
        backgroundColor: 'rgba(184, 118, 58, 0.12)',
        borderWidth: 2,
        fill: true,
        tension: 0.35,
        pointBackgroundColor: '#B8763A',
        pointRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(0,0,0,0.05)' },
          ticks: { callback: function(val) { return 'Rp ' + (val / 1000) + 'k'; } }
        },
        x: { grid: { display: false } }
      }
    }
  });
}

let activeDashboardPeriod = 'daily';

async function renderDashboard(el) {
  el.innerHTML = `
    <div class="dashboard-hero">
      <div style="display:flex; justify-content:space-between; align-items:flex-end; flex-wrap:wrap; gap:16px;">
        <div>
          <h2>Halo, ${currentUser ? currentUser.name : 'User'}!</h2>
          <p>Berikut adalah ringkasan performa KopiSembilan.</p>
        </div>
        <div class="period-tabs" style="background:var(--brown-50); padding:4px; border-radius:12px; border:1px solid var(--brown-100);">
          <button class="period-tab ${activeDashboardPeriod === 'daily' ? 'active' : ''}" onclick="changeDashboardPeriod('daily')">Hari Ini</button>
          <button class="period-tab ${activeDashboardPeriod === 'weekly' ? 'active' : ''}" onclick="changeDashboardPeriod('weekly')">Mingguan</button>
          <button class="period-tab ${activeDashboardPeriod === 'monthly' ? 'active' : ''}" onclick="changeDashboardPeriod('monthly')">Bulanan</button>
          <button class="period-tab ${activeDashboardPeriod === 'yearly' ? 'active' : ''}" onclick="changeDashboardPeriod('yearly')">Tahunan</button>
        </div>
      </div>
    </div>
    <div id="dashboard-content-area">
      <div style="text-align:center; padding:40px; color:var(--text-muted);">Memuat data dashboard...</div>
    </div>
  `;
  
  let txns = [];
  try {
    let { data } = await db.from('transactions').select('*, transaction_items(*)').order('date', { ascending: false });
    if (data) txns = data;
  } catch(e) { console.error('Dashboard load fail', e); }
  window.dashboardTxns = txns;

  renderDashboardContent();
}

function changeDashboardPeriod(period) {
  activeDashboardPeriod = period;
  document.querySelectorAll('.dashboard-hero .period-tab').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('onclick').includes(`'${period}'`));
  });
  renderDashboardContent();
}

function renderDashboardContent() {
  const area = document.getElementById('dashboard-content-area');
  if (!area) return;

  const txns = window.dashboardTxns || [];
  const now = new Date();
  
  const filteredTxns = txns.filter(t => {
    const d = new Date(t.date);
    if (activeDashboardPeriod === 'daily') {
      return d.toDateString() === now.toDateString();
    } else if (activeDashboardPeriod === 'weekly') {
      const weekAgo = new Date(now);
      weekAgo.setDate(now.getDate() - 7);
      return d >= weekAgo;
    } else if (activeDashboardPeriod === 'monthly') {
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    } else if (activeDashboardPeriod === 'yearly') {
      return d.getFullYear() === now.getFullYear();
    }
    return true;
  });

  const totalRev = filteredTxns.reduce((s, t) => s + (Number(t.total) || 0), 0);
  const totalCount = filteredTxns.length;

  const itemCounts = {};
  filteredTxns.forEach(t => {
    if (t.transaction_items) {
      t.transaction_items.forEach(i => {
        const p = products.find(prod => prod.id === i.product_id);
        // Jika produk tidak ditemukan di daftar aktif, jangan tampilkan di ranking
        if (!p) return;
        
        const key = p.name;
        itemCounts[key] = (itemCounts[key] || 0) + i.qty;
      });
    }
  });

  const topProducts = Object.entries(itemCounts)
    .sort((a,b) => b[1] - a[1])
    .slice(0, 4)
    .map(entry => ({ name: entry[0], qty: entry[1] }));

  let topHtml = topProducts.map((tp, idx) => `
    <div class="dashboard-list-row">
      <div class="ranked-item">
        <span class="rank-badge">${idx + 1}</span>
        <div><div class="item-title">${tp.name}</div></div>
      </div>
      <span class="item-qty">${tp.qty} <span>porsi</span></span>
    </div>
  `).join('');
  if (!topHtml) topHtml = '<div class="empty-state">Belum ada data penjualan periode ini.</div>';

  const payStats = { cash: 0, qris: 0, transfer: 0, card: 0 };
  filteredTxns.forEach(t => { if (payStats[t.payment_method] !== undefined) payStats[t.payment_method] += Number(t.total) || 0; });
  const payHtml = [
    ['qr-code', 'QRIS', payStats.qris],
    ['banknote', 'Tunai', payStats.cash],
    ['arrow-right-left', 'Transfer', payStats.transfer],
    ['credit-card', 'Kartu Debit/Kredit', payStats.card]
  ].map(([icon, label, value]) => `
    <div class="payment-summary-row">
      <div><i data-lucide="${icon}" style="width:18px;height:18px;color:var(--text-muted);"></i><span>${label}</span></div>
      <strong>${fmtRp(value)}</strong>
    </div>
  `).join('');

  const recentTxns = filteredTxns.slice(0, 4);
  let recentHtml = recentTxns.map(t => `
    <div class="dashboard-list-row">
      <div class="recent-transaction-main">
        <div class="recent-transaction-id">${t.id}</div>
        <div class="item-meta">${new Date(t.date).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'})} - ${t.payment_method.toUpperCase()}</div>
      </div>
      <div class="recent-transaction-total">
        <div>${fmtRp(t.total)}</div>
        <span class="badge ${t.payment_status === 'Lunas' ? 'badge-green' : 'badge-red'}">${t.payment_status}</span>
      </div>
    </div>
  `).join('');
  if (!recentHtml) recentHtml = '<div class="empty-state">Belum ada transaksi periode ini.</div>';

  area.innerHTML = `
    <div class="stats-grid dashboard-stats">
      <div class="stat-card"><div class="label">Total Pendapatan</div><div class="value">${fmtRp(totalRev)}</div><div class="change up"><i data-lucide="trending-up" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Periode terpilih</div></div>
      <div class="stat-card"><div class="label">Total Transaksi</div><div class="value">${totalCount}</div><div class="change up"><i data-lucide="activity" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Transaksi periode ini</div></div>
      <div class="stat-card"><div class="label">Produk Terjual</div><div class="value">${Object.values(itemCounts).reduce((a,b)=>a+b, 0)}</div><div class="change up"><i data-lucide="coffee" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Porsi disajikan</div></div>
    </div>

    <div class="dashboard-grid dashboard-grid-primary">
      <div class="card">
        <div class="card-header dashboard-card-header">
          <h3 id="revenue-chart-title"><i data-lucide="bar-chart-2" style="width:18px;height:18px;color:var(--accent);"></i> Grafik Pendapatan</h3>
        </div>
        <div class="card-body dashboard-chart-body">
          <canvas id="revenueChart"></canvas>
        </div>
      </div>
      <div class="card">
        <div class="card-header dashboard-card-header"><h3><i data-lucide="award" style="width:18px;height:18px;color:var(--accent);"></i> Menu Paling Laris</h3></div>
        <div class="card-body dashboard-list">${topHtml}</div>
      </div>
    </div>

    <div class="dashboard-grid dashboard-grid-secondary">
      <div class="card">
        <div class="card-header dashboard-card-header"><h3><i data-lucide="pie-chart" style="width:18px;height:18px;color:var(--accent);"></i> Ringkasan Pembayaran</h3></div>
        <div class="card-body payment-summary">${payHtml}</div>
      </div>
      <div class="card">
        <div class="card-header dashboard-card-header"><h3><i data-lucide="clock" style="width:18px;height:18px;color:var(--accent);"></i> Transaksi Terakhir</h3></div>
        <div class="card-body dashboard-list">${recentHtml}</div>
      </div>
    </div>
  `;
  
  if (typeof lucide !== 'undefined') lucide.createIcons();
  setTimeout(() => renderDashboardRevenueChart(activeDashboardPeriod), 100);
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
  toast.style.display = 'flex';
  toast.style.alignItems = 'center';
  toast.style.gap = '10px';
  
  toast.innerHTML = `
    <i data-lucide="coffee" style="width:16px;height:16px;"></i>
    <span>${msg}</span>
  `;
  
  container.appendChild(toast);
  if (typeof lucide !== 'undefined') lucide.createIcons();
  
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
  if (typeof lucide !== 'undefined') lucide.createIcons();
  await loadStoreInfo();
  const savedSession = localStorage.getItem('ks_session');
  if (savedSession) {
    try { setupUserSession(JSON.parse(savedSession)); } catch (e) { localStorage.removeItem('ks_session'); }
  }
};

document.addEventListener('focusout', function(e) {
  if (e.target && e.target.id === 'customer-phone' && e.target.value) {
    e.target.value = formatPhoneWA(e.target.value);
  }
});

/**
 * Menambahkan shortcut catatan ke input textarea atau text (Toggle Mode)
 * @param {string} text 
 * @param {string} targetId
 */
function addNoteShortcut(text, targetId = 'note-input') {
  const input = document.getElementById(targetId);
  if (!input) return;
  
  let currentVal = input.value.trim();
  // Pisahkan berdasarkan koma dan bersihkan spasi
  let tags = currentVal ? currentVal.split(',').map(t => t.trim()).filter(t => t) : [];
  
  const index = tags.indexOf(text);
  if (index > -1) {
    // Jika sudah ada, hapus (toggle off)
    tags.splice(index, 1);
  } else {
    // Jika belum ada, tambah (toggle on)
    tags.push(text);
  }
  
  input.value = tags.join(', ');
  input.focus();
  
  // Update tampilan shortcut
  syncShortcutChips(targetId);
}

/**
 * Menyinkronkan status aktif shortcut chip dengan isi input
 * @param {string} targetId 
 */
function syncShortcutChips(targetId) {
  const input = document.getElementById(targetId);
  if (!input) return;
  
  const currentVal = input.value.trim();
  const tags = currentVal ? currentVal.split(',').map(t => t.trim()) : [];
  
  // Cari container shortcuts terdekat
  const container = input.parentElement.querySelector('.note-shortcuts');
  if (container) {
    container.querySelectorAll('.shortcut-chip').forEach(btn => {
      const btnText = btn.textContent.trim();
      if (tags.includes(btnText)) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }
}

let currentEditingTxnItems = [];
let currentEditingTxn = null;

async function editTransaction(id) {
  try {
    const { data: txn, error } = await db.from('transactions').select('*, transaction_items(*, products(*))').eq('id', id).single();
    if (error || !txn) { showToast('Gagal memuat data transaksi!', 'error'); return; }

    currentEditingTxn = txn;
    document.getElementById('edit-txn-id').value = txn.id;
    document.getElementById('edit-txn-id-display').value = txn.id;
    document.getElementById('edit-txn-phone').value = txn.customer_phone || '';
    document.getElementById('edit-txn-method').value = txn.payment_method || 'cash';
    document.getElementById('edit-txn-status').value = txn.payment_status || 'Lunas';
    document.getElementById('edit-txn-notes').value = txn.notes || '';

    currentEditingTxnItems = txn.transaction_items.map(i => ({
      id: i.id,
      product_id: i.product_id,
      name: i.products?.name || 'Produk',
      price: i.price,
      qty: i.qty,
      item_note: i.item_note || '',
      originalQty: i.qty,
      removed: false
    }));

    renderEditTxnItems();
    openModal('modal-edit-txn');
  } catch (e) { showToast('Terjadi kesalahan!', 'error'); }
}

function renderEditTxnItems() {
  const container = document.getElementById('edit-txn-items-list');
  if (!container) return;

  const visibleItems = currentEditingTxnItems.filter(i => !i.removed);
  
  if (visibleItems.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:10px; color:var(--text-muted); font-size:13px;">Tidak ada item dalam pesanan.</div>';
    return;
  }

  container.innerHTML = currentEditingTxnItems.map((item, idx) => {
    if (item.removed) return '';
    return `
      <div class="edit-item-row" style="display:flex; align-items:center; justify-content:space-between; padding:8px; background:var(--brown-50); border-radius:8px; gap:12px;">
        <div style="flex:1;">
          <div style="font-weight:600; font-size:13px;">${item.name}</div>
          <div style="font-size:11px; color:var(--text-muted);">${fmtRp(item.price)}</div>
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          <button class="qty-btn" style="width:24px; height:24px;" onclick="changeEditItemQty(${idx}, -1)">−</button>
          <span style="font-weight:700; font-size:14px; min-width:20px; text-align:center;">${item.qty}</span>
          <button class="qty-btn" style="width:24px; height:24px;" onclick="changeEditItemQty(${idx}, 1)">+</button>
        </div>
        <button class="btn btn-red btn-sm" style="padding:4px;" onclick="removeEditItem(${idx})" title="Hapus Item"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button>
      </div>
    `;
  }).join('');
  
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function changeEditItemQty(idx, delta) {
  const item = currentEditingTxnItems[idx];
  if (!item) return;
  
  item.qty += delta;
  if (item.qty <= 0) {
    item.qty = 0;
    item.removed = true;
  }
  renderEditTxnItems();
}

function removeEditItem(idx) {
  const item = currentEditingTxnItems[idx];
  if (!item) return;
  item.removed = true;
  renderEditTxnItems();
}

async function saveTransactionEdit() {
  const id = document.getElementById('edit-txn-id').value;
  const phone = document.getElementById('edit-txn-phone').value.trim();
  const method = document.getElementById('edit-txn-method').value;
  const status = document.getElementById('edit-txn-status').value;
  const notes = document.getElementById('edit-txn-notes').value.trim();

  try {
    // 1. Hitung total baru berdasarkan item yang diedit
    const newTotal = currentEditingTxnItems.reduce((sum, item) => {
      return sum + (item.removed ? 0 : item.price * item.qty);
    }, 0);

    // 2. Hitung ulang kembalian jika metode pembayaran tunai
    let cashChange = currentEditingTxn ? (currentEditingTxn.cash_change || 0) : 0;
    if (currentEditingTxn && currentEditingTxn.payment_method === 'cash') {
      const cashAmount = currentEditingTxn.cash_amount || 0;
      // Jika total baru lebih kecil, kembalian bertambah
      // Jika total baru lebih besar, kembalian berkurang
      cashChange = cashAmount - newTotal;
      if (cashChange < 0 && status === 'Lunas') {
        showToast('Peringatan: Total pesanan melebihi jumlah bayar!', 'error');
        // Jangan batalkan save, tapi beri tahu user
      }
    } else if (method !== 'cash') {
      // Jika berubah ke non-tunai, reset info tunai
      cashChange = 0;
    }

    // 3. Update transaksi utama
    const updateData = {
      customer_phone: phone,
      payment_method: method,
      payment_status: status,
      notes: notes,
      total: newTotal,
      cash_change: cashChange
    };
    
    if (method !== 'cash') {
      updateData.cash_amount = 0;
    }

    const { error: txnErr } = await db.from('transactions').update(updateData).eq('id', id);

    if (txnErr) throw txnErr;

    // 4. Update item transaksi
    for (const item of currentEditingTxnItems) {
      if (item.removed) {
        // Hapus item jika ditandai removed
        await db.from('transaction_items').delete().eq('id', item.id);
      } else if (item.qty !== item.originalQty) {
        // Update kuantitas jika berubah
        await db.from('transaction_items').update({ qty: item.qty }).eq('id', item.id);
      }
    }

    showToast('Transaksi dan pesanan diperbarui!', 'success');
    addActivityLog('Edit Transaksi & Pesanan', `ID: ${id}, Total Baru: ${fmtRp(newTotal)}`);
    closeModal('modal-edit-txn');
    
    // Refresh laporan jika sedang di halaman laporan
    const currentTitle = document.getElementById('page-title').textContent;
    if (currentTitle.includes('Laporan')) {
      renderReport(document.getElementById('page-content'));
    }
  } catch (e) {
    console.error('Save txn edit error:', e);
    showToast('Gagal menyimpan perubahan!', 'error');
  }
}

/**
 * Mengirim ulang struk via WhatsApp dari laporan
 * @param {string} id - Transaction ID
 */
async function resendWhatsAppReceipt(id) {
  const { data: txn, error } = await db.from('transactions').select('*, transaction_items(*, products(*))').eq('id', id).single();
  if (error || !txn) { 
    showToast('Gagal memuat data transaksi!', 'error'); 
    return; 
  }
  
  if (!txn.customer_phone) {
    showToast('Nomor WhatsApp tidak tersimpan untuk transaksi ini!', 'error');
    return;
  }

  // Format item agar sesuai dengan yang diharapkan sendWhatsAppReceipt
  const formattedItems = txn.transaction_items.map(i => ({
    name: i.products?.name || 'Produk',
    qty: i.qty,
    totalPrice: i.price,
    note: i.item_note
  }));

  sendWhatsAppReceipt(txn.customer_phone, txn.id, txn.total, formattedItems);
}

/**
 * Menghapus transaksi dari database
 * @param {string} id - Transaction ID
 */
async function deleteTransaction(id) {
  showConfirmDialog({
    title: 'Hapus Transaksi?',
    message: 'Data transaksi ini akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.',
    icon: 'trash-2',
    confirmText: 'Ya, Hapus',
    cancelText: 'Batal',
    onConfirm: async () => {
      try {
        // Hapus item transaksi terlebih dahulu (jika tidak ada cascade delete)
        const { error: itemErr } = await db.from('transaction_items').delete().eq('transaction_id', id);
        if (itemErr) throw itemErr;

        // Hapus transaksi utama
        const { error: txnErr } = await db.from('transactions').delete().eq('id', id);
        if (txnErr) throw txnErr;

        showToast('Transaksi berhasil dihapus!', 'success');
        addActivityLog('Hapus Transaksi', `ID: ${id}`);
        
        // Refresh laporan jika sedang di halaman laporan
        const currentTitle = document.getElementById('page-title').textContent;
        if (currentTitle.includes('Laporan')) {
          renderReport(document.getElementById('page-content'));
        }
      } catch (e) {
        console.error('Delete transaction error:', e);
        showToast('Gagal menghapus transaksi!', 'error');
      }
    }
  });
}

/**
 * Mengunduh pratinjau struk sebagai gambar PNG
 * @param {string} txnId 
 */
function downloadReceiptImage(txnId) {
  const element = document.getElementById('receipt-preview');
  if (!element) return;

  // Berikan sedikit padding dan styling khusus untuk ekspor gambar
  const originalStyle = element.style.cssText;
  element.style.padding = '30px';
  element.style.background = 'white';
  element.style.width = '350px'; // Ukuran standar struk

  html2canvas(element, {
    scale: 2, // Kualitas lebih tajam
    backgroundColor: '#ffffff',
    logging: false
  }).then(canvas => {
    // Kembalikan style asli
    element.style.cssText = originalStyle;

    // Trigger download
    const link = document.createElement('a');
    link.download = `Struk-${txnId}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    
    showToast('Struk berhasil diunduh!', 'success');
  }).catch(err => {
    console.error('Export error:', err);
    showToast('Gagal membuat gambar struk!', 'error');
    element.style.cssText = originalStyle;
  });
}

// ══════════════════════════════════════════════
// ACTIVITY LOGS
// ══════════════════════════════════════════════
async function renderLogs(el) {
  el.innerHTML = `<div style="text-align:center; padding:40px;">Memuat log aktivitas...</div>`;
  
  let logs = [];
  try {
    const { data, error } = await db.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(100);
    if (!error && data) logs = data;
  } catch(e) { console.error('Load logs fail', e); }

  const rows = logs.map(l => `
    <tr>
      <td><div style="font-size:12px; color:var(--text-muted);">${new Date(l.created_at).toLocaleString('id-ID', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'})}</div></td>
      <td><strong>${l.user_name}</strong> <span class="badge ${l.user_role === 'admin' ? 'badge-amber' : 'badge-blue'}" style="font-size:9px; padding:1px 6px;">${l.user_role.toUpperCase()}</span></td>
      <td><span style="font-weight:600; color:var(--brown-800);">${l.action}</span></td>
      <td><div style="font-size:11px; max-width:300px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeAttr(l.details || '')}">${l.details || '-'}</div></td>
    </tr>
  `).join('');

  el.innerHTML = `
    <div class="inv-actions">
      <div style="flex:1;"><h3 style="font-family:'DM Serif Display'; font-size:20px; color:var(--brown-800);">Riwayat Aktivitas</h3><p style="font-size:12px; color:var(--text-muted);">Memantau 100 tindakan terakhir yang dilakukan di sistem.</p></div>
      <button class="btn btn-outline btn-sm" onclick="showPage('logs')"><i data-lucide="refresh-cw" style="width:14px;height:14px;"></i> Refresh</button>
    </div>
    <div class="card">
      <div style="overflow-x:auto;">
        <table class="table">
          <thead><tr><th>Waktu</th><th>Pengguna</th><th>Aksi</th><th>Detail</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="4" style="text-align:center; padding:30px;">Belum ada catatan aktivitas.</td></tr>'}</tbody>
        </table>
      </div>
    </div>
  `;
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function addActivityLog(action, details = '') {
  if (!currentUser) return;
  try {
    const { error } = await db.from('activity_logs').insert([{
      user_id: currentUser.id,
      user_name: currentUser.name,
      user_role: currentUser.role,
      action: action,
      details: details
    }]);
    if (error) console.error('Add log error:', error.message, error.details);
  } catch(e) { console.error('Add log fail', e); }
}

/**
 * Mengunduh seluruh data sistem sebagai file JSON untuk backup manual
 */
async function downloadSystemBackup() {
  showToast('Menyiapkan file backup...', 'info');
  try {
    const tables = ['products', 'categories', 'users', 'transactions', 'transaction_items', 'settings'];
    const backupData = {
      timestamp: new Date().toISOString(),
      store: storeInfo.name,
      data: {}
    };

    for (const table of tables) {
      const { data, error } = await db.from(table).select('*');
      if (!error) {
        backupData.data[table] = data;
      }
    }

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Backup_KopiSembilan_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    showToast('Backup berhasil diunduh!', 'success');
    addActivityLog('Backup Sistem', 'Unduh file JSON backup manual');
  } catch (e) {
    console.error('Backup error:', e);
    showToast('Gagal membuat backup!', 'error');
  }
}

/**
 * Mengekspor daftar menu ke format CSV agar mudah dibuka di Excel
 */
function exportMenuToCSV() {
  if (!products || products.length === 0) {
    showToast('Tidak ada data menu untuk diekspor', 'error');
    return;
  }

  let csvContent = "data:text/csv;charset=utf-8,";
  csvContent += "ID,Nama Menu,Kategori,Harga Dasar,Status Aktif\n";

  products.forEach(p => {
    const row = [
      p.id,
      `"${p.name}"`,
      `"${p.category}"`,
      p.base_price,
      p.active ? 'Aktif' : 'Non-Aktif'
    ];
    csvContent += row.join(",") + "\n";
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `Daftar_Menu_KopiSembilan_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  showToast('Daftar menu berhasil diekspor!', 'success');
  addActivityLog('Ekspor Menu', 'Unduh file CSV daftar menu');
}

