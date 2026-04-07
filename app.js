
// ============================================================
//  app.js.html — Core App Logic (Employee Storefront)
// ============================================================

var currentUser = null;
var allProducts = [];
var allCategories = [];
var currentCategory = 'all';
var currentView = 'store';  // store | orders | substock

// ─── INIT ─────────────────────────────────────────────────

window.onload = function() {
  initDarkMode();
  checkAuth();
  initCartSwipe(); // attach swipe after DOM is ready
};

function initDarkMode() {
  var isDark = localStorage.getItem('darkMode') === 'true';
  if (isDark) {
    document.body.classList.add('dark-mode');
    updateDarkModeUI(true);
  }
  refreshIcons();
}

function toggleDarkMode() {
  var isDark = document.body.classList.toggle('dark-mode');
  localStorage.setItem('darkMode', isDark);
  updateDarkModeUI(isDark);
  refreshIcons();
}

function updateDarkModeUI(isDark) {
  var icon = document.getElementById('darkModeIcon');
  if (icon) icon.innerHTML = isDark ? '<i data-lucide="sun"></i>' : '<i data-lucide="moon"></i>';
}

function checkAuth() {
  var stored = localStorage.getItem('_user');
  if (stored) {
    try { currentUser = JSON.parse(stored); } catch(e) {}
  }
  updateUserUI();
  
  // รอจนกว่า API object จะสมบูรณ์ (กรณีโหลดแบบ async) มีการ timeout หลัง 10 วินาที
  if (typeof API !== 'undefined' && API.getProducts) {
    loadStorefrontData();
  } else {
    var checkCount = 0;
    var checkTimer = setInterval(function() {
      checkCount++;
      if (typeof API !== 'undefined' && API.getProducts) {
        clearInterval(checkTimer);
        loadStorefrontData();
      } else if (checkCount > 100) { // timeout after 10s (100 x 100ms)
        clearInterval(checkTimer);
        showToast('โหลดข้อมูลไม่สำเร็จ กรุณารีเฟรช', 'error');
      }
    }, 100);
  }
  
  if (typeof Cart !== 'undefined') {
    Cart.renderBadge();
    Cart.render();
  }
  
  // เริ่ม Onboarding สำหรับผู้ใช้ใหม่
  setTimeout(function() {
    if (!localStorage.getItem('_onboarded')) {
      if (typeof Onboarding !== 'undefined') Onboarding.start();
    }
  }, 1500);
};

function updateUserUI() {
  var nameEl = document.getElementById('navUserName');
  var loginBtn = document.getElementById('loginBtn');
  var logoutBtn = document.getElementById('logoutBtn');
  var ordersBtn = document.getElementById('ordersBtn');

  if (currentUser) {
    if (nameEl) nameEl.textContent = currentUser.name;
    if (loginBtn) loginBtn.classList.add('hidden');
    if (logoutBtn) logoutBtn.classList.remove('hidden');
    if (ordersBtn) ordersBtn.classList.remove('hidden');
    
    // แสดงปุ่มคลังย่อยสำหรับ FC/Technician/Admin
    var substockBtn = document.getElementById('substockBtn');
    if (substockBtn) {
      var allowed = ['fc', 'technician', 'hr'];
      if (allowed.indexOf(currentUser.role) !== -1) substockBtn.classList.remove('hidden');
      else substockBtn.classList.add('hidden');
    }

    // ปุ่ม Admin
    var adminBtn = document.getElementById('adminPaneBtn');
    if (adminBtn) {
      if (['superadmin', 'admin'].indexOf(currentUser.role) !== -1) adminBtn.classList.remove('hidden');
      else adminBtn.classList.add('hidden');
    }

    // ปุ่ม Manager
    var mgrBtn = document.getElementById('mgrPaneBtn');
    var mgrMob = document.getElementById('mgrMobileBtn');
    if (mgrBtn || mgrMob) {
      if (['superadmin', 'admin', 'manager'].indexOf(currentUser.role) !== -1) {
        if (mgrBtn) mgrBtn.classList.remove('hidden');
        if (mgrMob) mgrMob.classList.remove('hidden');
      } else {
        if (mgrBtn) mgrBtn.classList.add('hidden');
        if (mgrMob) mgrMob.classList.add('hidden');
      }
    }

    // ปุ่ม Admin Mobile
    var adMob = document.getElementById('adminMobileBtn');
    if (adMob) {
      if (['superadmin', 'admin'].indexOf(currentUser.role) !== -1) adMob.classList.remove('hidden');
      else adMob.classList.add('hidden');
    }
  } else {
    if (nameEl) nameEl.textContent = 'เข้าสู่ระบบ';
    if (loginBtn) loginBtn.classList.remove('hidden');
    if (logoutBtn) logoutBtn.classList.add('hidden');
    if (ordersBtn) ordersBtn.classList.add('hidden');
    var substockBtn = document.getElementById('substockBtn');
    if (substockBtn) substockBtn.classList.add('hidden');
  }
  refreshIcons();
}

function logout() {
  localStorage.removeItem('_user');
  localStorage.removeItem('_tok');
  currentUser = null;
  updateUserUI();
  showToast('ออกจากระบบแล้ว', 'success');
  switchView('store');
}

