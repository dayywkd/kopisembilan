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
let isProcessingPayment = false;
let storeInfo = { name: 'KopiSembilan', address: 'Jl. Kopi Nomor 9, Tuban, Jawa Timur', phone: '085855180131' };
let waTemplate = `*INVOICE [NAMA_TOKO]*
ID: [ID_TXN]
Tanggal: [TANGGAL]
----------------------------
[ITEMS]
----------------------------
*TOTAL: [TOTAL]*

Terima kasih sudah memesan!`;

const DEFAULT_VARIANTS = [];

// ─── STATED PRIVACY UNTUK DASHBOARD ───
let dashboardPrivacy = {
  revenue: localStorage.getItem('ks_priv_revenue') === 'true',
  transactions: localStorage.getItem('ks_priv_transactions') === 'true',
  products: localStorage.getItem('ks_priv_products') === 'true',
  chart: localStorage.getItem('ks_priv_chart') === 'true',
  top_menu: localStorage.getItem('ks_priv_top_menu') === 'true',
  payment: localStorage.getItem('ks_priv_payment') === 'true',
  recent: localStorage.getItem('ks_priv_recent') === 'true'
};

window.toggleDashboardPrivacy = (key) => {
  dashboardPrivacy[key] = !dashboardPrivacy[key];
  localStorage.setItem(`ks_priv_${key}`, dashboardPrivacy[key]);
  renderDashboardContent();
};

window.toggleAllDashboardPrivacy = () => {
  const keys = ['revenue', 'transactions', 'products', 'chart', 'top_menu', 'payment', 'recent'];
  const anyVisible = keys.some(k => !dashboardPrivacy[k]);
  
  keys.forEach(k => {
    dashboardPrivacy[k] = anyVisible;
    localStorage.setItem(`ks_priv_${k}`, anyVisible);
  });
  
  renderDashboardContent();
};

window.updateGlobalPrivacyButton = () => {
  const btn = document.getElementById('btn-privacy-global-toggle');
  const icon = document.getElementById('icon-privacy-global');
  if (!btn || !icon) return;
  
  const keys = ['revenue', 'transactions', 'products', 'chart', 'top_menu', 'payment', 'recent'];
  const allHidden = keys.every(k => dashboardPrivacy[k]);
  
  if (allHidden) {
    btn.classList.add('btn-brown');
    btn.classList.remove('btn-outline');
    btn.querySelector('span').textContent = 'Sensor Aktif';
    icon.innerHTML = `<i data-lucide="eye-off" style="width:16px;height:16px;"></i>`;
    icon.setAttribute('data-lucide', 'eye-off');
  } else {
    btn.classList.remove('btn-brown');
    btn.classList.add('btn-outline');
    btn.querySelector('span').textContent = 'Mode Privasi';
    icon.innerHTML = `<i data-lucide="eye" style="width:16px;height:16px;"></i>`;
    icon.setAttribute('data-lucide', 'eye');
  }
  
  if (typeof lucide !== 'undefined') lucide.createIcons();
};

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

async function fetchAllTransactions() {
  let allTxns = [];
  let from = 0;
  let to = 999;
  let hasMore = true;
  
  while (hasMore) {
    const { data, error } = await db
      .from('transactions')
      .select('*, transaction_items(*, products(*))')
      .order('date', { ascending: false })
      .range(from, to);
      
    if (error) {
      console.error('Error fetching transactions batch:', error);
      break;
    }
    
    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allTxns = allTxns.concat(data);
      if (data.length < 1000) {
        hasMore = false;
      } else {
        from += 1000;
        to += 1000;
      }
    }
  }
  return allTxns;
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
    
    if (typeof lucide !== 'undefined') lucide.createIcons();
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
    content.classList.remove('fade-in-up');
    content.innerHTML = '';
    const renders = {
      dashboard: renderDashboard, cashier: renderCashier, inventory: renderInventory,
      report: renderReport, users: renderUsers, settings: renderSettings, manual: renderManual,
      logs: renderLogs
    };
    if (renders[page]) renders[page](content);
    
    // Memicu reflow agar animasi terpicu ulang
    void content.offsetWidth;
    content.classList.add('fade-in-up');
    
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
      ${editingTransactionId ? `
        <div style="display:flex;flex-direction:column;gap:16px;overflow:hidden; grid-column: 1 / -1; margin-bottom: 8px;">
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
        </div>
      ` : ''}
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
  if (typeof lucide !== 'undefined') lucide.createIcons();
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

  // Cek apakah item yang SAMA PERSIS (tanpa catatan & varian) sudah ada di keranjang
  const existingItem = cart.find(c => 
    c.productId === product.id && 
    (c.note === '' || !c.note) && 
    (!c.variants || c.variants.length === 0)
  );

  if (existingItem) {
    existingItem.qty += 1;
  } else {
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
  }

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
        <button class="btn btn-brown" style="flex:1.5; display:flex; align-items:center; justify-content:center; gap:6px;" onclick="confirmPayment('none')">
          <i data-lucide="check" style="width:18px;height:18px;"></i> Selesai
        </button>
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
 * @param {string} mode - 'image', 'text', or 'none'
 */
function processPhoneAction(mode) {
  const modalInput = document.getElementById('phone-modal-input');
  const phoneEl = document.getElementById('customer-phone');
  const phone = modalInput ? modalInput.value.trim() : '';

  if (mode !== 'none' && !phone) {
    showToast("Nomor WhatsApp wajib diisi!", "error");
    if (modalInput) modalInput.focus();
    return;
  }

  if (phoneEl) phoneEl.value = phone;
  closeModal('modal-phone');
  confirmPayment(mode);
}

function openPayment() {
  resetPaymentModalForCheckout();
  
  const statusSelect = document.getElementById('payment-status');
  if (statusSelect) {
    statusSelect.onchange = () => updateReceiptPreviewContent();
  }

  updateReceiptPreviewContent();

  const cashIn = document.getElementById('cash-input');
  const custPhone = document.getElementById('customer-phone');
  const txnNote = document.getElementById('txn-note');
  const changeDisp = document.getElementById('change-display');

  if (cashIn) cashIn.value = '';
  if (custPhone) custPhone.value = '';
  if (txnNote) txnNote.value = '';
  if (changeDisp) changeDisp.style.display = 'none';
  renderQuickCashButtons();
  openModal('modal-payment');
}

/**
 * Fungsi untuk memperbarui isi pratinjau struk
 */
function updateReceiptPreviewContent() {
  const status = document.getElementById('payment-status')?.value || 'Lunas';
  
  // Kelompokkan item yang identik untuk pratinjau struk
  const groupedCart = cart.reduce((acc, item) => {
    const existing = acc.find(i => 
      i.productId === item.productId && 
      i.totalPrice === item.totalPrice && 
      (i.note || '') === (item.note || '') && 
      JSON.stringify(i.variants || []) === JSON.stringify(item.variants || [])
    );
    if (existing) {
      existing.qty += item.qty;
    } else {
      acc.push({ ...item });
    }
    return acc;
  }, []);

  const total = groupedCart.reduce((s, c) => s + (c.totalPrice * c.qty), 0);
  const now = new Date();
  const txnId = editingTransactionId || ('TXN-' + getIndoDate().replace(/-/g,'') + '-' + Math.floor(1000 + Math.random() * 9000));
  
  const preview = document.getElementById('receipt-preview');
  if (preview) {
    preview.innerHTML = `
      <div class="receipt" id="receipt-capture">
        <div class="receipt-header">
          <div class="receipt-logo">${storeInfo.name}</div>
          <p style="font-size:10px; color:#666; margin:0;">${storeInfo.address}</p>
          <p style="font-size:10px; color:#666; margin:0;">WA: ${storeInfo.phone}</p>
        </div>
        
        <div class="receipt-info">
          <span>Tgl: ${getIndoDateTime(now, { dateStyle: 'medium' })}</span>
          <span>Jam: ${getIndoTimeString(now)}</span>
        </div>
        <div class="receipt-info">
          <span>ID: ${txnId}</span>
          <span>Kasir: ${currentUser ? currentUser.name : 'Kasir'}</span>
        </div>
        
        <hr class="receipt-divider">
        
        <div class="receipt-items">
          ${groupedCart.map(c => `
            <div class="receipt-item">
              <div class="receipt-item-name">${c.name}</div>
              <div class="receipt-item-details">
                <span>${c.qty} x ${fmtRp(c.totalPrice)}</span>
                <span>${fmtRp(c.totalPrice * c.qty)}</span>
              </div>
              ${c.variants && c.variants.length > 0 ? `<div style="font-size:10px; color:#666; font-style:italic; margin-left:10px;">- ${c.variants.map(v => v.name).join(', ')}</div>` : ''}
              ${c.note ? `<div style="font-size:10px; color:#888; margin-left:10px;">* ${c.note}</div>` : ''}
            </div>
          `).join('')}
        </div>
        
        <hr class="receipt-divider">
        
        <div class="receipt-total-row">
          <span>TOTAL</span>
          <span>${fmtRp(total)}</span>
        </div>
        
        ${status === 'Belum Bayar' ? `<div class="receipt-status">BELUM LUNAS</div>` : ''}
        
        <div class="receipt-footer">
          <p style="margin:2px 0;">Terima Kasih Atas Kunjungan Anda</p>
          <p style="margin:10px 0 0; font-weight:bold; letter-spacing:1px;">KOPI SEMBILAN</p>
        </div>
      </div>
    `;
  }
}