// ─── ONBOARDING ───────────────────────────────────────────
var Onboarding = {
  steps: [
    { target: '.logo', title: '👋 ยินดีต้อนรับ!', body: 'นี่คือระบบภาระงานเบิกพัสดุรูปแบบใหม่ ใช้งานง่ายเหมือนหน้าเว็บ E-Commerce ชั้นนำ' },
    { target: '#loginBtn', title: '🔑 เข้าสู่ระบบ', body: 'เริ่มการใช้งานด้วยการลงชื่อเข้าใช้ด้วยรหัสพนักงานของคุณ' },
    { target: '.search-box', title: '🔍 ค้นหาสินค้า', body: 'ค้นหาสินค้าที่คุณต้องการเบิกได้ทันทีจากช่องค้นหานี้' },
    { target: 'button[onclick*="toggleDrawer"]', title: '🛒 ตะกร้าสินค้า', body: 'เมื่อเลือกสินค้าแล้ว รายการจะมาอยู่ในตะกร้านี้เพื่อรอการยืนยัน' }
  ],
  currentStep: 0,
  
  start: function() {
    this.currentStep = 0;
    this.showStep();
  },
  
  showStep: function() {
    var step = this.steps[this.currentStep];
    var targetEl = document.querySelector(step.target);
    if (!targetEl) { this.next(); return; }
    
    this.cleanup();
    
    var overlay = document.createElement('div');
    overlay.className = 'onboarding-overlay active';
    overlay.id = 'onboard-overlay';
    document.body.appendChild(overlay);
    
    var tooltip = document.createElement('div');
    tooltip.className = 'onboarding-tooltip';
    tooltip.innerHTML = '<div class="onboarding-header">' + step.title + '</div>'
      + '<div class="onboarding-body">' + step.body + '</div>'
      + '<div class="flex justify-between">'
      +   '<button class="btn btn-ghost btn-sm" onclick="Onboarding.skip()">ข้าม</button>'
      +   '<button class="btn btn-primary btn-sm" onclick="Onboarding.next()">' + (this.currentStep === this.steps.length - 1 ? 'เสร็จสิ้น' : 'ถัดไป') + '</button>'
      + '</div>';
    
    var rect = targetEl.getBoundingClientRect();
    tooltip.style.top = (rect.bottom + 15) + 'px';
    tooltip.style.left = Math.max(10, Math.min(window.innerWidth - 300, rect.left)) + 'px';
    
    document.body.appendChild(tooltip);
    targetEl.classList.add('onboarding-highlight');
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  },
  
  next: function() {
    this.currentStep++;
    if (this.currentStep >= this.steps.length) {
      this.skip();
    } else {
      this.showStep();
    }
  },
  
  skip: function() {
    this.cleanup();
    localStorage.setItem('_onboarded', 'true');
  },
  
  cleanup: function() {
    var old = document.querySelectorAll('.onboarding-overlay, .onboarding-tooltip');
    old.forEach(function(el) { el.remove(); });
    document.querySelectorAll('.onboarding-highlight').forEach(function(el) { el.classList.remove('onboarding-highlight'); });
  }
};

// ─── DATA LOADING ─────────────────────────────────────────

function loadStorefrontData() {
  var grid = document.getElementById('productGrid');
  if (grid && (!allProducts || allProducts.length === 0)) {
    grid.innerHTML = Array(8).fill('<div class="skeleton-card skeleton" style="border-radius:var(--radius);height:300px"></div>').join('');
  }
  
  API.getStorefrontData().then(function(res) {
    if (res.success) {
      allProducts = res.products || [];
      allCategories = res.categories || [];
      renderCategories();
      renderProductGrid();
    }
  }).catch(function(err) {
    showToast('โหลดข้อมูลไม่สำเร็จ: ' + err, 'error');
  });
}

function handleSearchInput(val) {
  var dropdown = document.getElementById('searchSuggestions');
  if (!dropdown) return;
  
  // Close if we lose focus on a container basis (handled by click listener)
  // Show nothing if empty
  var q = (val || '').toLowerCase().trim();
  if (!q) {
    dropdown.classList.remove('active');
    return;
  }
  
  // Show 8 products: matches if typing
  var matches = allProducts.filter(function(p) {
    var searchStr = ((p.name || '') + ' ' + (p.productId || '')).toLowerCase();
    return searchStr.indexOf(q) !== -1;
  }).slice(0, 8);
  
  if (matches.length === 0) {
    dropdown.classList.remove('active');
    return;
  }
  
  var headerText = q ? 'ผลการค้นหา' : 'สินค้าแนะนำ';
  var headerIcon = q ? 'search' : 'star';
  var headerHtml = '<div class="suggestion-header"><i data-lucide="' + headerIcon + '"></i><span>' + headerText + '</span></div>';
  
  dropdown.innerHTML = headerHtml + matches.map(function(p) {
    var name = (p.name || '').toString();
    var productId = (p.productId || '').toString();
    
    var displayName = name;
    var displayId = productId;
    
    if (q) {
      try {
        var regex = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
        displayName = name.replace(regex, '<span style="color:var(--primary); font-weight:800">$1</span>');
        displayId = productId.replace(regex, '<span style="color:var(--primary); font-weight:800">$1</span>');
      } catch(e) {}
    }
    
    var escapedName = name.replace(/'/g, "\\'").replace(/"/g, "&quot;");
    
    return '<div class="suggestion-item" onclick="selectSuggestion(\'' + escapedName + '\')">' + 
           '<div style="display:flex; justify-content:space-between; align-items:center; width:100%">' +
           '<span style="font-weight:600">' + displayName + '</span>' +
           '<span class="sku-pill">' + displayId + '</span>' +
           '</div></div>';
  }).join('');
  
  dropdown.classList.add('active');
  if (window.lucide) lucide.createIcons();
}

function selectSuggestion(name) {
  var input = document.getElementById('searchInput');
  var typeSelect = document.getElementById('searchType');
  
  if (input) {
    input.value = name;
    // Force search type to 'name' or 'all' to ensure the product appears
    if (typeSelect && typeSelect.value !== 'all') {
      typeSelect.value = 'name';
    }
    renderProductGrid();
  }
  
  var dropdown = document.getElementById('searchSuggestions');
  if (dropdown) dropdown.classList.remove('active');
}

// Close suggestions on outside click
document.addEventListener('click', function(e) {
  var dropdown = document.getElementById('searchSuggestions');
  var input = document.getElementById('searchInput');
  // Only hide if the click was outside both the input AND the dropdown
  if (dropdown && input && !dropdown.contains(e.target) && e.target !== input) {
    dropdown.classList.remove('active');
  }
});

// ─── VIEW SWITCHING ───────────────────────────────────────

function switchView(view) {
  currentView = view;

  // 1. Sync tab active states (header + mobile nav)
  document.querySelectorAll('.main-tab').forEach(function(t) {
    t.classList.toggle('active', t.getAttribute('data-view') === view);
  });
  document.querySelectorAll('.mobile-nav-item[data-view]').forEach(function(t) {
    t.classList.toggle('active', t.getAttribute('data-view') === view);
  });

  // 2. Show/hide view sections
  var sections = ['store', 'orders', 'substock'];
  sections.forEach(function(s) {
    var el = document.getElementById('view-' + s);
    if (el) {
      el.style.display = (s === view) ? 'block' : 'none';
    }
  });

  // 3. Hero banner: only on store view
  var hero = document.getElementById('hero-banner');
  if (hero) hero.style.display = (view === 'store') ? 'block' : 'none';

  // 4. Background data loading & Login-gate
  if (view === 'orders') {
    if (!currentUser) {
      var gateModal = document.getElementById('loginGateModal');
      if (gateModal) { gateModal.classList.add('open'); refreshIcons(); }
      // Show login state in orders area
      var list = document.getElementById('myOrdersList');
      if (list) list.innerHTML = '<div class="empty-state"><i data-lucide="lock" style="width:48px;height:48px"></i><p>ต้องเข้าสู่ระบบ</p><button class="btn btn-primary btn-sm" style="margin-top:1rem" onclick="navigateTo(scriptUrl + \'?page=login\')">ไปหน้าเข้าสู่ระบบ</button></div>';
    } else {
      setTimeout(function() { loadMyOrders(); refreshIcons(); }, 10);
    }
  }
  
  if (view === 'substock' && currentUser) {
    setTimeout(function() { loadSubStock(); refreshIcons(); }, 10);
  }
}

/**
 * navigateTo - ใช้สำหรับเปลี่ยนหน้าไปยังAdmin/Login พร้อมแสดง Loading
 */
function navigateTo(url) {
  var loader = document.getElementById('globalLoader');
  if (loader) loader.classList.add('active');
  window.top.location.href = url;
}

// ─── CATEGORIES ───────────────────────────────────────────

function renderCategories() {
  var nav = document.getElementById('categoryNav');
  if (!nav) return;
  // Dedup by categoryId to prevent duplicates from Sheet correctly
  var seen = {};
  var unique = allCategories.filter(function(c) {
    if (!c.categoryId || seen[c.categoryId]) return false;
    seen[c.categoryId] = true;
    return true;
  });
  var cats = [{ categoryId: 'all', name: 'สินค้าทั้งหมด' }].concat(unique);
  nav.innerHTML = cats.map(function(c) {
    var isActive = currentCategory === c.categoryId;
    return '<button class="cat-pill ' + (isActive ? 'active' : '') + '" style="font-weight:' + (isActive ? '600' : '400') + '" '
      + 'onclick="filterCategory(\'' + c.categoryId + '\')">' + c.name + '</button>';
  }).join('');
}

function filterCategory(catId) {
  currentCategory = catId;
  renderCategories();
  renderProductGrid();
}

// ─── PRODUCT GRID & PAGINATION ────────────────────────────

// Pagination State
var productPageSize = 16;
var currentProductPage = 1;

function renderPaginationControls(totalPages, currentPage, containerId, renderFunctionStr) {
  var container = document.getElementById(containerId);
  if (!container) return;
  
  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }
  
  var html = '<div class="flex justify-center flex-wrap gap-2" style="margin-top:2rem">';
  
  // Previous Button
  var prevDisabled = currentPage === 1 ? 'disabled' : '';
  var scrollJS = "var el=document.getElementById('categoryNav');if(el)el.scrollIntoView({behavior:'smooth', block:'start'});";
  html += '<button class="btn btn-outline btn-sm" ' + prevDisabled + ' onclick="' + renderFunctionStr + '(' + (currentPage - 1) + '); ' + scrollJS + '">&laquo; ก่อนหน้า</button>';
  
  // Page Numbers
  var startPage = Math.max(1, currentPage - 2);
  var endPage = Math.min(totalPages, currentPage + 2);
  
  if (startPage > 1) {
    html += '<button class="btn btn-outline btn-sm" onclick="' + renderFunctionStr + '(1); ' + scrollJS + '">1</button>';
    if (startPage > 2) html += '<span style="align-self:end; padding:0 0.25rem">...</span>';
  }
  
  for (var i = startPage; i <= endPage; i++) {
    var activeClass = i === currentPage ? 'btn-primary' : 'btn-outline';
    html += '<button class="btn ' + activeClass + ' btn-sm" onclick="' + renderFunctionStr + '(' + i + '); ' + scrollJS + '">' + i + '</button>';
  }
  
  if (endPage < totalPages) {
    if (endPage < totalPages - 1) html += '<span style="align-self:end; padding:0 0.25rem">...</span>';
    html += '<button class="btn btn-outline btn-sm" onclick="' + renderFunctionStr + '(' + totalPages + '); ' + scrollJS + '">' + totalPages + '</button>';
  }
  
  // Next Button
  var nextDisabled = currentPage === totalPages ? 'disabled' : '';
  html += '<button class="btn btn-outline btn-sm" ' + nextDisabled + ' onclick="' + renderFunctionStr + '(' + (currentPage + 1) + '); ' + scrollJS + '">ถัดไป &raquo;</button>';
  
  html += '</div>';
  container.innerHTML = html;
}