window.renderQuickCashButtons = () => {
  const container = document.getElementById('quick-cash-list');
  if (!container) return;
  
  const denoms = JSON.parse(localStorage.getItem('ks_quick_cash_denoms') || '[15000, 25000, 30000, 50000, 100000, 150000, 200000]');
  
  container.innerHTML = denoms.map(d => `
    <button type="button" class="quick-cash-option" onclick="quickCash(${d})" oncontextmenu="event.preventDefault(); removeCustomDenomination(${d});" title="Klik untuk menggunakan, klik kanan untuk menghapus">
      ${Number(d).toLocaleString('id-ID')}
    </button>
  `).join('') + `
    <button type="button" class="quick-cash-option" onclick="addCustomDenomination()" style="display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; padding:0; border-radius:50%; background:var(--brown-50); color:var(--brown-800); border-color:var(--brown-200); font-size:16px; font-weight:700;" title="Tambah Pecahan Kustom">+</button>
  `;
};

window.addCustomDenomination = () => {
  const input = document.getElementById('denom-kustom-input');
  if (input) input.value = '';
  openModal('modal-denom-kustom');
  setTimeout(() => { if (input) input.focus(); }, 150);
};

window.submitCustomDenomination = () => {
  const input = document.getElementById('denom-kustom-input');
  if (!input) return;
  
  const val = input.value.trim();
  const cleanVal = parsePrice(val);
  
  if (!cleanVal || cleanVal <= 0) {
    showToast("Nominal uang tidak valid!", "error");
    input.focus();
    return;
  }
  
  let denoms = JSON.parse(localStorage.getItem('ks_quick_cash_denoms') || '[15000, 25000, 30000, 50000, 100000, 150000, 200000]');
  if (denoms.includes(cleanVal)) {
    showToast("Pecahan uang tersebut sudah ada!", "info");
    closeModal('modal-denom-kustom');
    return;
  }
  
  denoms.push(cleanVal);
  denoms.sort((a, b) => a - b);
  
  localStorage.setItem('ks_quick_cash_denoms', JSON.stringify(denoms));
  renderQuickCashButtons();
  closeModal('modal-denom-kustom');
  showToast(`Pecahan Rp ${cleanVal.toLocaleString('id-ID')} ditambahkan.`, "success");
};

window.removeCustomDenomination = (denom) => {
  if (confirm(`Hapus pecahan Rp ${denom.toLocaleString('id-ID')} dari daftar cepat?`)) {
    let denoms = JSON.parse(localStorage.getItem('ks_quick_cash_denoms') || '[15000, 25000, 30000, 50000, 100000, 150000, 200000]');
    denoms = denoms.filter(d => d !== denom);
    localStorage.setItem('ks_quick_cash_denoms', JSON.stringify(denoms));
    renderQuickCashButtons();
    showToast("Pecahan berhasil dihapus.", "success");
  }
};

window.quickCash = (amount) => {
  const input = document.getElementById('cash-input');
  if (!input) return;
  input.value = Number(amount).toLocaleString('id-ID');
  calcChange();
};

function calcChange() {
  const total = cart.reduce((s, c) => s + (c.totalPrice * c.qty), 0);
  const paid = parsePrice(document.getElementById('cash-input').value);
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

/**
 * @param {string} sendMode - 'image', 'text', or 'none'
 */
async function confirmPayment(sendMode = 'none') {
  if (isProcessingPayment) return;

  if (cart.length === 0) {
    showToast('Keranjang sudah kosong!', 'error');
    return;
  }

  // Nonaktifkan tombol secara fisik segera untuk mencegah double-click
  const payButtons = document.querySelectorAll('#modal-payment button');
  payButtons.forEach(btn => btn.disabled = true);

  isProcessingPayment = true;

  const total = cart.reduce((s, c) => s + (c.totalPrice * c.qty), 0);
  const phoneEl = document.getElementById('customer-phone');
  const phone = phoneEl ? phoneEl.value.replace(/\D/g, '') : '';
  const status = document.getElementById('payment-status')?.value || 'Lunas';
  const note = document.getElementById('txn-note').value.trim();
  const now = new Date();
  
  // Gunakan ID lama jika sedang edit, jika tidak buat ID baru (Gunakan tanggal Indonesia)
  const txnId = editingTransactionId || ('TXN-' + getIndoDate().replace(/-/g,'') + '-' + Math.floor(1000 + Math.random() * 9000));

  if (sendMode !== 'none' && !phone) {
    showToast('Masukkan nomor WA untuk kirim struk!', 'error');
    if (phoneEl) phoneEl.focus();
    // Aktifkan kembali tombol jika validasi gagal
    payButtons.forEach(btn => btn.disabled = false);
    isProcessingPayment = false;
    return;
  }

  let cashAmount = 0;
  let cashChange = 0;
  if (selectedPaymentMethod === 'cash') {
    cashAmount = parsePrice(document.getElementById('cash-input').value);
    if (cashAmount < total && status === 'Lunas') {
      showToast('Jumlah bayar kurang!', 'error');
      // Aktifkan kembali tombol jika validasi gagal
      payButtons.forEach(btn => btn.disabled = false);
      isProcessingPayment = false;
      return;
    }
    cashChange = Math.max(0, cashAmount - total);
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

    if (sendMode === 'image' && phone) {
      sendWhatsAppImageReceipt(phone, txnId, total, cart);
    } else if (sendMode === 'text' && phone) {
      sendWhatsAppReceipt(phone, txnId, total, cart);
    }

    showToast(editingTransactionId ? 'Transaksi diperbarui!' : 'Transaksi Berhasil!', 'success');
    
    // Buat detail log yang sangat rinci termasuk catatan per item
    const itemsSummary = cart.map(c => {
      let itemLine = `- ${c.name} x${c.qty} (${fmtRp(c.totalPrice)})`;
      if (c.note) itemLine += ` [Note: ${c.note}]`;
      return itemLine;
    }).join('\n');

    const logDetails = `ID: ${txnId}\nTotal: ${fmtRp(total)}\nMetode: ${selectedPaymentMethod.toUpperCase()}\nStatus: ${status}\nCatatan Transaksi: ${note || '-'}\nItem:\n${itemsSummary}`;

    addActivityLog(editingTransactionId ? 'Update Transaksi' : 'Transaksi Baru', logDetails);
    
    // Reset state
    editingTransactionId = null;
    cart = [];
    cartItemSeq = 0;
    updateCartUI();
    closeModal('modal-payment');
    
    const pageTitle = document.getElementById('page-title').textContent;
    const content = document.getElementById('page-content');
    if (content) {
      content.classList.remove('fade-in-up');
      if (pageTitle === 'Dashboard') renderDashboard(content);
      else if (pageTitle.includes('Laporan')) renderReport(content);
      else { showPage('report'); return; }
      
      void content.offsetWidth;
      content.classList.add('fade-in-up');
    } else {
      showPage('report');
    }

  } catch (e) {
    console.error(e);
    showToast('Terjadi kesalahan sistem!', 'error');
    const payButtons = document.querySelectorAll('#modal-payment button');
    payButtons.forEach(btn => btn.disabled = false);
  } finally {
    isProcessingPayment = false;
  }
}

function formatPhoneWA(phone) {
  let nomor = phone.replace(/\D/g, '');
  if (nomor.startsWith('0'))      nomor = '62' + nomor.slice(1);
  else if (nomor.startsWith('8')) nomor = '62' + nomor;
  else if (nomor.startsWith('+')) nomor = nomor.replace('+', '');
  return nomor;
}

/**
 * Mengirim struk sebagai gambar ke WhatsApp menggunakan html2canvas dan Web Share API
 */
async function sendWhatsAppImageReceipt(phone, txnId, total, items) {
  const element = document.getElementById('receipt-capture');
  if (!element) {
    // Fallback ke teks jika elemen capture tidak ditemukan
    sendWhatsAppReceipt(phone, txnId, total, items);
    return;
  }

  showToast('Menyiapkan gambar struk...', 'info');

  try {
    const canvas = await html2canvas(element, {
      scale: 2,
      backgroundColor: '#ffffff',
      logging: false,
      useCORS: true
    });

    canvas.toBlob(async (blob) => {
      const file = new File([blob], `struk-${txnId}.png`, { type: 'image/png' });
      
      // Cek apakah browser mendukung sharing file
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: `Struk ${storeInfo.name}`,
            text: `Struk Belanja #${txnId} - Total: ${fmtRp(total)}`
          });
        } catch (shareErr) {
          console.log("Share cancelled or failed", shareErr);
          // Fallback 1: Download
          downloadCanvas(canvas, `struk-${txnId}.png`);
          sendWhatsAppReceipt(phone, txnId, total, items);
        }
      } else {
        // Fallback 2: Desktop / Browser Tanpa Share API
        downloadCanvas(canvas, `struk-${txnId}.png`);
        sendWhatsAppReceipt(phone, txnId, total, items);
        showToast('Gambar struk diunduh. Silakan lampirkan manual.', 'info');
      }
    }, 'image/png');
  } catch (err) {
    console.error('Capture error:', err);
    sendWhatsAppReceipt(phone, txnId, total, items);
  }
}

function downloadCanvas(canvas, filename) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function sendWhatsAppReceipt(phone, txnId, total, items) {
  // Kelompokkan item yang identik (Nama, Harga, Catatan) untuk pesan WA
  const groupedItems = items.reduce((acc, item) => {
    const existing = acc.find(i => 
      i.name === item.name && 
      i.totalPrice === item.totalPrice && 
      (i.note || '') === (item.note || '')
    );
    if (existing) {
      existing.qty += item.qty;
    } else {
      acc.push({ ...item });
    }
    return acc;
  }, []);

  const itemsText = groupedItems.map(c => {
    let text = `• ${c.name}\n  ${c.qty} x ${fmtRp(c.totalPrice)} = ${fmtRp(c.totalPrice * c.qty)}`;
    if (c.note) text += `\n  Note: ${c.note}`;
    return text;
  }).join('\n');

  let message = waTemplate
    .replace('[NAMA_TOKO]', storeInfo.name)
    .replace('[ID_TXN]', txnId)
    .replace('[TANGGAL]', getIndoDateTime(new Date(), { dateStyle: 'medium' }))
    .replace('[ITEMS]', itemsText)
    .replace('[TOTAL]', fmtRp(total));

  const encoded = encodeURIComponent(message);
  const waUrl = `https://wa.me/${formatPhoneWA(phone)}?text=${encoded}`;
  window.open(waUrl, '_blank');
}