function renderProductGrid(pageNum) {
  var grid = document.getElementById('productGrid');
  if (!grid) return;

  var filtered = allProducts;
  if (currentCategory !== 'all') {
    filtered = filtered.filter(function(p) { return String(p.categoryId) === currentCategory; });
  }

  // Search
  var searchVal = (document.getElementById('searchInput') || {}).value || '';
  var searchType = (document.getElementById('searchType') || {}).value || 'all';
  if (searchVal.trim()) {
    var q = searchVal.trim().toLowerCase();
    filtered = filtered.filter(function(p) {
      if (searchType === 'all') {
        var str = (p.name + ' ' + p.productId + ' ' + (p.description || '')).toLowerCase();
        return str.indexOf(q) !== -1;
      }
      var val = String(p[searchType] || '').toLowerCase();
      return val.indexOf(q) !== -1;
    });
  }

  // Stock Filter
  var stockFilter = (document.getElementById('stockFilter') || {}).value || 'all';
  if (stockFilter === 'instock') {
    filtered = filtered.filter(function(p) { return Number(p.stock) > 0; });
  }

  if (filtered.length === 0) {
    var clearBtn = searchVal.trim()
      ? '<button class="btn btn-outline btn-sm" style="margin-top:1rem" onclick="document.getElementById(\'searchInput\').value=\'\';renderProductGrid()">ล้างการค้นหา</button>'
      : '';
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><i data-lucide="search-x" style="width:48px;height:48px"></i><p>ไม่พบสินค้าที่ตรงกัน</p><small>ลองเปลี่ยนคำค้นหาหรือหมวดหมู่</small>' + clearBtn + '</div>';
    document.getElementById('productPagination').innerHTML = '';
    refreshIcons();
    return;
  }

  // --- Apply Pagination ---
  if (pageNum) currentProductPage = pageNum;
  else currentProductPage = 1; // reset to 1 if applying filters

  var totalItems = filtered.length;
  var totalPages = Math.ceil(totalItems / productPageSize);
  if (currentProductPage > totalPages) currentProductPage = totalPages;
  if (currentProductPage < 1) currentProductPage = 1;

  var startIdx = (currentProductPage - 1) * productPageSize;
  var endIdx = startIdx + productPageSize;
  var paginated = filtered.slice(startIdx, endIdx);

  grid.innerHTML = paginated.map(function(p) {
    var outOfStock = Number(p.stock) <= 0;
    var imgUrl = getImageUrl(p.imageUrl);
    
    // Premium image rendering with glass fallback
    var imgHtml = imgUrl
      ? '<img src="' + imgUrl + '" class="product-img' + (outOfStock ? ' out-of-stock-img' : '') + '" loading="lazy" onerror="this.onerror=null;this.src=\'\';this.parentElement.innerHTML=\'<div class=\\\'product-img-placeholder\\\'><i data-lucide=\\\'package\\\' style=\\\'width:32px;height:32px;opacity:0.3\\\'></i></div>\'">'
      : '<div class="product-img-placeholder"><i data-lucide="package" style="width:32px;height:32px;opacity:0.3"></i></div>';

    return '<div class="product-card" ' + (outOfStock ? 'style="opacity:0.6"' : '') + '>'
      + '<div class="product-img-wrap" onclick="openProductDetail(\'' + p.productId + '\')">' + imgHtml + '</div>'
      + '<div class="product-info">'
      +   '<div class="product-name" style="cursor:pointer" onclick="openProductDetail(\'' + p.productId + '\')">' + p.name + '</div>'
      +   '<div class="product-stock"><span class="product-stock-dot' + (outOfStock ? ' out' : '') + '"></span>' + (outOfStock ? '<span style="color:var(--danger)">หมดสต็อก</span>' : 'คงเหลือ: ' + p.stock + ' ชิ้น') + '</div>'
      +   '<div class="flex items-center justify-between" style="margin-top:auto">'
      +     '<div class="product-price">฿' + Number(p.price).toLocaleString() + '</div>'
      +     '<button class="btn btn-sm ' + (outOfStock ? 'btn-outline' : 'btn-accent') + '" '
      +       (outOfStock ? 'disabled' : 'onclick="addToCart(\'' + p.productId + '\', event)"')
      +     ' style="border-radius:99px; padding: 0.4rem 1rem;">' + (outOfStock ? 'หมด' : '+ เบิกสินค้า') + '</button>'
      +   '</div>'
      + '</div>'
      + '</div>';
  }).join('');
  
  renderPaginationControls(totalPages, currentProductPage, 'productPagination', 'renderProductGrid');
  refreshIcons();
}

function openProductDetail(id) {
  var p = allProducts.filter(function(x) { return String(x.productId) === String(id); })[0];
  if (!p) return;
  
  var cat = allCategories.filter(function(c) { return String(c.categoryId) === String(p.categoryId); })[0];
  var body = document.getElementById('productDetailBody');
  var imgUrl = getImageUrl(p.imageUrl);
  
  var outOfStock = Number(p.stock) <= 0;
  body.innerHTML = '<div class="product-detail-hero">'
    + (imgUrl 
        ? '<img src="' + imgUrl + '" class="detail-img' + (outOfStock ? ' out-of-stock-img' : '') + '" onerror="this.onerror=null;this.src=\'\';this.parentElement.innerHTML=\'<div class=\\\'product-img-placeholder\\\'><i data-lucide=\\\'package\\\' style=\\\'width:64px;height:64px;opacity:0.2\\\'></i></div>\'">'
        : '<div class="product-img-placeholder"><i data-lucide="package" style="width:64px;height:64px;opacity:0.2"></i></div>'
      )
    + '</div>'
    + '<div style="padding:1.5rem">'
    +   '<div class="flex justify-between items-start" style="margin-bottom:1rem">'
    +     '<div>'
    +       '<h2 style="font-size:1.5rem;font-weight:800;letter-spacing:-1px">' + p.name + '</h2>'
    +       '<div style="color:var(--text3);font-size:0.9rem;margin-top:0.25rem">หมวดหมู่: ' + (cat ? cat.name : '-') + ' | SKU: ' + p.productId + '</div>'
    +     '</div>'
    +     '<div class="product-price" style="font-size:1.8rem">฿' + Number(p.price).toLocaleString() + '</div>'
    +   '</div>'
    +   '<div class="card glass" style="margin-bottom:1.5rem;padding:1rem;background:rgba(255,255,255,0.02)">'
    +     '<div style="font-size:0.85rem;color:var(--text3);margin-bottom:0.5rem">สถานะคลังสินค้าหลัก</div>'
    +     '<div style="display:flex;align-items:center;gap:0.5rem">'
    +       '<div style="width:12px;height:12px;border-radius:50%;background:' + (Number(p.stock) > 0 ? 'var(--accent)' : 'var(--danger)') + '"></div>'
    +       '<span style="font-weight:700;font-size:1.1rem">' + p.stock + ' ชิ้น</span>'
    +       '<span style="font-size:0.9rem;color:var(--text3)">พร้อมเบิก</span>'
    +     '</div>'
    +   '</div>'
    +   '<div style="margin-bottom:1.5rem">'
    +     '<h3 style="font-size:1rem;font-weight:700;margin-bottom:0.75rem">รายละเอียดสินค้า</h3>'
    +     '<p style="color:var(--text2);line-height:1.6;font-size:0.95rem">' + (p.description || 'ไม่มีรายละเอียดเพิ่มเติมสำหรับสินค้านี้') + '</p>'
    +   '</div>'
    + '</div>';
  
  var btn = document.getElementById('detailAddToCartBtn');
  var outOfStock = Number(p.stock) <= 0;
  btn.disabled = outOfStock;
  btn.onclick = function() { addToCart(p.productId); closeModal('productDetailModal'); toggleDrawer('cartDrawer'); };
  btn.innerHTML = outOfStock ? 'สินค้าหมด' : '<i data-lucide="shopping-cart" style="width:18px;height:18px"></i> เพิ่มลงตะกร้า';
  
  document.getElementById('productDetailModal').classList.add('open');
  refreshIcons();
}

/**
 * getImageUrl - แปลงลิงก์ Google Drive หลากหลายรูปแบบให้เป็น Direct Link ที่เสถียร
 */
function getImageUrl(url) {
  if (!url) return '';
  if (typeof url !== 'string') return '';
  if (url.indexOf('drive.google.com') !== -1 || url.indexOf('lh3.googleusercontent.com') !== -1) {
    var id = '';
    if (url.indexOf('id=') !== -1) {
      id = url.split('id=')[1].split('&')[0];
    } else if (url.indexOf('/d/') !== -1) {
      id = url.split('/d/')[1].split('/')[0];
    } else if (url.indexOf('lh3.googleusercontent.com') !== -1) {
      id = url.split('/').pop();
    }
    // ใช้ thumbnail endpoint พร้อมกำหนดขนาด (sz) เพื่อความเสถียรสูงสุดใน iframe
    if (id) return 'https://drive.google.com/thumbnail?id=' + id + '&sz=w1000';
  }
  return url;
}

function addToCart(productId, event) {
  if (!currentUser) {
    // Show premium login-gate modal instead of redirecting abruptly
    var modal = document.getElementById('loginGateModal');
    if (modal) { modal.classList.add('open'); refreshIcons(); }
    return;
  }
  var product = allProducts.filter(function(p) { return String(p.productId) === String(productId); })[0];
  if (product) {
    Cart.add(product);
    if (event) animateFlyToCart(event, getImageUrl(product.imageUrl));
  }
}

/**
 * animateFlyToCart - แอนิเมชันสินค้าบินเข้าตะกร้า
 */
function animateFlyToCart(e, imgUrl) {
  if (!e) return;
  var isMobile = window.innerWidth <= 768;
  
  // หากเป็นมือถือให้ไปหาเป้าหมายที่แท็บล่างสุด
  var cartBtn = isMobile 
    ? document.querySelector('.mobile-nav-item[onclick*="cartDrawer"]') 
    : document.querySelector('.nav-actions button[onclick*="cartDrawer"]');
    
  if (!cartBtn) return;
  
  var flyer = document.createElement('div');
  flyer.className = 'flying-item';
  if (imgUrl) flyer.style.backgroundImage = 'url(' + imgUrl + ')';
  
  var startX = e.clientX || e.target.getBoundingClientRect().left;
  var startY = e.clientY || e.target.getBoundingClientRect().top;
  
  var targetRect = cartBtn.getBoundingClientRect();
  var endX = targetRect.left + (targetRect.width / 2);
  var endY = targetRect.top + (targetRect.height / 2);
  
  flyer.style.left = startX + 'px';
  flyer.style.top = startY + 'px';
  document.body.appendChild(flyer);
  
  flyer.offsetWidth; // force reflow
  
  flyer.style.left = endX + 'px';
  flyer.style.top = endY + 'px';
  flyer.style.transform = 'scale(0.1) rotate(720deg)';
  flyer.style.opacity = '0.2';
  
  setTimeout(function() {
    flyer.remove();
    var badgeId = isMobile ? 'cartCountMobile' : 'cartBadge';
    var badge = document.getElementById(badgeId);
    if (badge) {
      badge.style.transform = 'scale(1.6)';
      setTimeout(function() { badge.style.transform = 'scale(1)'; }, 200);
    }
    // Bounce the cart icon itself
    cartBtn.classList.remove('bounce-pop'); // Reset if animating
    void cartBtn.offsetWidth; // Trigger reflow
    cartBtn.classList.add('bounce-pop');
  }, 800);
}

// ─── MY ORDERS ────────────────────────────────────────────

var myOrdersCache = null;
function loadMyOrders() {
  var list = document.getElementById('myOrdersList');
  if (!list) return;
  
  // 1. Render from Cache first for instant response
  if (myOrdersCache) {
    renderOrderList(myOrdersCache);
  } else {
    list.innerHTML = Array(3).fill('<div class="order-card" style="display:flex; flex-direction:column; gap:0.75rem">'
      + '<div class="flex items-center justify-between"><div class="skeleton skeleton-text" style="width:120px; margin:0"></div><div class="skeleton" style="width:80px; height:24px; border-radius:12px"></div></div>'
      + '<div class="flex items-center justify-between" style="margin-top:0.5rem"><div class="skeleton skeleton-text" style="width:150px; margin:0"></div><div class="skeleton skeleton-text" style="width:80px; margin:0"></div></div>'
      + '</div>').join('');
  }

  // 2. Fetch fresh data in background
  API.getMyRequests().then(function(res) {
    myOrdersCache = res.data;
    renderOrderList(res.data);
  }).catch(function(err) {
    if (!myOrdersCache) {
      list.innerHTML = '<div class="empty-state"> '
        + '<p style="color:var(--danger)">⛔ โหลดข้อมูลไม่สำเร็จ</p>'
        + '<p style="font-size:0.8rem;margin-top:0.5rem;color:var(--text3)">' + err + '</p>'
        + '</div>';
    }
  });
}

function renderOrderList(data) {
  var list = document.getElementById('myOrdersList');
  if (!list) return;

  // Apply filter
  var filtered = (_currentOrderFilter && _currentOrderFilter !== 'all')
    ? data.filter(function(o) { return o.status === _currentOrderFilter; })
    : data;

  if (filtered.length === 0) {
    var emptyMsg = _currentOrderFilter !== 'all'
      ? 'ไม่มีรายการเบิกสถานะ "' + _currentOrderFilter + '"'
      : 'ยังไม่มีประวัติการเบิก';
    var icon = _currentOrderFilter !== 'all' ? 'search-x' : 'clipboard-list';
    list.innerHTML = '<div class="card text-center empty-state" style="padding:3rem;color:var(--text3)"><i data-lucide="' + icon + '" style="width:32px;height:32px;margin:0 auto 1rem;opacity:0.3"></i><br>' + emptyMsg + '</div>';
    refreshIcons();
    return;
  }
  
  list.innerHTML = filtered.map(function(o) {
    var bc = 'badge-pending';
    if (o.status === 'Approved' || o.status === 'Dispatched') bc = 'badge-approved';
    if (o.status === 'Received') bc = 'badge-complete';
    if (o.status === 'Rejected') bc = 'badge-rejected';

    var actions = '';
    if (o.status === 'Dispatched') {
      actions = '<button class="btn btn-primary btn-sm w-full" style="margin-top:0.5rem" onclick="openSignatureModal(\'' + o.orderId + '\')"><i data-lucide="signature" style="width:14px;height:14px"></i> เซ็นรับของ</button>';
    }

    return '<div class="order-card">'
      + '<div class="flex items-center justify-between" style="margin-bottom:0.75rem">'
      +   '<div style="font-weight:600">#' + o.orderId + '</div>'
      +   '<div class="badge ' + bc + '">' + (o.statusLabel || o.status) + '</div>'
      + '</div>'
      + '<div class="flex items-center justify-between" style="font-size:0.9rem">'
      +   '<div style="font-size:0.85rem;color:var(--text3);margin-bottom:0.75rem"><i data-lucide="clock" style="width:14px;height:14px"></i> ' + (o.createdAt || '-') + '</div>'
      +   '<div class="flex justify-between items-center">'
      +     '<div style="font-weight:700;color:var(--accent)">฿' + Number(o.totalAmount).toLocaleString() + '</div>'
      +     '<button class="btn btn-outline btn-sm" onclick="viewOrderDetails(\'' + o.orderId + '\')">ดูรายละเอียด</button>'
      +   '</div>'
      + '</div>'
      + actions
      + '</div>';
  }).join('');
  refreshIcons();
}