/**
 * Meminta nomor WA jika belum ada, menyimpannya, lalu mengirim struk
 */
async function promptAndSendWA(type, phone, txnId, total, items) {
  let targetPhone = String(phone || '').replace(/\D/g, '');
  
  if (!targetPhone) {
    // Gunakan custom modal alih-alih native prompt
    const modalInput = document.getElementById('phone-modal-input');
    if (modalInput) modalInput.value = '';
    
    const footer = document.querySelector('#modal-phone .modal-footer');
    const originalFooterHTML = footer ? footer.innerHTML : '';
    
    if (footer) {
      // Ubah tampilan footer secara dinamis karena jenis kiriman sudah diketahui
      footer.innerHTML = `
        <div style="display:flex; gap:10px; width:100%; margin-top:10px;">
          <button class="btn btn-outline" style="flex:1;" onclick="processPhoneAction('none')">Batal</button>
          <button class="btn btn-brown" style="flex:1;" onclick="processPhoneAction('send')">Simpan & Lanjutkan</button>
        </div>
      `;
    }

    // Ubah sementara aksi tombol di modal-phone untuk keperluan ini
    const originalProcess = window.processPhoneAction;
    
    // Kita buat wrapper agar saat disubmit dari modal, proses ini berlanjut
    window.processPhoneAction = async function(mode) {
      if (mode === 'none') {
        showToast("Pengiriman dibatalkan.", "info");
        closeModal('modal-phone');
        if (footer) footer.innerHTML = originalFooterHTML; // Kembalikan footer
        window.processPhoneAction = originalProcess; // Kembalikan ke fungsi asli
        return;
      }
      
      const newPhone = modalInput ? modalInput.value.replace(/\D/g, '') : '';
      if (!newPhone) {
        showToast("Nomor WhatsApp wajib diisi!", "error");
        if (modalInput) modalInput.focus();
        return;
      }
      
      closeModal('modal-phone');
      targetPhone = newPhone;
      
      // Simpan ke database agar tidak perlu dimasukkan lagi nanti
      const { error } = await db.from('transactions').update({ customer_phone: targetPhone }).eq('id', txnId);
      if (!error) {
        showToast("Nomor WA berhasil disimpan.", "success");
        // Perbarui juga data di laporan yang sedang tampil
        if (window.currentReportTxns) {
          const txnInReport = window.currentReportTxns.find(t => t.id === txnId);
          if (txnInReport) txnInReport.customer_phone = targetPhone;
        }
      }
      
      // Lanjutkan pengiriman (type diambil dari scope luar wrapper)
      if (type === 'image') {
         sendWhatsAppImageReceipt(targetPhone, txnId, total, items);
      } else {
         sendWhatsAppReceipt(targetPhone, txnId, total, items);
      }
      
      // Kembalikan ke fungsi asli dan footer asli
      if (footer) footer.innerHTML = originalFooterHTML;
      window.processPhoneAction = originalProcess;
    };
    
    openModal('modal-phone');
    if (modalInput) setTimeout(() => modalInput.focus(), 200);
    return; // Eksekusi dilanjutkan di dalam callback
  }
  
  if (type === 'image') {
    sendWhatsAppImageReceipt(targetPhone, txnId, total, items);
  } else {
    sendWhatsAppReceipt(targetPhone, txnId, total, items);
  }
}

// ══════════════════════════════════════════════
// REPORTS
// ══════════════════════════════════════════════
// Helper untuk mendapatkan tanggal/waktu di zona waktu Indonesia
function getIndoDate(date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta' }).format(date);
}

function getIndoDateTime(date = new Date(), options = {}) {
  const defaultOptions = {
    timeZone: 'Asia/Jakarta',
    ...options
  };
  return new Intl.DateTimeFormat('id-ID', defaultOptions).format(date);
}

function getIndoTimeString(date = new Date(), options = {}) {
  const defaultOptions = {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    ...options
  };
  return new Intl.DateTimeFormat('id-ID', defaultOptions).format(date);
}