function openSignatureModal(requestId) {
  viewOrderDetails(requestId);
}

var currentSigningRequestId = null;
function viewOrderDetails(requestId) {
  var modal = document.getElementById('orderDetailModal');
  var body = document.getElementById('orderDetailBody');
  var sigSection = document.getElementById('signatureSection');
  if (!modal || !body) return;

  currentSigningRequestId = requestId;
  body.innerHTML = '<div class="text-center" style="padding:2rem"><div class="spinner"></div></div>';
  sigSection.classList.add('hidden');
  modal.classList.add('open');

  Promise.all([
    API.getOrderItems(requestId),
    // ใช้ cache ถ้ามีแล้ว แทนที่จะเรียก API ซ้ำ
    myOrdersCache ? Promise.resolve({ data: myOrdersCache }) : API.getMyRequests()
  ]).then(function(results) {
    var itemsRes = results[0];
    var ordersRes = results[1];
    var items = itemsRes.data;
    var order = ordersRes.data.filter(function(o) { return o.orderId === requestId; })[0];

    var html = '<div class="table-wrap"><table><thead><tr><th>สินค้า</th><th class="text-center">จำนวน</th><th class="text-right">รวม</th></tr></thead><tbody>'
      + items.map(function(i) {
        return '<tr><td>' + i.productName + '</td><td class="text-center">' + i.quantity + '</td>'
          + '<td class="text-right" style="font-weight:600">฿' + (Number(i.price) * Number(i.quantity)).toLocaleString() + '</td></tr>';
      }).join('')
      + '</tbody></table></div>';

    if (order && order.signature) {
      html += '<div style="margin-top:1.5rem;text-align:center;border-top:1px solid var(--border);padding-top:1rem">'
        + '<p style="font-size:0.8rem;color:var(--text3)">✍️ ลายเซ็นรับของ:</p>'
        + '<img src="' + order.signature + '" style="max-width:200px;background:#fff;border-radius:4px;margin-top:0.5rem;border:1px solid var(--border)">'
        + '<p style="font-size:0.7rem;color:var(--text3);margin-top:0.25rem">รับเมื่อ: ' + order.receivedAt + '</p>'
        + '</div>';
    }

    if (ordersRes && ordersRes.data) {
      var pastOrders = ordersRes.data.filter(function(o) { return o.orderId !== requestId && (o.status === 'Received' || o.status === 'Approved' || o.status === 'Dispatched'); });
      if (pastOrders.length > 0) {
        html += '<div style="margin-top:1.5rem;border-top:1px dashed var(--border);padding-top:1rem;">'
          + '<h4 style="font-size:0.9rem;font-weight:700;margin-bottom:0.5rem"><i data-lucide="history" style="width:14px;height:14px"></i> ประวัติการเบิกที่ผ่านมา</h4>'
          + '<ul style="font-size:0.8rem;color:var(--text2);list-style:none;padding:0;display:flex;flex-direction:column;gap:0.5rem">';
        pastOrders.slice(0, 5).forEach(function(po) {
          html += '<li style="display:flex;justify-content:space-between;background:rgba(255,255,255,0.02);padding:0.5rem;border-radius:4px;">'
            + '<span>#' + po.orderId + ' (' + (po.createdAt ? po.createdAt.split(' ')[0] : '') + ')</span>'
            + '<span style="font-weight:600;color:var(--accent)">฿' + Number(po.totalAmount).toLocaleString() + '</span>'
            + '</li>';
        });
        html += '</ul></div>';
      }
    }


    body.innerHTML = html;
    refreshIcons(); // Refresh icons after updating body HTML

    if (order && order.status === 'Dispatched') {
      sigSection.classList.remove('hidden');
      initSignaturePad();
    }
  }).catch(function(err) {
    body.innerHTML = '<p class="text-center" style="color:var(--danger)">เกิดข้อผิดพลาด: ' + err + '</p>';
  });
}

// ─── SIGNATURE PAD LOGIC ──────────────────────────────────
var signatureCanvas, signatureCtx, isDrawing = false;

function initSignaturePad() {
  signatureCanvas = document.getElementById('signatureCanvas');
  if (!signatureCanvas) return;
  
  signatureCtx = signatureCanvas.getContext('2d');
  signatureCanvas.width = signatureCanvas.offsetWidth;
  signatureCanvas.height = 200;
  
  signatureCtx.strokeStyle = '#000';
  signatureCtx.lineWidth = 2;
  signatureCtx.lineJoin = 'round';
  signatureCtx.lineCap = 'round';

  signatureCanvas.addEventListener('mousedown', startDrawing);
  signatureCanvas.addEventListener('mousemove', draw);
  signatureCanvas.addEventListener('mouseup', stopDrawing);
  signatureCanvas.addEventListener('mouseleave', stopDrawing);
  
  signatureCanvas.addEventListener('touchstart', function(e) { e.preventDefault(); startDrawing(e.touches[0]); });
  signatureCanvas.addEventListener('touchmove', function(e) { e.preventDefault(); draw(e.touches[0]); });
  signatureCanvas.addEventListener('touchend', stopDrawing);
}

function startDrawing(e) {
  isDrawing = true;
  var pos = getMousePos(e);
  signatureCtx.beginPath();
  signatureCtx.moveTo(pos.x, pos.y);
}

function draw(e) {
  if (!isDrawing) return;
  var pos = getMousePos(e);
  signatureCtx.lineTo(pos.x, pos.y);
  signatureCtx.stroke();
}

function stopDrawing() { isDrawing = false; }

function getMousePos(e) {
  var rect = signatureCanvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function clearSignature() {
  if (signatureCtx) signatureCtx.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height);
}

function submitReceipt() {
  if (!currentSigningRequestId) return;
  var signature = signatureCanvas.toDataURL('image/png');
  
  // ตรวจสอบว่าเซ็นหรือยัง (เช็คว่า Canvas ขาวไหมแบบง่าย)
  var blank = document.createElement('canvas');
  blank.width = signatureCanvas.width;
  blank.height = signatureCanvas.height;
  if (signature === blank.toDataURL()) {
    showToast('กรุณาเซ็นชื่อก่อนยืนยัน', 'warning');
    return;
  }

  showToast('กำลังบันทึก...', 'info');
  API.signForReceipt(currentSigningRequestId, signature).then(function(res) {
    showToast('ขอบคุณ! บันทึกการรับของเรียบร้อย', 'success');
    closeModal('orderDetailModal');
    loadMyOrders();
  }).catch(function(err) {
    showToast('เกิดข้อผิดพลาด: ' + err, 'error');
  });
}

// ─── SUB-STOCK LOGIC ──────────────────────────────────────

var subStockCache = null;
function loadSubStock() {
  var grid = document.getElementById('subStockGrid');
  if (!grid) return;

  if (subStockCache) {
    renderSubStock(subStockCache);
  } else {
    grid.innerHTML = Array(4).fill('<div class="product-card">'
      + '<div class="product-img-wrap"><div class="skeleton" style="width:100%; height:100%; border-radius:0"></div></div>'
      + '<div class="product-info">'
      +   '<div class="skeleton skeleton-text" style="width:85%"></div>'
      +   '<div class="skeleton skeleton-text" style="width:50%"></div>'
      +   '<div style="margin-top:1rem; display:flex; gap:0.5rem"><div class="skeleton" style="height:32px; flex:1; border-radius:99px"></div>'
      +   '<div class="skeleton" style="height:32px; width:64px; border-radius:99px"></div></div>'
      + '</div></div>').join('');
  }

  API.getSubStock().then(function(res) {
    subStockCache = res.data;
    renderSubStock(res.data);
  }).catch(function(err) {
    showToast('โหลดสต๊อกย่อยไม่สำเร็จ: ' + err, 'error');
  });
}