async function renderReport(el) {
  el.innerHTML = `<div style="text-align:center; padding:40px;">Memuat data laporan...</div>`;
  
  // Ambil tanggal hari ini di zona waktu Indonesia
  const today = getIndoDate();
  
  let txns = [];
  try {
    txns = await fetchAllTransactions();
  } catch (e) {
    console.error('Report load fail', e);
  }

  let currentSortKey = 'date';
  let currentSortDirection = 'desc';
  let currentPageReport = 1;
  let itemsPerPageReport = 12;

  window.changeReportPage = (page) => {
    currentPageReport = page;
    window.applyReportFilters(false);
  };

  window.changeReportItemsPerPage = (val) => {
    itemsPerPageReport = parseInt(val) || 12;
    currentPageReport = 1;
    window.applyReportFilters(false);
  };

  window.toggleReportSort = (key) => {
    if (currentSortKey === key) {
      currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      currentSortKey = key;
      currentSortDirection = 'desc';
    }
    window.applyReportFilters(true);
  };

  const renderContent = (startDate = today, endDate = today, status = 'Semua', method = 'Semua') => {
    const filtered = txns.filter(t => {
      // Bandingkan tanggal transaksi di zona waktu Indonesia
      const tDate = getIndoDate(new Date(t.date));
      const matchesDate = (!startDate || tDate >= startDate) && (!endDate || tDate <= endDate);
      const matchesStatus = status === 'Semua' || t.payment_status === status;
      const matchesMethod = method === 'Semua' || t.payment_method === method;
      return matchesDate && matchesStatus && matchesMethod;
    });
    
    // Lakukan pengurutan (Sorting)
    filtered.sort((a, b) => {
      let valA, valB;
      if (currentSortKey === 'total') {
        valA = Number(a.total) || 0;
        valB = Number(b.total) || 0;
      } else {
        valA = new Date(a.date).getTime();
        valB = new Date(b.date).getTime();
      }

      if (currentSortDirection === 'asc') {
        return valA - valB;
      } else {
        return valB - valA;
      }
    });
    
    window.currentReportTxns = filtered; 
    const totalRev = filtered.filter(t => t.payment_status === 'Lunas').reduce((s, t) => s + (Number(t.total) || 0), 0);
    const avgTxn = filtered.length ? Math.round(totalRev / filtered.length) : 0;
    const lunasCount = filtered.filter(t => t.payment_status === 'Lunas').length;
    const methodLabel = {
      cash: 'Tunai',
      qris: 'QRIS',
      transfer: 'Transfer',
      card: 'Debit'
    };

    // Hitung pagination
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / itemsPerPageReport) || 1;
    if (currentPageReport > totalPages) currentPageReport = totalPages;
    if (currentPageReport < 1) currentPageReport = 1;

    const startIndex = (currentPageReport - 1) * itemsPerPageReport;
    const endIndex = startIndex + itemsPerPageReport;
    const paginated = filtered.slice(startIndex, endIndex);

    const rows = paginated.map(t => {
      const isLunas = t.payment_status === 'Lunas';
      const isCash = t.payment_method === 'cash';
      
      let itemsText = '';
      if (t.transaction_items && t.transaction_items.length > 0) {
        const mergedItems = t.transaction_items.reduce((acc, item) => {
          const name = item.products?.name || 'Produk';
          const existing = acc.find(i => i.name === name);
          if (existing) {
            existing.qty += item.qty;
          } else {
            acc.push({ name: name, qty: item.qty });
          }
          return acc;
        }, []);
        itemsText = mergedItems.map(item => `<span style="font-weight:600; color:var(--brown-900);">${item.name}</span> <span style="color:var(--text-muted); font-size:11px;">(x${item.qty})</span>`).join(', ');
      } else {
        itemsText = `<span style="color:#d97706; font-weight:600; display:inline-flex; align-items:center; gap:4px;"><i data-lucide="alert-triangle" style="width:14px;height:14px;color:#d97706;"></i> Struk Kosong</span>`;
      }
      
      const formattedDate = getIndoDateTime(new Date(t.date), {day:'2-digit', month:'short'});
      const formattedTime = getIndoDateTime(new Date(t.date), {hour:'2-digit', minute:'2-digit'});

      return `
        <tr>
          <td><span style="font-family:monospace; font-weight:700; font-size:12px; color:var(--brown-700);">${t.id}</span></td>
          <td>
            <div style="display:flex; flex-direction:column; gap:2px; font-size:12px; font-weight:500; line-height:1.2;">
              <span>${formattedDate}</span>
              <span style="color:var(--text-muted); font-size:10px;">${formattedTime}</span>
            </div>
          </td>
          <td style="font-size:12px; max-width:240px; white-space:normal; word-break:break-word; line-height:1.45; text-align:left;">${itemsText}</td>
          <td style="font-family:monospace; font-size:12px; font-weight:600; color:var(--text);">${t.customer_phone || '<span style="color:#cbd5e1; font-weight:400;">-</span>'}</td>
          <td><span class="badge ${t.payment_method === 'cash' ? 'badge-brown' : 'badge-blue'}">${methodLabel[t.payment_method] || String(t.payment_method || '-').toUpperCase()}</span></td>
          <td><span class="badge ${isLunas ? 'badge-green' : 'badge-red'}">${t.payment_status}</span></td>
          <td style="font-weight:700; font-size:13px; color:var(--brown-900); text-align:right;">${fmtRp(t.total)}</td>
          <td style="font-size:12px; color:var(--text-muted); text-align:right;">${(isLunas && isCash) ? fmtRp(t.cash_amount || 0) : '<span style="color:#cbd5e1;">-</span>'}</td>
          <td style="font-size:12px; color:var(--text-muted); text-align:right;">${(isLunas && isCash) ? ((t.cash_change || 0) > 0 ? fmtRp(t.cash_change) : 'Pas') : '<span style="color:#cbd5e1;">-</span>'}</td>
          <td>
            <div style="display:flex; gap:6px; justify-content:center;">
              <button class="btn-action" onclick="viewTxnDetail('${t.id}')" title="Detail"><i data-lucide="eye" style="width:14px;height:14px;"></i></button>
              <button class="btn-action" onclick="editTransaction('${t.id}')" title="Edit Transaksi"><i data-lucide="pencil" style="width:14px;height:14px;"></i></button>
              <button class="btn-action delete" onclick="deleteTransaction('${t.id}')" title="Hapus Transaksi"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button>
              ${t.customer_phone ? `<button class="btn-action send-wa" onclick="resendWhatsAppReceipt('${t.id}')" title="Kirim WA"><i data-lucide="send" style="width:14px;height:14px;"></i></button>` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');
    
    let paginationHTML = '';
    if (totalItems > 0) {
      paginationHTML = `
        <div class="report-pagination" style="display:flex; justify-content:space-between; align-items:center; margin-top:20px; padding-top:16px; border-top:1px dashed var(--border); flex-wrap:wrap; gap:12px;">
          <div style="font-size:13px; color:var(--text-muted); font-weight:500;">
            Menampilkan ${startIndex + 1} - ${Math.min(endIndex, totalItems)} dari ${totalItems} transaksi
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <button class="btn btn-outline btn-sm" onclick="changeReportPage(${currentPageReport - 1})" ${currentPageReport === 1 ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''} style="display:inline-flex; align-items:center; gap:4px; padding:6px 12px; min-height:auto; height:32px;">
              Sebelumnya
            </button>
            <span style="font-size:13px; font-weight:600; color:var(--brown-800); padding:0 8px;">
              Halaman ${currentPageReport} dari ${totalPages}
            </span>
            <button class="btn btn-outline btn-sm" onclick="changeReportPage(${currentPageReport + 1})" ${currentPageReport === totalPages ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''} style="display:inline-flex; align-items:center; gap:4px; padding:6px 12px; min-height:auto; height:32px;">
              Selanjutnya
            </button>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:12px; font-weight:600; color:var(--text-muted);">Tampilkan:</span>
            <select class="select-input" onchange="changeReportItemsPerPage(this.value)" style="padding:4px 8px; font-size:12px; border-radius:6px; height:32px;">
              <option value="12" ${itemsPerPageReport === 12 ? 'selected' : ''}>12</option>
              <option value="24" ${itemsPerPageReport === 24 ? 'selected' : ''}>24</option>
              <option value="48" ${itemsPerPageReport === 48 ? 'selected' : ''}>48</option>
              <option value="100" ${itemsPerPageReport === 100 ? 'selected' : ''}>100</option>
            </select>
          </div>
        </div>
      `;
    }

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
      
      <div class="card" style="background:#FFFFFF; padding:0; border:1px solid var(--border); border-radius:14px; box-shadow:0 4px 20px rgba(139,83,32,0.04); overflow:hidden; margin-bottom:20px;">
        <div style="overflow-x:auto; width:100%;">
          <table class="table-premium" style="width:100%; border-collapse:collapse; border:none; margin:0;">
            <thead>
              <tr>
                <th style="cursor:pointer;" onclick="toggleReportSort('id')">ID</th>
                <th style="cursor:pointer;" onclick="toggleReportSort('date')">Waktu ${currentSortKey === 'date' ? (currentSortDirection === 'asc' ? '▲' : '▼') : '↕'}</th>
                <th>Produk / Item</th>
                <th>WhatsApp</th>
                <th>Metode</th>
                <th>Status</th>
                <th style="cursor:pointer; text-align:right;" onclick="toggleReportSort('total')">Total ${currentSortKey === 'total' ? (currentSortDirection === 'asc' ? '▲' : '▼') : '↕'}</th>
                <th style="text-align:right;">Bayar</th>
                <th style="text-align:right;">Kembali</th>
                <th style="text-align:center;">Aksi</th>
              </tr>
            </thead>
            <tbody>
              ${rows || `<tr><td colspan="10" style="text-align:center; padding:40px; color:var(--text-muted); background:white;">Tidak ada transaksi pada rentang tanggal ${startDate === endDate ? startDate : (startDate + ' s/d ' + endDate)}</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>

      ${paginationHTML}
    `;
  };

  window.toggleReportSort = (key) => {
    if (currentSortKey === key) {
      currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      currentSortKey = key;
      currentSortDirection = 'desc';
    }
    window.applyReportFilters(true);
  };

  el.innerHTML = `
    <div class="filter-bar">
      <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:13px; font-weight:600; color:var(--text-muted); white-space:nowrap;">MULAI TANGGAL:</span>
          <input type="date" class="form-input" id="report-start-date" value="${today}" onchange="applyReportFilters(true)" style="padding:6px 10px; border-radius:8px; border:1px solid var(--border); font-size:13px; width:130px;">
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:13px; font-weight:600; color:var(--text-muted); white-space:nowrap;">AKHIR TANGGAL:</span>
          <input type="date" class="form-input" id="report-end-date" value="${today}" onchange="applyReportFilters(true)" style="padding:6px 10px; border-radius:8px; border:1px solid var(--border); font-size:13px; width:130px;">
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:13px; font-weight:600; color:var(--text-muted);">STATUS:</span>
          <select class="select-input" id="report-status-filter" onchange="applyReportFilters(true)" style="padding:6px 10px; font-size:13px;">
            <option value="Semua">Semua Status</option>
            <option value="Lunas">Lunas</option>
            <option value="Belum Bayar">Belum Bayar</option>
          </select>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:13px; font-weight:600; color:var(--text-muted);">METODE:</span>
          <select class="select-input" id="report-method-filter" onchange="applyReportFilters(true)" style="padding:6px 10px; font-size:13px;">
            <option value="Semua">Semua Metode</option>
            <option value="cash">Tunai</option>
            <option value="qris">QRIS</option>
            <option value="transfer">Transfer</option>
            <option value="card">Debit</option>
          </select>
        </div>
      </div>
      <button class="btn btn-brown btn-sm" style="margin-left:auto; display:inline-flex; align-items:center; gap:6px;" onclick="exportToCSV()"><i data-lucide="download" style="width:16px;height:16px;"></i> Export Excel</button>
    </div>
    <div id="report-container">${renderContent(today, today, 'Semua', 'Semua')}</div>
  `;
  
  if (typeof flatpickr !== 'undefined') {
    flatpickr('#report-start-date', {
      dateFormat: 'Y-m-d',
      defaultDate: today,
      onChange: (selectedDates, dateStr) => {
        applyReportFilters(true);
      }
    });
    flatpickr('#report-end-date', {
      dateFormat: 'Y-m-d',
      defaultDate: today,
      onChange: (selectedDates, dateStr) => {
        applyReportFilters(true);
      }
    });
  }
  
  if (typeof lucide !== 'undefined') lucide.createIcons();
  
  window.renderReportTable = (startDate = today, endDate = today, status = 'Semua', method = 'Semua') => {
    const html = renderContent(startDate, endDate, status, method);
    if (typeof lucide !== 'undefined') {
      requestAnimationFrame(() => lucide.createIcons());
    }
    return html;
  };
  
  window.applyReportFilters = (resetPage = false) => {
    if (resetPage) {
      currentPageReport = 1;
    }
    const startDate = document.getElementById('report-start-date')?.value;
    const endDate = document.getElementById('report-end-date')?.value;
    const status = document.getElementById('report-status-filter')?.value || 'Semua';
    const method = document.getElementById('report-method-filter')?.value || 'Semua';
    const container = document.getElementById('report-container');
    if (container) container.innerHTML = window.renderReportTable(startDate, endDate, status, method);
  };
}

function exportToCSV() {
  if (typeof window.currentReportTxns === 'undefined' || window.currentReportTxns.length === 0) {
    showToast('Tidak ada data untuk di-export', 'error');
    return;
  }
  
  if (typeof ExcelJS === 'undefined') {
    showToast('Library Excel belum dimuat, coba segarkan halaman!', 'error');
    return;
  }

  const txns = window.currentReportTxns;
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Laporan Penjualan');

  // Menentukan kolom dan lebar kolom default yang proporsional
  worksheet.columns = [
    { header: 'ID Transaksi', key: 'id', width: 22 },
    { header: 'Waktu', key: 'date', width: 20 },
    { header: 'Produk / Item', key: 'products', width: 45 },
    { header: 'WhatsApp', key: 'phone', width: 18 },
    { header: 'Metode', key: 'method', width: 12 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Total', key: 'total', width: 16 },
    { header: 'Bayar', key: 'cash_amount', width: 16 },
    { header: 'Kembali', key: 'cash_change', width: 16 },
    { header: 'Kasir', key: 'cashier', width: 18 }
  ];

  txns.forEach(t => {
    let productsList = '-';
    if (t.transaction_items && t.transaction_items.length > 0) {
      const merged = t.transaction_items.reduce((acc, item) => {
        const name = item.products?.name || 'Produk';
        const existing = acc.find(i => i.name === name);
        if (existing) {
          existing.qty += item.qty;
        } else {
          acc.push({ name: name, qty: item.qty });
        }
        return acc;
      }, []);
      productsList = merged.map(item => `${item.name} (x${item.qty})`).join(', ');
    }

    worksheet.addRow({
      id: t.id,
      date: getIndoDateTime(new Date(t.date)).replace(/,/g, ''),
      products: productsList,
      phone: t.customer_phone || '-',
      method: t.payment_method.toUpperCase(),
      status: t.payment_status,
      total: Number(t.total) || 0,
      cash_amount: t.payment_method === 'cash' ? (Number(t.cash_amount) || 0) : '-',
      cash_change: t.payment_method === 'cash' ? (Number(t.cash_change) || 0) : '-',
      cashier: t.cashier_name
    });
  });

  // Styling Row Header (Cokelat Tua premium, teks putih, rata tengah)
  const headerRow = worksheet.getRow(1);
  headerRow.height = 28;
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2D1A0A' } // Cokelat Tua (#2D1A0A)
    };
    cell.font = {
      name: 'Segoe UI',
      color: { argb: 'FFFFFFFF' }, // Putih
      bold: true,
      size: 11
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      bottom: { style: 'medium', color: { argb: 'FFE0CEAE' } }, // Border Krim
      top: { style: 'thin', color: { argb: 'FF2D1A0A' } },
      left: { style: 'thin', color: { argb: 'FFE0CEAE' } },
      right: { style: 'thin', color: { argb: 'FFE0CEAE' } }
    };
  });

  // Styling Row Data (Zebra striping Krim, format mata uang, border tipis)
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Lewati header

    row.height = 24;
    
    // Alternating background (Zebra striping)
    const isEven = rowNumber % 2 === 0;
    const bgColor = isEven ? 'FFFBF5E8' : 'FFFEFCF6'; // FBF5E8 (Krim-Cokelat) atau FEFCF6 (Krim Lembut)
    
    row.eachCell((cell, colNumber) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: bgColor }
      };
      cell.font = {
        name: 'Segoe UI',
        size: 10,
        color: { argb: 'FF1A0E05' } // Teks Cokelat Tua
      };
      cell.alignment = { vertical: 'middle', wrapText: true };
      
      // Border tipis
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFE0CEAE' } },
        left: { style: 'thin', color: { argb: 'FFE0CEAE' } },
        right: { style: 'thin', color: { argb: 'FFE0CEAE' } }
      };

      // Alignment kolom tertentu
      if (colNumber === 1 || colNumber === 2 || colNumber === 4 || colNumber === 5 || colNumber === 6) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }

      // Format mata uang untuk kolom Total, Bayar, Kembali (Kolom 7, 8, 9)
      if (colNumber === 7 || colNumber === 8 || colNumber === 9) {
        if (typeof cell.value === 'number') {
          cell.numFmt = '"Rp"#,##0';
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
        } else {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        }
      }
    });
  });

  // Generate file XLSX dan trigger download
  workbook.xlsx.writeBuffer().then((buffer) => {
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "Laporan_KopiSembilan_" + getIndoDate() + ".xlsx");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }).catch((e) => {
    console.error('Gagal mengekspor Excel:', e);
    showToast('Gagal mengekspor laporan!', 'error');
  });
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
  const price = parsePrice(document.getElementById('prod-price').value);
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
    
    const logDetails = editingProductId 
      ? `Update Produk: ${name}\nKategori: ${cat}\nHarga: ${fmtRp(price)}\nID: ${editingProductId}`
      : `Tambah Produk Baru: ${name}\nKategori: ${cat}\nHarga: ${fmtRp(price)}`;
    
    addActivityLog(editingProductId ? 'Edit Produk' : 'Tambah Produk', logDetails);
    await loadProducts();
    closeModal('modal-product');
  } else {
    showToast('Gagal menyimpan ke database!', 'error');
  }
}

async function deleteProduct(id) {
  const product = products.find(p => p.id === id);
  const productName = product ? product.name : 'Unknown';

  showConfirmDialog({
    title: 'Hapus Produk?',
    message: `Hapus "${productName}"? Produk ini akan dinonaktifkan dari sistem (histori transaksi tetap aman).`,
    icon: 'trash-2',
    confirmText: 'Ya, Hapus',
    cancelText: 'Batal',
    onConfirm: async () => {
      const { error } = await db.from('products').update({ active: false }).eq('id', id);
      
      if (!error) {
        showToast('Produk berhasil dihapus!', 'success');
        addActivityLog('Hapus Produk', `Produk: ${productName}\nID: ${id}\nStatus: Dinonaktifkan (Soft Delete)`);
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
    { title: 'Memulai Transaksi Baru', content: 'Klik menu <strong>Kasir / POS</strong>, lalu pilih produk. Gunakan fitur Note untuk instruksi khusus serta pilihan variasi menu.' },
    { title: 'Mengirim Struk via WhatsApp', content: 'Di modal pembayaran, masukkan nomor WhatsApp pelanggan. Klik <strong>Kirim WA</strong> untuk membuka WhatsApp dengan invoice otomatis dalam bentuk Teks maupun Gambar Struk.' },
    { title: 'Filter Rentang Tanggal Laporan', content: 'Buka menu <strong>Laporan</strong>, atur <strong>Mulai Tanggal</strong> dan <strong>Akhir Tanggal</strong> untuk melihat transaksi dalam kurun waktu tertentu (harian, mingguan, atau bulanan penuh), lalu ekspor menggunakan tombol **Export CSV**.' },
    { title: 'Mengurutkan Tabel Laporan (Sorting)', content: 'Di halaman Laporan, klik judul kolom <strong>Waktu</strong> atau <strong>Total</strong> pada tabel transaksi untuk mengurutkan data dari terbaru ↔ terlama atau nominal terbesar ↔ terkecil.' },
    { title: 'Sistem Keamanan Status Otomatis', content: 'Sistem dilengkapi pengaman otomatis (*fallback*) sehingga status pembayaran transaksi tidak akan tersimpan kosong di database meskipun terjadi gangguan cache pada browser kasir Anda.' },
    { title: 'Manajemen Pengaturan Toko', content: 'Buka <strong>Pengaturan</strong> untuk menyesuaikan nama, alamat, no telepon toko, serta format template pesan struk digital WhatsApp Anda.' }
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

  // Kelompokkan item identik untuk tampilan detail
  const groupedItems = txn.transaction_items.reduce((acc, item) => {
    const existing = acc.find(i => 
      i.product_id === item.product_id && 
      i.price === item.price && 
      (i.item_note || '') === (item.item_note || '') && 
      JSON.stringify(i.selected_variants || []) === JSON.stringify(item.selected_variants || [])
    );
    if (existing) {
      existing.qty += item.qty;
    } else {
      acc.push({ ...item });
    }
    return acc;
  }, []);

  const isBelumBayar = txn.payment_status === 'Belum Bayar';

  const detailHtml = `
    <div class="receipt" id="receipt-capture">
      <div class="receipt-header">
        <div class="receipt-logo">${storeInfo.name}</div>
        <p style="font-size:10px; color:#666; margin:0;">${storeInfo.address}</p>
        <p style="font-size:10px; color:#666; margin:0;">WA: ${storeInfo.phone}</p>
      </div>
      
      <div class="receipt-info">
        <span>Tgl: ${getIndoDateTime(new Date(txn.date), { dateStyle: 'medium' })}</span>
        <span>Jam: ${getIndoTimeString(new Date(txn.date))}</span>
      </div>
      <div class="receipt-info">
        <span>ID: ${txn.id}</span>
        <span>Kasir: ${txn.cashier_name}</span>
      </div>
      
      <hr class="receipt-divider">
      
      <div class="receipt-items">
        ${groupedItems.map(i => `
          <div class="receipt-item">
            <div class="receipt-item-name">${i.products?.name}</div>
            <div class="receipt-item-details">
              <span>${i.qty} x ${fmtRp(i.price)}</span>
              <span>${fmtRp(i.price * i.qty)}</span>
            </div>
            ${i.selected_variants && i.selected_variants.length > 0 ? `<div style="font-size:10px; color:#666; font-style:italic; margin-left:10px;">- ${i.selected_variants.map(v => v.name).join(', ')}</div>` : ''}
            ${i.item_note ? `<div style="font-size:10px; color:#888; margin-left:10px;">* ${i.item_note}</div>` : ''}
          </div>
        `).join('')}
      </div>
      
      <hr class="receipt-divider">
      
      <div class="receipt-total-row">
        <span>TOTAL</span>
        <span>${fmtRp(txn.total)}</span>
      </div>
      
      ${txn.payment_method === 'cash' && !isBelumBayar ? `
        <div style="display:flex; justify-content:space-between; font-size:12px; margin-top:4px; opacity:0.8;"><span>BAYAR (TUNAI)</span><span>${fmtRp(txn.cash_amount || 0)}</span></div>
        <div style="display:flex; justify-content:space-between; font-size:12px; margin-top:2px; opacity:0.8;"><span>KEMBALIAN</span><span>${fmtRp(Math.max(0, txn.cash_change || 0))}</span></div>
      ` : !isBelumBayar ? `<div style="font-size:12px; margin-top:4px; opacity:0.8; text-align:right;">Metode: ${String(txn.payment_method).toUpperCase()}</div>` : ''}
      
      ${isBelumBayar ? `<div class="receipt-status">BELUM LUNAS</div>` : ''}
      
      <div class="receipt-footer">
        <p style="margin:2px 0;">Terima Kasih Atas Kunjungan Anda</p>
        <p style="margin:10px 0 0; font-weight:bold; letter-spacing:1px;">KOPI SEMBILAN</p>
      </div>
    </div>
  `;
  document.getElementById('receipt-preview').innerHTML = detailHtml;
  if (typeof lucide !== 'undefined') lucide.createIcons();
  document.getElementById('modal-payment').classList.add('open');
  const modalTitle = document.querySelector('#modal-payment .modal-header h3');
  if (modalTitle) modalTitle.innerHTML = `<i data-lucide="eye" style="width:20px;height:20px;color:var(--brown-800);"></i> Detail Transaksi`;
  const payInputs = document.querySelector('#modal-payment .modal-body > div:nth-child(2)');
  if (payInputs) payInputs.style.display = 'none';
  const footer = document.querySelector('#modal-payment .modal-footer');
  if (footer) {
    const formattedItems = JSON.stringify(groupedItems.map(i => ({ name: i.products?.name, qty: i.qty, totalPrice: i.price, note: i.item_note }))).replace(/"/g, '&quot;');
    footer.innerHTML = `
      <div style="display:flex; gap:10px; width:100%; flex-wrap:wrap; justify-content:center; padding-top:10px;">
        <button class="btn btn-green" style="flex:1; font-size:13px; padding:10px 6px; display:flex; align-items:center; justify-content:center; gap:6px;" onclick="promptAndSendWA('image', '${txn.customer_phone || ''}', '${txn.id}', ${txn.total}, ${formattedItems})">
          <i data-lucide="image" style="width:16px;height:16px;"></i> WA Gambar
        </button>
        <button class="btn btn-outline" style="flex:1; font-size:13px; padding:10px 6px; display:flex; align-items:center; justify-content:center; gap:6px;" onclick="promptAndSendWA('text', '${txn.customer_phone || ''}', '${txn.id}', ${txn.total}, ${formattedItems})">
          <i data-lucide="message-square" style="width:16px;height:16px;"></i> WA Teks
        </button>
        <button class="btn btn-red" style="flex:1; font-size:13px; padding:10px 6px; display:flex; align-items:center; justify-content:center; gap:6px;" onclick="closeModal('modal-payment')">
          <i data-lucide="x" style="width:16px;height:16px;"></i> Tutup
        </button>
      </div>
    `;
  }
  
  // Render ulang ikon untuk elemen HTML yang baru saja ditambahkan di atas (khususnya header dan footer)
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function getRevenueSeries(txns, period, selectedDateStr = getIndoDate()) {
  const refDate = new Date(selectedDateStr + 'T12:00:00');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  
  const getJakartaYear = (d) => parseInt(new Intl.DateTimeFormat('id-ID', { year: 'numeric', timeZone: 'Asia/Jakarta' }).format(d));
  const getJakartaMonth = (d) => parseInt(new Intl.DateTimeFormat('id-ID', { month: 'numeric', timeZone: 'Asia/Jakarta' }).format(d)) - 1;

  if (period === 'daily') {
    const labels = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00'];
    const values = labels.map(() => 0);
    txns.forEach(t => {
      const d = new Date(t.date);
      if (getIndoDate(d) === selectedDateStr) {
        // Ambil jam dalam zona waktu Jakarta
        const hour = parseInt(new Intl.DateTimeFormat('id-ID', { hour: 'numeric', hour12: false, timeZone: 'Asia/Jakarta' }).format(d));
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
    return { labels, values, title: `Pendapatan Tanggal ${selectedDateStr}` };
  }

  if (period === 'yearly') {
    const startYear = getJakartaYear(refDate) - 4;
    const labels = Array.from({ length: 5 }, (_, i) => String(startYear + i));
    const values = labels.map(() => 0);
    txns.forEach(t => {
      const d = new Date(t.date);
      const idx = getJakartaYear(d) - startYear;
      if (idx >= 0 && idx < values.length) values[idx] += Number(t.total) || 0;
    });
    return { labels, values, title: 'Pendapatan Tahunan' };
  }

  if (period === 'monthly') {
    const labels = monthNames;
    const values = labels.map(() => 0);
    txns.forEach(t => {
      const d = new Date(t.date);
      if (getJakartaYear(d) === getJakartaYear(refDate)) values[getJakartaMonth(d)] += Number(t.total) || 0;
    });
    return { labels, values, title: `Pendapatan Bulanan (${getJakartaYear(refDate)})` };
  }

  const labels = [];
  const keys = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(refDate);
    d.setDate(refDate.getDate() - i);
    labels.push(getIndoDateTime(d, { weekday: 'short' }));
    keys.push(getIndoDate(d));
  }
  const values = labels.map(() => 0);
  txns.forEach(t => {
    const key = getIndoDate(new Date(t.date));
    const idx = keys.indexOf(key);
    if (idx >= 0) values[idx] += Number(t.total) || 0;
  });
  return { labels, values, title: `Pendapatan Mingguan (s/d ${selectedDateStr})` };
}

function renderDashboardRevenueChart(period = 'weekly') {
  const ctx = document.getElementById('revenueChart');
  if (!ctx || typeof Chart === 'undefined') return;

  const dateInput = document.getElementById('dashboard-date-filter');
  const selectedDateStr = dateInput ? dateInput.value : getIndoDate();

  const series = getRevenueSeries(window.dashboardTxns || [], period, selectedDateStr);
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
  const today = getIndoDate();
  el.innerHTML = `
    <div class="dashboard-hero">
      <div style="display:flex; justify-content:space-between; align-items:flex-end; flex-wrap:wrap; gap:16px;">
        <div>
          <h2>Halo, ${currentUser ? currentUser.name : 'User'}!</h2>
          <p>Berikut adalah ringkasan performa Toko Kopi Sembilan.</p>
        </div>
        <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
          <button class="btn btn-outline" id="btn-privacy-global-toggle" onclick="toggleAllDashboardPrivacy()" title="Sensor/Tampilkan Semua Kotak" style="height:36px; display:inline-flex; align-items:center; justify-content:center; padding:0 12px; border-radius:12px; font-size:13px; font-weight:600; gap:8px;">
            <i data-lucide="eye" id="icon-privacy-global" style="width:16px;height:16px;"></i>
            <span>Mode Privasi</span>
          </button>
          <div style="display:flex; align-items:center; gap:8px; background:white; padding:6px 12px; border-radius:12px; border:1px solid var(--border); box-shadow: 0 2px 4px rgba(0,0,0,0.03);">
            <span style="font-size:12px; font-weight:700; color:var(--text-muted);">TANGGAL:</span>
            <input type="date" class="form-input" id="dashboard-date-filter" value="${today}" onchange="renderDashboardContent()" style="border:none; padding:0; font-size:13px; width:auto; background:transparent; font-weight:600; color:var(--brown-800); cursor:pointer;">
          </div>
          <div class="period-tabs" style="background:var(--brown-50); padding:4px; border-radius:12px; border:1px solid var(--brown-100);">
            <button class="period-tab ${activeDashboardPeriod === 'daily' ? 'active' : ''}" onclick="changeDashboardPeriod('daily')">Harian</button>
            <button class="period-tab ${activeDashboardPeriod === 'weekly' ? 'active' : ''}" onclick="changeDashboardPeriod('weekly')">Mingguan</button>
            <button class="period-tab ${activeDashboardPeriod === 'monthly' ? 'active' : ''}" onclick="changeDashboardPeriod('monthly')">Bulanan</button>
            <button class="period-tab ${activeDashboardPeriod === 'yearly' ? 'active' : ''}" onclick="changeDashboardPeriod('yearly')">Tahunan</button>
          </div>
        </div>
      </div>
    </div>
    <div id="dashboard-content-area">
      <div style="text-align:center; padding:40px; color:var(--text-muted);">Memuat data dashboard...</div>
    </div>
  `;
  
  if (typeof flatpickr !== 'undefined') {
    flatpickr('#dashboard-date-filter', {
      dateFormat: 'Y-m-d',
      defaultDate: today,
      onChange: (selectedDates, dateStr) => {
        renderDashboardContent();
      }
    });
  }
  
  let txns = [];
  try {
    txns = await fetchAllTransactions();
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
  const dateInput = document.getElementById('dashboard-date-filter');
  const selectedDateStr = dateInput ? dateInput.value : getIndoDate();
  
  // Buat objek Date referensi dari tanggal yang dipilih (tengah hari agar aman dari DST/offset)
  const refDate = new Date(selectedDateStr + 'T12:00:00');
  
  const filteredTxns = txns.filter(t => {
    const d = new Date(t.date);
    const dIndo = getIndoDate(d);
    
    if (activeDashboardPeriod === 'daily') {
      return dIndo === selectedDateStr;
    } else if (activeDashboardPeriod === 'weekly') {
      const weekAgo = new Date(refDate);
      weekAgo.setDate(refDate.getDate() - 7);
      const weekAgoStr = getIndoDate(weekAgo);
      return dIndo >= weekAgoStr && dIndo <= selectedDateStr;
    } else if (activeDashboardPeriod === 'monthly') {
      const dMonth = new Intl.DateTimeFormat('id-ID', { month: 'numeric', timeZone: 'Asia/Jakarta' }).format(d);
      const dYear = new Intl.DateTimeFormat('id-ID', { year: 'numeric', timeZone: 'Asia/Jakarta' }).format(d);
      const refMonth = new Intl.DateTimeFormat('id-ID', { month: 'numeric', timeZone: 'Asia/Jakarta' }).format(refDate);
      const refYear = new Intl.DateTimeFormat('id-ID', { year: 'numeric', timeZone: 'Asia/Jakarta' }).format(refDate);
      return dMonth === refMonth && dYear === refYear;
    } else if (activeDashboardPeriod === 'yearly') {
      const dYear = new Intl.DateTimeFormat('id-ID', { year: 'numeric', timeZone: 'Asia/Jakarta' }).format(d);
      const refYear = new Intl.DateTimeFormat('id-ID', { year: 'numeric', timeZone: 'Asia/Jakarta' }).format(refDate);
      return dYear === refYear;
    }
    return true;
  });

  const totalRev = filteredTxns
    .filter(t => t.payment_status === 'Lunas')
    .reduce((s, t) => s + (Number(t.total) || 0), 0);
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
  if (!topHtml) topHtml = '<div class="empty-state" style="margin:auto; display:flex; align-items:center; justify-content:center; flex:1;">Belum ada data penjualan periode ini.</div>';

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
        <div class="item-meta">${getIndoTimeString(new Date(t.date))} - ${t.payment_method.toUpperCase()}</div>
      </div>
      <div class="recent-transaction-total">
        <div>${fmtRp(t.total)}</div>
        <span class="badge ${t.payment_status === 'Lunas' ? 'badge-green' : 'badge-red'}">${t.payment_status}</span>
      </div>
    </div>
  `).join('');
  if (!recentHtml) recentHtml = '<div class="empty-state" style="margin:auto; display:flex; align-items:center; justify-content:center; flex:1;">Belum ada transaksi periode ini.</div>';

  area.innerHTML = `
    <div class="stats-grid dashboard-stats">
      <div class="stat-card">
        <button class="btn-privacy-toggle" onclick="toggleDashboardPrivacy('revenue')" title="Sembunyikan/Tampilkan Pendapatan">
          <i data-lucide="${dashboardPrivacy.revenue ? 'eye-off' : 'eye'}" style="width:16px;height:16px;"></i>
        </button>
        <div class="label">Total Pendapatan</div>
        <div class="value">${dashboardPrivacy.revenue ? 'Rp ••••••' : fmtRp(totalRev)}</div>
        <div class="change up"><i data-lucide="trending-up" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Periode terpilih</div>
      </div>
      <div class="stat-card">
        <button class="btn-privacy-toggle" onclick="toggleDashboardPrivacy('transactions')" title="Sembunyikan/Tampilkan Transaksi">
          <i data-lucide="${dashboardPrivacy.transactions ? 'eye-off' : 'eye'}" style="width:16px;height:16px;"></i>
        </button>
        <div class="label">Total Transaksi</div>
        <div class="value">${dashboardPrivacy.transactions ? '•••' : totalCount}</div>
        <div class="change up"><i data-lucide="activity" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Transaksi periode ini</div>
      </div>
      <div class="stat-card">
        <button class="btn-privacy-toggle" onclick="toggleDashboardPrivacy('products')" title="Sembunyikan/Tampilkan Produk Terjual">
          <i data-lucide="${dashboardPrivacy.products ? 'eye-off' : 'eye'}" style="width:16px;height:16px;"></i>
        </button>
        <div class="label">Produk Terjual</div>
        <div class="value">${dashboardPrivacy.products ? '•••' : Object.values(itemCounts).reduce((a,b)=>a+b, 0)}</div>
        <div class="change up"><i data-lucide="coffee" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Porsi disajikan</div>
      </div>
    </div>

    <div class="dashboard-grid dashboard-grid-primary">
      <div class="card" style="position:relative; display:flex; flex-direction:column;">
        <div class="card-header dashboard-card-header" style="display:flex; justify-content:space-between; align-items:center; width:100%;">
          <h3 id="revenue-chart-title" style="margin:0; display:flex; align-items:center; gap:8px;">
            <i data-lucide="bar-chart-2" style="width:18px;height:18px;color:var(--accent);"></i> Grafik Pendapatan
          </h3>
          <button class="btn-privacy-toggle" style="position:static; padding:4px;" onclick="toggleDashboardPrivacy('chart')" title="Sembunyikan/Tampilkan Grafik">
            <i data-lucide="${dashboardPrivacy.chart ? 'eye-off' : 'eye'}" style="width:16px;height:16px;"></i>
          </button>
        </div>
        <div class="card-body dashboard-chart-body" style="position:relative; flex:1;">
          ${dashboardPrivacy.chart ? `
            <div class="privacy-overlay">
              <i data-lucide="eye-off" style="width:32px;height:32px;color:var(--text-muted);"></i>
            </div>
          ` : ''}
          <canvas id="revenueChart"></canvas>
        </div>
      </div>
      <div class="card" style="position:relative; display:flex; flex-direction:column;">
        <div class="card-header dashboard-card-header" style="display:flex; justify-content:space-between; align-items:center; width:100%;">
          <h3 style="margin:0; display:flex; align-items:center; gap:8px;">
            <i data-lucide="award" style="width:18px;height:18px;color:var(--accent);"></i> Menu Paling Laris
          </h3>
          <button class="btn-privacy-toggle" style="position:static; padding:4px;" onclick="toggleDashboardPrivacy('top_menu')" title="Sembunyikan/Tampilkan Menu Terlaris">
            <i data-lucide="${dashboardPrivacy.top_menu ? 'eye-off' : 'eye'}" style="width:16px;height:16px;"></i>
          </button>
        </div>
        <div class="card-body dashboard-list" style="position:relative; flex:1; display:flex; flex-direction:column; min-height:280px; box-sizing:border-box;">
          ${dashboardPrivacy.top_menu ? `
            <div class="privacy-overlay">
              <i data-lucide="eye-off" style="width:32px;height:32px;color:var(--text-muted);"></i>
            </div>
          ` : ''}
          ${topHtml}
        </div>
      </div>
    </div>

    <div class="dashboard-grid dashboard-grid-secondary">
      <div class="card" style="position:relative; display:flex; flex-direction:column;">
        <div class="card-header dashboard-card-header" style="display:flex; justify-content:space-between; align-items:center; width:100%;">
          <h3 style="margin:0; display:flex; align-items:center; gap:8px;">
            <i data-lucide="pie-chart" style="width:18px;height:18px;color:var(--accent);"></i> Ringkasan Pembayaran
          </h3>
          <button class="btn-privacy-toggle" style="position:static; padding:4px;" onclick="toggleDashboardPrivacy('payment')" title="Sembunyikan/Tampilkan Ringkasan Pembayaran">
            <i data-lucide="${dashboardPrivacy.payment ? 'eye-off' : 'eye'}" style="width:16px;height:16px;"></i>
          </button>
        </div>
        <div class="card-body payment-summary" style="position:relative; flex:1; display:flex; flex-direction:column; justify-content:space-between; min-height:230px; padding:20px 20px 24px; box-sizing:border-box;">
          ${dashboardPrivacy.payment ? `
            <div class="privacy-overlay">
              <i data-lucide="eye-off" style="width:32px;height:32px;color:var(--text-muted);"></i>
            </div>
          ` : ''}
          ${payHtml}
        </div>
      </div>
      <div class="card" style="position:relative; display:flex; flex-direction:column;">
        <div class="card-header dashboard-card-header" style="display:flex; justify-content:space-between; align-items:center; width:100%;">
          <h3 style="margin:0; display:flex; align-items:center; gap:8px;">
            <i data-lucide="clock" style="width:18px;height:18px;color:var(--accent);"></i> Transaksi Terakhir
          </h3>
          <button class="btn-privacy-toggle" style="position:static; padding:4px;" onclick="toggleDashboardPrivacy('recent')" title="Sembunyikan/Tampilkan Transaksi Terakhir">
            <i data-lucide="${dashboardPrivacy.recent ? 'eye-off' : 'eye'}" style="width:16px;height:16px;"></i>
          </button>
        </div>
        <div class="card-body dashboard-list" style="position:relative; flex:1; display:flex; flex-direction:column; min-height:230px; box-sizing:border-box;">
          ${dashboardPrivacy.recent ? `
            <div class="privacy-overlay">
              <i data-lucide="eye-off" style="width:32px;height:32px;color:var(--text-muted);"></i>
            </div>
          ` : ''}
          ${recentHtml}
        </div>
      </div>
    </div>
  `;
  
  if (typeof lucide !== 'undefined') lucide.createIcons();
  updateGlobalPrivacyButton();
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
    const dateStr = now.toLocaleDateString('id-ID', { 
      weekday: 'short', 
      day: '2-digit', 
      month: 'short',
      timeZone: 'Asia/Jakarta'
    });
    const timeStr = now.toLocaleTimeString('id-ID', { 
      hour: '2-digit', 
      minute: '2-digit',
      timeZone: 'Asia/Jakarta'
    });
    el.textContent = `${dateStr} ${timeStr}`;
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
  
  // Tampilkan Pop-Up Changelog Pembaruan v1.3 sekali saja
  const APP_VERSION = '1.3';
  const lastSeenVersion = localStorage.getItem('ks_seen_version');
  if (lastSeenVersion !== APP_VERSION) {
    setTimeout(() => {
      openModal('modal-changelog');
      localStorage.setItem('ks_seen_version', APP_VERSION);
    }, 800);
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

function toggleEditCashInput() {
  const status = document.getElementById('edit-txn-status').value;
  const method = document.getElementById('edit-txn-method').value;
  const wrap = document.getElementById('edit-cash-input-wrap');
  
  if (status === 'Lunas' && method === 'cash') {
    wrap.style.display = 'block';
    calcEditChange();
  } else {
    wrap.style.display = 'none';
    const display = document.getElementById('edit-change-display');
    if (display) display.style.display = 'none';
  }
}

function calcEditChange() {
  const status = document.getElementById('edit-txn-status').value;
  const method = document.getElementById('edit-txn-method').value;
  if (status !== 'Lunas' || method !== 'cash') return;

  const newTotal = currentEditingTxnItems.reduce((sum, item) => {
    return sum + (item.removed ? 0 : item.price * item.qty);
  }, 0);
  
  const paid = parsePrice(document.getElementById('edit-txn-cash-input').value);
  const changeEl = document.getElementById('edit-change-display');
  const changeAmtEl = document.getElementById('edit-txn-change-amount');
  
  if (paid >= newTotal) {
    if (changeEl) changeEl.style.display = 'block';
    if (changeAmtEl) changeAmtEl.textContent = fmtRp(paid - newTotal);
  } else {
    if (changeEl) changeEl.style.display = 'none';
  }
}

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
    
    const cashInput = document.getElementById('edit-txn-cash-input');
    if (cashInput) cashInput.value = txn.cash_amount || '';

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
    toggleEditCashInput(); // Panggil ini untuk set visibilitas input tunai
    openModal('modal-edit-txn');
  } catch (e) { showToast('Terjadi kesalahan!', 'error'); }
}

function renderEditTxnItems() {
  const container = document.getElementById('edit-txn-items-list');
  const totalDisplay = document.getElementById('edit-txn-total-display');
  if (!container) return;

  const visibleItems = currentEditingTxnItems.filter(i => !i.removed);
  const newTotal = currentEditingTxnItems.reduce((sum, item) => {
    return sum + (item.removed ? 0 : item.price * item.qty);
  }, 0);

  if (totalDisplay) totalDisplay.textContent = fmtRp(newTotal);
  
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
  calcEditChange(); // Update kembalian saat item berubah
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
  const phone = document.getElementById('edit-txn-phone').value.replace(/\D/g, '');
  const method = document.getElementById('edit-txn-method').value;
  const status = document.getElementById('edit-txn-status').value;
  const notes = document.getElementById('edit-txn-notes').value.trim();
  const cashAmount = parsePrice(document.getElementById('edit-txn-cash-input').value);

  try {
    // 1. Hitung total baru berdasarkan item yang diedit
    const newTotal = currentEditingTxnItems.reduce((sum, item) => {
      return sum + (item.removed ? 0 : item.price * item.qty);
    }, 0);

    // 2. Hitung ulang kembalian jika metode pembayaran tunai
    let cashChange = 0;
    if (method === 'cash' && status === 'Lunas') {
      const numCashAmount = Number(cashAmount) || 0;
      const numNewTotal = Number(newTotal) || 0;
      
      if (numCashAmount < numNewTotal) {
        showToast('Jumlah bayar kurang!', 'error');
        return;
      }
      cashChange = numCashAmount - numNewTotal;
    }

    // 3. Update transaksi utama
    const updateData = {
      customer_phone: phone,
      payment_method: method,
      payment_status: status,
      notes: notes,
      total: newTotal,
      cash_amount: method === 'cash' ? cashAmount : 0,
      cash_change: cashChange
    };
    
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
    
    // Log detail edit transaksi termasuk catatan per item
    const itemsSummary = currentEditingTxnItems
      .filter(i => !i.removed)
      .map(i => {
        let itemLine = `- ${i.name} x${i.qty}`;
        if (i.item_note) itemLine += ` [Note: ${i.item_note}]`;
        return itemLine;
      }).join('\n');
    const logDetails = `ID: ${id}\nTotal Baru: ${fmtRp(newTotal)}\nStatus: ${status}\nMetode: ${method}\nCatatan Transaksi Baru: ${notes || '-'}\nItem Aktif:\n${itemsSummary}`;
    
    addActivityLog('Edit Transaksi & Pesanan', logDetails);
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

  // Format item agar sesuai dengan yang diharapkan sendWhatsAppReceipt
  const formattedItems = txn.transaction_items.map(i => ({
    name: i.products?.name || 'Produk',
    qty: i.qty,
    totalPrice: i.price,
    note: i.item_note
  }));

  promptAndSendWA('text', txn.customer_phone || '', txn.id, txn.total, formattedItems);
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
  
  const today = getIndoDate();
  
  const loadData = async (dateFilter = today) => {
    let logs = [];
    try {
      // Filter berdasarkan range waktu 00:00:00 sampai 23:59:59 (WIB)
      const start = `${dateFilter}T00:00:00+07:00`;
      const end = `${dateFilter}T23:59:59+07:00`;
      
      const { data, error } = await db
        .from('activity_logs')
        .select('*')
        .gte('created_at', start)
        .lte('created_at', end)
        .order('created_at', { ascending: false });
        
      if (!error && data) logs = data;
    } catch(e) { console.error('Load logs fail', e); }
    
    window.activityLogs = logs;
    return logs;
  };

  const renderTable = (logs) => {
    const rows = logs.map(l => `
      <tr>
        <td><div style="font-size:12px; color:var(--text-muted);">${getIndoDateTime(new Date(l.created_at), {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'})}</div></td>
        <td><strong>${l.user_name}</strong> <span class="badge ${l.user_role === 'admin' ? 'badge-amber' : 'badge-blue'}" style="font-size:9px; padding:1px 6px;">${l.user_role.toUpperCase()}</span></td>
        <td><span style="font-weight:600; color:var(--brown-800);">${l.action}</span></td>
        <td><div style="font-size:11px; max-width:250px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${l.details || '-'}</div></td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="viewLogDetail(${l.id})" title="Lihat Detail">
            <i data-lucide="eye" style="width:14px;height:14px;"></i>
          </button>
        </td>
      </tr>
    `).join('');
    
    return rows || `<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--text-muted);">Tidak ada aktivitas pada tanggal ${document.getElementById('log-date-filter')?.value || today}</td></tr>`;
  };

  el.innerHTML = `
    <div class="inv-actions">
      <div style="flex:1;">
        <h3 style="font-family:'DM Serif Display'; font-size:20px; color:var(--brown-800);">Riwayat Aktivitas</h3>
        <p style="font-size:12px; color:var(--text-muted);">Memantau tindakan yang dilakukan di sistem.</p>
      </div>
      <div style="display:flex; align-items:center; gap:8px; background:white; padding:6px 12px; border-radius:12px; border:1px solid var(--border); margin-right:12px;">
        <span style="font-size:12px; font-weight:700; color:var(--text-muted);">TANGGAL:</span>
        <input type="date" class="form-input" id="log-date-filter" value="${today}" style="border:none; padding:0; font-size:13px; width:auto; background:transparent; font-weight:600; color:var(--brown-800); cursor:pointer;">
      </div>
      <button class="btn btn-outline btn-sm" onclick="showPage('logs')"><i data-lucide="refresh-cw" style="width:14px;height:14px;"></i> Refresh</button>
    </div>
    <div class="card">
      <div style="overflow-x:auto;">
        <table class="table">
          <thead><tr><th>Waktu</th><th>Pengguna</th><th>Aksi</th><th>Detail Singkat</th><th>Aksi</th></tr></thead>
          <tbody id="log-table-body"></tbody>
        </table>
      </div>
    </div>
  `;

  const tbody = document.getElementById('log-table-body');
  
  // Inisialisasi Flatpickr
  if (typeof flatpickr !== 'undefined') {
    flatpickr('#log-date-filter', {
      dateFormat: 'Y-m-d',
      defaultDate: today,
      onChange: async (selectedDates, dateStr) => {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:30px;">Memuat data...</td></tr>';
        const logs = await loadData(dateStr);
        tbody.innerHTML = renderTable(logs);
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }
    });
  }

  // Load data awal
  const logs = await loadData(today);
  tbody.innerHTML = renderTable(logs);
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

/**
 * Menampilkan detail lengkap dari satu entri log aktivitas
 */
function viewLogDetail(id) {
  const log = (window.activityLogs || []).find(l => l.id === id);
  if (!log) return;
  
  const detailHtml = `
    <div style="font-family:'DM Sans', sans-serif; font-size:13px; line-height:1.6; color:var(--text);">
      <div style="background:var(--brown-50); padding:15px; border-radius:12px; border:1px solid var(--brown-100); margin-bottom:15px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
          <span style="color:var(--text-muted); font-weight:600;">WAKTU</span>
          <span style="font-weight:600;">${getIndoDateTime(new Date(log.created_at), {day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit'})}</span>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
          <span style="color:var(--text-muted); font-weight:600;">PENGGUNA</span>
          <span style="font-weight:600;">${log.user_name} (${log.user_role.toUpperCase()})</span>
        </div>
        <div style="display:flex; justify-content:space-between;">
          <span style="color:var(--text-muted); font-weight:600;">JENIS AKSI</span>
          <span style="badge badge-brown" style="padding:2px 8px; border-radius:4px;">${log.action}</span>
        </div>
      </div>
      
      <div style="margin-top:20px;">
        <h4 style="font-size:12px; color:var(--text-muted); font-weight:700; text-transform:uppercase; margin-bottom:8px; display:flex; align-items:center; gap:6px;">
          <i data-lucide="info" style="width:14px;height:14px;"></i> Detail Informasi Lengkap
        </h4>
        <div style="background:white; padding:15px; border-radius:12px; border:1px solid var(--border); min-height:80px; word-break:break-word; white-space:pre-wrap; font-family:monospace; font-size:12px; color:var(--brown-900);">
          ${log.details || 'Tidak ada detail tambahan yang tercatat.'}
        </div>
      </div>
    </div>
  `;
  
  const preview = document.getElementById('receipt-preview');
  if (preview) preview.innerHTML = detailHtml;
  
  const modal = document.getElementById('modal-payment');
  if (modal) {
    modal.classList.add('open');
    const title = modal.querySelector('.modal-header h3');
    if (title) title.innerHTML = `<i data-lucide="activity" style="width:20px;height:20px;color:var(--brown-800);"></i> Detail Aktivitas`;
    
    // Sembunyikan input pembayaran
    const payInputs = modal.querySelector('.modal-body > div:nth-child(2)');
    if (payInputs) payInputs.style.display = 'none';
    
    const footer = modal.querySelector('.modal-footer');
    if (footer) {
      footer.innerHTML = `<button class="btn btn-brown w-full" onclick="closeModal('modal-payment')">Tutup Detail</button>`;
    }
  }
  
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