function renderSubStock(data) {
  var grid = document.getElementById('subStockGrid');
  if (!grid) return;

  if (!data || data.length === 0) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><p>ไม่มีสินค้าในคลังย่อยของคุณ</p></div>';
    return;
  }

  grid.innerHTML = data.map(function(item) {
    // ใช้ String() ป้องกัน type mismatch ของ productId
    var prod = allProducts.filter(function(p) { return String(p.productId) === String(item.productId); })[0];
    var imgUrl = getImageUrl(prod ? prod.imageUrl : '');
    var imgHtml = imgUrl
      ? '<img src="' + imgUrl + '" class="product-img" loading="lazy" onerror="this.src=\'\';this.parentElement.innerHTML=\'<div class=\\\'product-img\\\' style=\\\'display:flex;align-items:center;justify-content:center;color:var(--text3);font-size:2rem\\\'>📦</div>\'">'
      : '<div class="product-img" style="display:flex;align-items:center;justify-content:center;color:var(--text3);font-size:2rem">📦</div>';

    return '<div class="product-card">'
      + imgHtml
      + '<div class="product-info">'
      +   '<div class="product-name">' + item.productName + '</div>'
      +   '<div class="product-stock">คงเหลือ: <span id="ss-qty-' + item.productId + '">' + item.quantity + '</span></div>'
      +   '<div style="margin-top:1rem; display:flex; gap:0.5rem; flex-wrap:wrap">'
      +     '<button class="btn btn-primary btn-sm flex-1" onclick="openActionModal(\'use\', \'' + item.productId + '\', \'' + item.productName.replace(/'/g, "\\'") + '\', ' + item.quantity + ')"><i data-lucide="sparkles" style="width:14px;height:14px"></i> เบิกใช้งาน</button>'
      +     '<button class="btn btn-outline btn-sm" title="โอนให้เพื่อน" onclick="openActionModal(\'transfer\', \'' + item.productId + '\', \'' + item.productName.replace(/'/g, "\\'") + '\', ' + item.quantity + ')"><i data-lucide="repeat" style="width:14px;height:14px"></i> โอน</button>'
      +     '<button class="btn btn-ghost btn-sm" title="คืนคลังหลัก" onclick="openActionModal(\'return\', \'' + item.productId + '\', \'' + item.productName.replace(/'/g, "\\'") + '\', ' + item.quantity + ')"><i data-lucide="archive" style="width:14px;height:14px"></i> คืน</button>'
      +   '</div>'
      + '</div>'
      + '</div>';
  }).join('');
  refreshIcons();
}

var _activeAction = null;

function openActionModal(action, productId, productName, maxQty) {
  _activeAction = { type: action, productId: productId, max: maxQty };
  var mTitle = document.getElementById('actionModalTitle');
  var mDesc = document.getElementById('actionModalDesc');
  var inputWrap = document.getElementById('actionModalInputWrap');
  var inputEl = document.getElementById('actionModalInput');
  var qtyEl = document.getElementById('actionModalQty');
  
  qtyEl.value = '1';
  qtyEl.max = maxQty;
  inputWrap.classList.add('hidden');
  inputEl.value = '';
  
  if (action === 'use') {
    mTitle.innerHTML = '<i data-lucide="sparkles" style="width:18px;height:18px;color:var(--primary);"></i> นำไปใช้งานจริง';
    mDesc.innerHTML = 'คุณกำลังจะตัดยอด <b>' + productName + '</b> ออกจากคลังย่อยเพื่อนำไปใช้งาน';
  } else if (action === 'transfer') {
    mTitle.innerHTML = '<i data-lucide="repeat" style="width:18px;height:18px;color:var(--primary);"></i> โอนให้เพื่อนร่วมงาน';
    mDesc.innerHTML = 'โอน <b>' + productName + '</b> ให้พนักงานท่านอื่น';
    inputWrap.classList.remove('hidden');
    document.getElementById('actionModalInputLabel').innerText = 'รหัสพนักงานผู้รับ';
  } else if (action === 'return') {
    mTitle.innerHTML = '<i data-lucide="archive" style="width:18px;height:18px;color:var(--primary);"></i> คืนเข้าคลังหลัก';
    mDesc.innerHTML = 'ส่งคืน <b>' + productName + '</b> กลับไปยังคลังพัสดุหลัก';
  }
  
  var btn = document.getElementById('actionModalBtn');
  btn.onclick = executeSubStockAction;
  btn.innerHTML = 'ยืนยัน';
  
  document.getElementById('actionModal').classList.add('open');
  refreshIcons();
}

function executeSubStockAction() {
  if (!_activeAction) return;
  var qty = parseInt(document.getElementById('actionModalQty').value);
  if (isNaN(qty) || qty <= 0) { showToast('จำนวนต้องมากกว่า 0', 'warning'); return; }
  if (qty > _activeAction.max) { showToast('จำนวนเกินคลังย่อยที่คุณมี', 'warning'); return; }
  
  var btn = document.getElementById('actionModalBtn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div>';
  
  var promise;
  var targetData = null;
  
  if (_activeAction.type === 'use') {
    promise = API.deductSubStock(_activeAction.productId, qty);
  } else if (_activeAction.type === 'transfer') {
    var toId = document.getElementById('actionModalInput').value.trim();
    if (!toId) { btn.disabled=false; btn.innerHTML='ยืนยัน'; showToast('กรุณาระบุรหัสพนักงานเป้าหมาย', 'warning'); return; }
    promise = API.transferSubStock({ toEmployeeId: toId, productId: _activeAction.productId, qty: qty });
  } else if (_activeAction.type === 'return') {
    promise = API.returnToMainStock({ productId: _activeAction.productId, qty: qty });
  }
  
  if (promise) {
    promise.then(function(res) {
      if (res.success) {
        showToast('ดำเนินการสำเร็จ', 'success');
        subStockCache = null; // Invalidate cache
        closeModal('actionModal');
        loadSubStock();
      } else showToast(res.message, 'error');
    }).catch(function(err) {
      showToast('เกิดข้อผิดพลาด: ' + err, 'error');
    }).finally(function() {
      btn.disabled = false;
    });
  }
}

// ─── UI HELPERS ───────────────────────────────────────────

function toggleDrawer(id) {
  var drawer = document.getElementById(id);
  var overlay = document.getElementById('drawerOverlay');
  if (!drawer || !overlay) return;
  drawer.classList.toggle('open');
  overlay.classList.toggle('open');
}

function closeModal(id) {
  var el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

function showToast(msg, type) {
  var container = document.getElementById('toastContainer');
  if (!container) return;
  var t = document.createElement('div');
  t.className = 'toast ' + (type || 'success');
  t.textContent = msg;
  container.appendChild(t);
  setTimeout(function() { t.remove(); }, 4000);
}

// ─── ORDERS FILTER ────────────────────────────────────────

var _currentOrderFilter = 'all';

function filterOrders(status) {
  _currentOrderFilter = status;
  document.querySelectorAll('.orders-filter-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.getAttribute('data-filter') === status);
  });
  if (myOrdersCache) renderOrderList(myOrdersCache);
}

// ─── CHECKOUT MODAL (replaces confirm()) ──────────────────

function showCheckoutModal() {
  if (!currentUser) {
    var gateModal = document.getElementById('loginGateModal');
    if (gateModal) { gateModal.classList.add('open'); refreshIcons(); }
    return;
  }
  var items = Cart.getItems();
  if (items.length === 0) return;

  var body = document.getElementById('checkoutModalBody');
  var total = Cart.getTotal();

  body.innerHTML = '<div class="table-wrap" style="margin-bottom:1rem;"><table><thead><tr>'
    + '<th>สินค้า</th><th class="text-center">จำนวน</th><th class="text-right">รวม</th></tr></thead><tbody>'
    + items.map(function(i) {
        return '<tr><td>' + i.name + '</td><td class="text-center">' + i.qty + '</td><td class="text-right" style="font-weight:600;color:var(--accent)">฿' + (i.price * i.qty).toLocaleString() + '</td></tr>';
      }).join('')
    + '</tbody></table></div>'
    + '<div style="display:flex;justify-content:space-between;align-items:center;padding:0.75rem;background:var(--glass-gold);border-radius:10px;border:1px solid rgba(251,191,36,0.2);">'
    + '<span style="font-weight:600;">ยอดรวม (' + items.length + ' รายการ)</span>'
    + '<span style="font-size:1.3rem;font-weight:800;color:var(--primary)">฿' + total.toLocaleString() + '</span>'
    + '</div>';

  var modal = document.getElementById('checkoutModal');
  if (modal) { modal.classList.add('open'); refreshIcons(); }
}

function confirmCheckout() {
  if (!currentUser) return;
  var items = Cart.getItems();
  if (items.length === 0) return;

  var btn = document.getElementById('confirmCheckoutBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner"></div> กำลังดำเนินการ...'; }

  var payload = items.map(function(i) { return { productId: i.productId, qty: i.qty }; });

  API.createRequest(payload)
    .then(function(res) {
      closeModal('checkoutModal');
      showToast('ส่งคำขอเบิกเรียบร้อย รหัส: ' + res.requestId, 'success');
      Cart.clear();
      toggleDrawer('cartDrawer');
      if (typeof loadMyOrders === 'function') loadMyOrders();
    })
    .catch(function(err) { showToast('เกิดข้อผิดพลาด: ' + err, 'error'); })
    .finally(function() {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="send" style="width:16px;height:16px;"></i> ส่งคำขอเบิก'; refreshIcons(); }
    });
}

// ─── SWIPE-TO-CLOSE CART (mobile) ─────────────────────────
// Runs after DOM is ready (called from window.onload via initCartSwipe)
function initCartSwipe() {
  var handle = document.getElementById('cartSwipeHandle');
  var drawer = document.getElementById('cartDrawer');
  if (!handle || !drawer) return;

  var startX = 0;
  handle.addEventListener('touchstart', function(e) {
    startX = e.touches[0].clientX;
  }, { passive: true });

  handle.addEventListener('touchmove', function(e) {
    var dx = e.touches[0].clientX - startX;
    // Drawer slides from right: positive dx means swiping right (closing)
    if (dx > 0) {
      drawer.style.transition = 'none';
      drawer.style.transform = 'translateX(' + Math.min(dx, 300) + 'px)';
    }
  }, { passive: true });

  handle.addEventListener('touchend', function(e) {
    var dx = e.changedTouches[0].clientX - startX;
    drawer.style.transition = '';
    drawer.style.transform = '';
    if (dx > 80) toggleDrawer('cartDrawer');
  });
}

var scriptUrl = '<?= scriptUrl ?>';
