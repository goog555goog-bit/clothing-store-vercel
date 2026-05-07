
// ============================================================
//  app.js.html — Core App Logic (Employee Storefront)
// ============================================================

var currentUser = (function() {
  try {
    var stored = localStorage.getItem('_user');
    return stored ? JSON.parse(stored) : null;
  } catch(e) { return null; }
})();

var globalSystemSettings = null;
var isUpdatingSize = false;

function hasPermission(key, value) {
  if (!currentUser) return false;
  
  var userRole = String(currentUser.role || '').toLowerCase();
  if (userRole === 'superadmin') return true;

  // 1. Check dynamic role-based permissions from settings (Real-time update)
  if (globalSystemSettings && globalSystemSettings.rolePermissions) {
    var rolePerms = globalSystemSettings.rolePermissions[userRole] || {};
    if (rolePerms[key] === true) return true;
    
    // Compatibility mapping for internal keys -> UI keys
    var revMapping = {
      'create_request': 'can_request',
      'view_products': 'view_prices',
      'approve_request': 'approve_orders',
      'process_request': 'dispatch_orders',
      'manage_employees': 'manage_users',
      'manage_structure': 'manage_branches'
    };
    if (revMapping[key] && rolePerms[revMapping[key]] === true) return true;
  }

  // 2. view_category logic (Merging individual + role-based)
  if (key === 'view_category') {
    var allowed = [];
    // From individual user object (sent at login)
    if (currentUser.allowed_categories && Array.isArray(currentUser.allowed_categories)) {
      allowed = allowed.concat(currentUser.allowed_categories);
    }
    // From role-based settings (fetched real-time)
    if (globalSystemSettings && globalSystemSettings.roleCategoryPermissions) {
      var roleCats = globalSystemSettings.roleCategoryPermissions[userRole] || [];
      allowed = allowed.concat(roleCats);
    }
    
    if (allowed.length === 0 || allowed.includes('all')) return true;
    var sVal = String(value || '').trim();
    return allowed.some(function(c) { return String(c).trim() === sVal; });
  }

  // 🔥 [RBAC] ถ้า key เป็นหนึ่งในสิทธิ์ที่กำหนดใน API.PERMS ให้ใช้ API.hasPermission โดยตรง
  var permValue = Object.values(API.PERMS).find(v => v === key);
  if (permValue) {
    if (API.hasPermission(key)) return true;
  }

  // 3. Fallback Compatibility mappings
  if (key === 'can_request') return API.hasPermission(API.PERMS.CREATE_REQUEST);
  if (key === 'view_prices') return API.hasPermission(API.PERMS.VIEW_PRODUCTS);

  return API.hasPermission(key);
}
var allProducts = [];
var allCategories = [];
var allBranches = []; 
var myOrdersCache = null;
var currentCategory = 'all';
var currentView = 'store';  // store | orders | substock

// ─── UTILS ────────────────────────────────────────────────
function escapeHTML(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ─── INIT ─────────────────────────────────────────────────

window.onload = function() {
  initDarkMode();
  checkAuth();
  initCartSwipe();
  initMouseGlow();
  
  // Close search suggestions when clicking outside
  document.addEventListener('click', function(e) {
    var dropdown = document.getElementById('searchSuggestions');
    var searchBox = document.querySelector('.search-wrapper');
    if (dropdown && searchBox && !searchBox.contains(e.target)) {
      dropdown.classList.remove('active');
    }
  });
};

function checkAuth() {
  updateUserUI();
  
  // Robust API Initialization - safer retry logic
  function startApp() {
    if (typeof API !== 'undefined' && API.getProducts) {
      loadStorefrontData();
    } else {
      var retryCount = 0;
      var retryTimer = setInterval(function() {
        retryCount++;
        if (typeof API !== 'undefined' && API.getProducts) {
          clearInterval(retryTimer);
          loadStorefrontData();
        } else if (retryCount > 60) { // 6 seconds timeout
          clearInterval(retryTimer);
          showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณารีเฟรชหน้าเว็บ', 'error');
        }
      }, 100);
    }
  }
  startApp();
  
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
}

function updateUserUI() {
  var nameEl = document.getElementById('navUserName');
  var loginBtn = document.getElementById('loginBtn');
  var logoutBtn = document.getElementById('logoutBtn');
  var ordersBtn = document.getElementById('ordersBtn');
  var changePwdBtn = document.getElementById('changePwdBtn');

  if (currentUser) {
    if (nameEl) nameEl.textContent = currentUser.name;
    if (loginBtn) loginBtn.classList.add('hidden');
    if (logoutBtn) logoutBtn.classList.remove('hidden');
    if (ordersBtn) ordersBtn.classList.remove('hidden');
    if (changePwdBtn) changePwdBtn.classList.remove('hidden');
    
    // แสดงปุ่มคลังย่อย
    var substockBtn = document.getElementById('substockBtn');
    var substockMob = document.querySelector('.mobile-nav-item[data-view="substock"]');
    if (substockBtn || substockMob) {
      var isAllowed = API.hasPermission(API.PERMS.MANAGE_INVENTORY);
      if (substockBtn) substockBtn.classList.toggle('hidden', !isAllowed);
      if (substockMob) substockMob.classList.toggle('hidden', !isAllowed);
    }

    // ปุ่ม Admin
    var adminBtn = document.getElementById('adminPaneBtn');
    var adMob = document.getElementById('adminMobileBtn');
    var canAdmin = API.hasPermission(API.PERMS.MANAGE_PRODUCTS); // หรือเช็คสิทธิ์อื่นๆ ที่เกี่ยวข้องกับ Admin
    if (adminBtn) adminBtn.classList.toggle('hidden', !canAdmin);
    if (adMob) adMob.classList.toggle('hidden', !canAdmin);

    // ปุ่ม Manager
    var mgrBtn = document.getElementById('mgrPaneBtn');
    var mgrMob = document.getElementById('mgrMobileBtn');
    if (mgrBtn || mgrMob) {
      var canManage = API.hasPermission(API.PERMS.APPROVE_REQUEST);
      if (mgrBtn) mgrBtn.classList.toggle('hidden', !canManage);
      if (mgrMob) mgrMob.classList.toggle('hidden', !canManage);
    }
  } else {
    if (nameEl) nameEl.textContent = 'เข้าสู่ระบบ';
    if (loginBtn) loginBtn.classList.remove('hidden');
    if (logoutBtn) logoutBtn.classList.add('hidden');
    if (ordersBtn) ordersBtn.classList.add('hidden');
    if (changePwdBtn) changePwdBtn.classList.add('hidden');
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

function initMouseGlow() {
  document.addEventListener('mousemove', function(e) {
    var cards = document.querySelectorAll('.mouse-glow-card');
    cards.forEach(function(card) {
      if (!card.matches(':hover')) return;
      var rect = card.getBoundingClientRect();
      var x = e.clientX - rect.left;
      var y = e.clientY - rect.top;
      card.style.setProperty('--x', x + 'px');
      card.style.setProperty('--y', y + 'px');
    });
  });
}

function triggerConfetti() {
  const container = document.body;
  const colors = ['#fbbf24', '#fff', '#fbbf24', '#f59e0b', '#d97706'];
  for (let i = 0; i < 100; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = Math.random() * 100 + 'vw';
    c.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    c.style.transform = 'rotate(' + (Math.random() * 360) + 'deg)';
    c.style.width = (Math.random() * 10 + 5) + 'px';
    c.style.height = c.style.width;
    container.appendChild(c);

    const destX = (Math.random() - 0.5) * 200;
    const duration = Math.random() * 2 + 3;
    
    // Fallback animation for older browsers if needed, but modern CSS animate works
    c.animate([
      { transform: 'translate(0, 0) rotate(0deg)', opacity: 1 },
      { transform: 'translate(' + destX + 'px, 100vh) rotate(720deg)', opacity: 0 }
    ], {
      duration: duration * 1000,
      easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      fill: 'forwards'
    });
    
    setTimeout(function() { c.remove(); }, duration * 1000);
  }
}

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

function refreshIcons() {
  if (typeof lucide !== 'undefined' && lucide.createIcons) {
    lucide.createIcons();
  } else if (window.lucide && window.lucide.createIcons) {
    window.lucide.createIcons();
  }
}

// ─── ONBOARDING ───────────────────────────────────────────
var Onboarding = {
  steps: [
    { target: '.logo', title: '<i data-lucide="hand"></i> ยินดีต้อนรับ!', body: 'นี่คือระบบภาระงานเบิกพัสดุรูปแบบใหม่ ใช้งานง่ายเหมือนหน้าเว็บ E-Commerce ชั้นนำ' },
    { target: '#loginBtn', title: '<i data-lucide="key"></i> เข้าสู่ระบบ', body: 'เริ่มการใช้งานด้วยการลงชื่อเข้าใช้ด้วยรหัสพนักงานของคุณ' },
    { target: '.search-box', title: '<i data-lucide="search"></i> ค้นหาสินค้า', body: 'ค้นหาสินค้าที่คุณต้องการเบิกได้ทันทีจากช่องค้นหานี้' },
    { target: 'button[onclick*="toggleDrawer"]', title: '<i data-lucide="shopping-cart"></i> ตะกร้าสินค้า', body: 'เมื่อเลือกสินค้าแล้ว รายการจะมาอยู่ในตะกร้านี้เพื่อรอการยืนยัน' }
  ],
  currentStep: 0,
  
  start: function() {
    this.currentStep = 0;
    this.showStep();
  },
  
  showStep: function() {
    var step = this.steps[this.currentStep];
    var targetEl = document.querySelector(step.target);
    
    // Skip if element doesn't exist or is hidden
    if (!targetEl || targetEl.offsetParent === null) { 
      this.next(); 
      return; 
    }
    
    this.cleanup();
    
    var overlay = document.createElement('div');
    overlay.className = 'onboarding-overlay active';
    overlay.id = 'onboard-overlay';
    document.body.appendChild(overlay);
    
    var tooltip = document.createElement('div');
    tooltip.className = 'onboarding-tooltip';
    tooltip.innerHTML = '<div class="onboarding-header" style="display:flex;align-items:center;gap:0.5rem">' + step.title + '</div>'
      + '<div class="onboarding-body">' + step.body + '</div>'
      + '<div class="flex flex-wrap justify-between gap-2">'
      +   '<button class="btn btn-ghost btn-sm" onclick="Onboarding.skip()">ข้าม</button>'
      +   '<button class="btn btn-primary btn-sm" onclick="Onboarding.next()">' + (this.currentStep === this.steps.length - 1 ? 'เสร็จสิ้น' : 'ถัดไป') + '</button>'
      + '</div>';
    
    var rect = targetEl.getBoundingClientRect();
    tooltip.style.top = (rect.bottom + 15) + 'px';
    tooltip.style.left = Math.max(10, Math.min(window.innerWidth - 300, rect.left)) + 'px';
    
    document.body.appendChild(tooltip);
    refreshIcons();
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
  
  // 1. Try to load from Cache first (Instant Render)
  var cached = API.getCached('getStorefrontData');
  if (cached && cached.success) {
    console.log('✨ Stale-While-Revalidate: Instant render from cache');
    allProducts = cached.products || [];
    allCategories = cached.categories || [];
    renderCategories();
    renderProductGrid();
    
    // Quick load branches from cache too if available
    var cachedBranches = API.getCached('getBranches'); 
    if (cachedBranches && cachedBranches.success) allBranches = cachedBranches.data || [];
  } else {
    // Show Skeletons ONLY if no cache exists
    if (grid && (!allProducts || allProducts.length === 0)) {
      grid.innerHTML = Array(8).fill(
        '<div class="skeleton-card">' +
          '<div class="skeleton-image skeleton"></div>' +
          '<div class="skeleton-title skeleton"></div>' +
          '<div class="skeleton-text skeleton"></div>' +
          '<div class="skeleton-price skeleton"></div>' +
        '</div>'
      ).join('');
    }
  }
  
  // 2. Fetch fresh data from network
  API.getStorefrontData().then(function(res) {
    if (res.success) {
      allProducts = res.products || [];
      allCategories = res.categories || [];
      renderCategories();
      renderProductGrid();
      
      // Initialize Searchable selects
      initSearchableSelect('searchType');
      initSearchableSelect('headerCategoryFilter');
      initSearchableSelect('stockFilter');
      
      // Fetch fresh Branches (usually public or low-privilege)
      API.getBranches().then(function(r) {
        if (r.success) allBranches = r.data || [];
      }).catch(function(e){ console.warn('Branches fetch skipped:', e); });

      // Sync system settings for all users to ensure UI permissions are up-to-date
      if (currentUser) {
        API.getSystemSettings().then(function(sRes) {
          globalSystemSettings = sRes.data || {};
          updateUserUI(); // Refresh UI with fresh settings
        }).catch(function(e) { 
          console.warn('System settings sync skipped:', e); 
        });
      }
    }
  }).catch(function(err) {
    // Only show error toast if we don't even have cached data
    if (!allProducts || allProducts.length === 0) {
      showToast('โหลดข้อมูลไม่สำเร็จ: ' + err, 'error');
    }
    console.error('Storefront fetch error:', err);
  });
}

// Global state for suggestion index and debounce
var currentSuggestionIdx = -1;
var searchDebounceTimer = null;

function handleSearchInput(val, e) {
  var dropdown = document.getElementById('searchSuggestions');
  var input = document.getElementById('searchInput');
  if (!dropdown) return;
  
  // Handle Keyboard Navigation (Keep synchronous for responsiveness)
  if (e && e.key && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter')) {
    var items = dropdown.querySelectorAll('.suggestion-item');
    if (items.length > 0) {
      if (e.key === 'ArrowDown') {
        currentSuggestionIdx = (currentSuggestionIdx + 1) % items.length;
        updateSuggestionFocus(items);
        e.preventDefault();
      } else if (e.key === 'ArrowUp') {
        currentSuggestionIdx = (currentSuggestionIdx - 1 + items.length) % items.length;
        updateSuggestionFocus(items);
        e.preventDefault();
      } else if (e.key === 'Enter') {
        if (currentSuggestionIdx > -1) {
          items[currentSuggestionIdx].click();
        } else {
          dropdown.classList.remove('active');
          renderProductGrid();
        }
        e.preventDefault();
      }
      return;
    } else if (e.key === 'Enter') {
      // Normal enter search
      dropdown.classList.remove('active');
      renderProductGrid();
      e.preventDefault();
      return;
    }
  }

  // Clear existing timer for debouncing
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  
  var q = (val || '').toLowerCase().trim();
  currentSuggestionIdx = -1; 

  // Wait 400ms after typing before searching (or fast if empty)
  searchDebounceTimer = setTimeout(function() {
    var matches = allProducts;
    
    if (q) {
      matches = allProducts.filter(function(p) {
        var searchStr = ((p.name || '') + ' ' + (p.productId || '')).toLowerCase();
        return searchStr.indexOf(q) !== -1;
      });
    }
    
    // Limits
    var displayMatches = q ? matches.slice(0, 8) : matches.slice(0, 20);
    
    if (displayMatches.length === 0) {
      dropdown.innerHTML = '<div class="suggestion-item" style="opacity:0.5; padding:1rem; text-align:center; cursor:default">ไม่พบสินค้า</div>';
      dropdown.classList.add('active');
      renderProductGrid(); 
      return;
    }
    
    var headerText = q ? 'ผลการค้นหา' : 'รายการสินค้าแนะนำ';
    var headerIcon = q ? 'search' : 'list';
    var headerHtml = '<div class="suggestion-header"><i data-lucide="' + headerIcon + '"></i><span>' + headerText + '</span></div>';
    
    dropdown.innerHTML = headerHtml + displayMatches.map(function(p, i) {
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

      return '<div class="suggestion-item" data-index="' + i + '" onclick="selectSuggestion(\'' + productId + '\')">'
        + '<i data-lucide="package" style="width:14px;height:14px;opacity:0.6"></i>'
        + '<span>' + displayName + '</span>'
        + '<small style="margin-left:auto;opacity:0.5">' + displayId + '</small>'
        + '</div>';
    }).join('');
    
    dropdown.classList.add('active');
    renderProductGrid(); 
    refreshIcons();
  }, q ? 400 : 50);
}


function updateSuggestionFocus(items) {
  items.forEach(function(item, i) {
    item.classList.toggle('focused', i === currentSuggestionIdx);
    if (i === currentSuggestionIdx) item.scrollIntoView({ block: 'nearest' });
  });
}

function selectSuggestion(pid) {
  var p = allProducts.find(function(x) { return String(x.productId) === String(pid); });
  if (p) {
    document.getElementById('searchInput').value = p.name;
    document.getElementById('searchSuggestions').classList.remove('active');
    renderProductGrid();
  }
}

/* Removed handleBranchSearch and selectBranch in favor of searchable select component */

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
      if (list) list.innerHTML = '<div class="empty-state"><i data-lucide="lock" style="width:48px;height:48px"></i><p>ต้องเข้าสู่ระบบ</p><button class="btn btn-primary btn-sm" style="margin-top:1rem" onclick="navigateTo(\'login.html\')">ไปหน้าเข้าสู่ระบบ</button></div>';
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
  var sel = document.getElementById('headerCategoryFilter');
  if (!sel) return;
  
  // Dedup by categoryId
  var seen = {};
  var unique = allCategories.filter(function(c) {
    var cid = c.id || c.categoryId;
    if (!cid || seen[cid]) return false;
    seen[cid] = true;
    return true;
  });
  
  var cats = [{ categoryId: 'all', name: 'ทุกหมวดหมู่' }].concat(unique);
  sel.innerHTML = cats.map(function(c) {
    var cid = c.id || c.categoryId;
    return '<option value="' + (cid || "") + '" ' + (currentCategory === cid ? 'selected' : '') + '>' + c.name + '</option>';
  }).join('');

  // Reinitalize searchable select if it exists
  if (typeof initSearchableSelect === 'function') {
    initSearchableSelect('headerCategoryFilter');
  }
}

function onStoreCategoryChange(catId) {
  filterCategory(catId);
}

function filterCategory(catId) {
  currentCategory = catId;
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
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1">' +
      '<i data-lucide="package-search"></i>' +
      '<p>ไม่พบสินค้าที่ตรงกัน</p>' +
      '<small>ลองเปลี่ยนคำค้นหาหรือเลือกหมวดหมู่ใหม่อีกครั้งครับ</small>' +
      clearBtn + 
    '</div>';
    document.getElementById('productPagination').innerHTML = '';
    refreshIcons();
    return;
  }

  // --- Apply Pagination ---
  // Apply category permission filtering
  filtered = filtered.filter(function(p) {
    return hasPermission('view_category', p.categoryId);
  });

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
      ? '<img src="' + imgUrl + '" class="product-img' + (outOfStock ? ' out-of-stock-img' : '') + '" alt="' + escapeHTML(p.name) + '" loading="lazy" onerror="this.onerror=null;this.src=\'\';this.parentElement.innerHTML=\'<div class=\\\'product-img-placeholder\\\'><i data-lucide=\\\'package\\\' style=\\\'width:32px;height:32px;opacity:0.3\\\'></i></div>\'">'
      : '<div class="product-img-placeholder"><i data-lucide="package" aria-hidden="true" style="width:32px;height:32px;opacity:0.3"></i></div>';

    return '<div class="product-card" ' + (outOfStock ? 'style="opacity:0.6"' : '') + '>'
      + '<div class="product-img-wrap" onclick="openProductDetail(\'' + escapeHTML(p.productId) + '\')">' + imgHtml + '</div>'
      + '<div class="product-info">'
      +   '<div class="product-name" style="cursor:pointer" onclick="openProductDetail(\'' + escapeHTML(p.productId) + '\')">' + escapeHTML(p.name) + '</div>'
      +   '<div class="product-stock"><span class="product-stock-dot' + (outOfStock ? ' out' : '') + '"></span>' + (outOfStock ? '<span style="color:var(--danger)">หมดสต็อก</span>' : 'คงเหลือ: ' + Number(p.stock) + ' ชิ้น') + '</div>'
      +   '<div class="flex flex-wrap items-center justify-between gap-2" style="margin-top:auto">'
      +     '<div class="product-price">' + (hasPermission('view_prices') ? '฿' + Number(p.price).toLocaleString() : '***') + '</div>'
      +     (hasPermission('can_request') 
              ? '<button class="btn btn-sm ' + (outOfStock ? 'btn-outline' : 'btn-primary') + '" '
                + (outOfStock ? 'disabled' : 'onclick="' + (p.sizes ? 'openProductDetail(\'' + escapeHTML(p.productId) + '\')' : 'addToCart(\'' + escapeHTML(p.productId) + '\', event)') + '"')
                + ' style="border-radius:99px; padding: 0.4rem 1rem;' + (outOfStock ? '' : 'background:var(--gradient-gold);color:#000;border:none;') + '">' + (outOfStock ? 'หมด' : (p.sizes ? 'เลือกไซส์' : '+ เบิกสินค้า')) + '</button>'
              : '<div style="font-size:0.75rem; color:var(--danger)">🔒 ไม่มีสิทธิ์เบิก</div>'
            )
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
    +     '<div class="product-price" style="font-size:1.8rem">' + (hasPermission('view_prices') ? '฿' + Number(p.price).toLocaleString() : '***') + '</div>'
    +   '</div>'
    +   (hasPermission('can_request') 
          ? '' 
          : '<div class="alert alert-danger" style="margin-bottom:1rem; padding:0.75rem; border-radius:8px; font-size:0.85rem">⚠️ คุณไม่มีสิทธิ์ในการเบิกสินค้าชิ้นนี้หรือหมวดหมู่นี้</div>'
        )
    +   '<div class="card glass" style="margin-bottom:1.5rem;padding:1.25rem;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05)">'
    +     '<div style="font-size:0.85rem;color:var(--text3);margin-bottom:0.75rem">สถานะคลังสินค้า</div>'
    +     '<div id="detail-stock-status" style="display:flex;align-items:center;gap:0.5rem;margin-bottom:1rem">'
    +       '<div style="width:12px;height:12px;border-radius:50%;background:' + (Number(p.stock) > 0 ? 'var(--accent)' : 'var(--danger)') + '"></div>'
    +       '<span id="detail-stock-count" style="font-weight:700;font-size:1.1rem">' + p.stock + ' ชิ้น</span>'
    +       '<span id="detail-stock-label" style="font-size:0.9rem;color:var(--text3)">' + (Number(p.stock) > 0 ? 'พร้อมเบิก (รวมทุกไซส์)' : 'หมดสต็อก') + '</span>'
    +     '</div>'
    +     (function() {
            var vs = p.variantStock;
            var vStock = {};
            try { 
              if (vs) vStock = (typeof vs === 'string' && vs.startsWith('{')) ? JSON.parse(vs) : vs; 
            } catch(e) {}
            
            var sizeKeys = p.sizes ? p.sizes.split(',').map(function(s){return s.trim();}).filter(function(s){return s!=='';}) : Object.keys(vStock);
            if (sizeKeys.length === 0) return '';

            var gridHtml = '<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(70px, 1fr)); gap:0.5rem; border-top:1px solid rgba(255,255,255,0.05); padding-top:0.75rem">';
            sizeKeys.forEach(function(s) {
              var sQty = vStock[s] !== undefined ? Number(vStock[s]) : 0;
              var isOut = sQty <= 0;
              gridHtml += '<div id="stock-grid-' + s + '" class="stock-grid-item" style="background:rgba(255,255,255,0.03); padding:8px 4px; border-radius:12px; text-align:center; border:1px solid ' + (isOut ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255,255,255,0.05)') + '; transition:all 0.2s">' +
                '<div style="font-size:0.7rem; color:var(--text3); font-weight:700; margin-bottom:2px; text-transform:uppercase">' + s + '</div>' +
                '<div style="font-size:1rem; font-weight:800; color:' + (isOut ? 'var(--danger)' : 'var(--text)') + '">' + sQty + '</div>' +
                '</div>';
            });
            gridHtml += '</div>';
            return gridHtml;
          })()
    +   '</div>'
    +   '<div style="margin-bottom:1.5rem">'
    +     '<h3 style="font-size:1rem;font-weight:700;margin-bottom:0.75rem">รายละเอียดสินค้า</h3>'
    +     '<p style="color:var(--text2);line-height:1.6;font-size:0.95rem">' + (p.description || 'ไม่มีรายละเอียดเพิ่มเติมสำหรับสินค้านี้') + '</p>'
    +   '</div>';

  // --- Size Selection Logic ---
  var sizes = p.sizes;
  if (!sizes && p.variantStock) {
    try {
      var vsObj = (typeof p.variantStock === 'string' && p.variantStock.startsWith('{')) ? JSON.parse(p.variantStock) : p.variantStock;
      sizes = Object.keys(vsObj).join(', ');
    } catch(e) {}
  }

  if (sizes) {
    var sizeList = sizes.split(',').map(function(s) { return s.trim(); }).filter(function(s) { return s !== ''; });
    if (sizeList.length > 0) {
      var sizeHtml = '<div style="margin-bottom:1.5rem">'
        + '<h3 style="font-size:0.9rem;font-weight:700;margin-bottom:0.75rem">เลือกไซส์:</h3>'
        + '<div class="choice-chips" id="size-selector-container">'
        + sizeList.map(function(s) {
            var vs = p.variantStock;
            var vStock = {};
            if (vs) {
                try { vStock = (typeof vs === 'string' && vs.startsWith('{')) ? JSON.parse(vs) : vs; } catch(e) {}
            }
            var sStock = vStock[s] !== undefined ? Number(vStock[s]) : -1; 
            var sOut = sStock === 0;
            
            return '<div class="choice-chip' + (sOut ? ' out-of-stock' : '') + '" '
                + 'onclick="if(!this.classList.contains(\'out-of-stock\')) selectProductSize(this, \'' + escapeHTML(s) + '\', \'' + escapeHTML(p.productId) + '\')">' 
                + '<span>' + s + '</span>'
                + (sOut ? '<div class="badge-soldout">หมด</div>' : '')
                + '</div>';
          }).join('')
        + '</div><input type="hidden" id="selected-product-size"></div>';
      body.innerHTML += sizeHtml;

      // Auto-select first available size
      setTimeout(function() {
        var firstChip = document.querySelector('#size-selector-container .choice-chip:not(.out-of-stock)');
        if (firstChip) {
          var s = sizeList.find(function(val) {
             var vs = p.variantStock;
             var vStock = {};
             if (vs) { try { vStock = (typeof vs === 'string' && vs.startsWith('{')) ? JSON.parse(vs) : vs; } catch(e) {} }
             return (vStock[val] === undefined || Number(vStock[val]) > 0);
          });
          if (s) selectProductSize(firstChip, s, p.productId);
        }
      }, 50);
    }
  }

  body.innerHTML += '</div>';
  
  var btn = document.getElementById('detailAddToCartBtn');
  var outOfStock = Number(p.stock) <= 0;
  var canReq = hasPermission('can_request');
  
  if (!canReq) {
    btn.disabled = true;
    btn.style.opacity = '0.5';
    btn.innerHTML = '<i data-lucide="lock" style="width:18px;height:18px"></i> ไม่มีสิทธิ์เบิก';
  } else {
    btn.disabled = outOfStock;
    btn.style.opacity = outOfStock ? '0.5' : '1';
    btn.onclick = function() { 
      var size = document.getElementById('selected-product-size') ? document.getElementById('selected-product-size').value : null;
      var hasSizes = !!document.getElementById('size-selector-container');
      if (hasSizes && !size) {
        showToast('กรุณาเลือกไซส์ก่อนเพิ่มลงตะกร้า', 'warning');
        return;
      }
      addToCart(p.productId, null, size); 
      closeModal('productDetailModal'); 
      toggleDrawer('cartDrawer'); 
    };
    btn.innerHTML = outOfStock ? 'สินค้าหมด' : '<i data-lucide="shopping-cart" style="width:18px;height:18px"></i> เพิ่มลงตะกร้า';
  }
  
  document.getElementById('productDetailModal').classList.add('open');
  refreshIcons();
}

var isUpdatingSize = false;
function selectProductSize(el, size, productId) {
  if (isUpdatingSize) return;
  isUpdatingSize = true;
  
  try {
    // 1. Clear all active chips in the current modal to ensure mutual exclusivity
    var modal = el.closest('.modal');
    var allChips = modal ? modal.querySelectorAll('.choice-chip') : document.querySelectorAll('.choice-chip');
    
    allChips.forEach(function(c) { 
      c.classList.remove('active'); 
      var existingCheck = c.querySelector('.check-icon');
      if (existingCheck) existingCheck.remove();
    });
    
    // 2. Set the current one to active
    el.classList.add('active');
    el.insertAdjacentHTML('beforeend', '<i class="check-icon" data-lucide="check" style="width:12px;height:12px;margin-left:6px;display:inline-block"></i>');
    if (typeof lucide !== 'undefined') lucide.createIcons();
    
    document.getElementById('selected-product-size').value = size;
    
    // 3. Update stock display for this size
    var p = allProducts.find(function(x) { return String(x.productId) === String(productId); });
    if (p) {
      var vs = p.variantStock;
      var vStock = {};
      if (vs) {
        try { vStock = (typeof vs === 'string' && vs.startsWith('{')) ? JSON.parse(vs) : vs; } catch(e) {}
      }
      
      var sStock = vStock[size] !== undefined ? Number(vStock[size]) : Number(p.stock);
      var countEl = document.getElementById('detail-stock-count');
      var labelEl = document.getElementById('detail-stock-label');
      var statusEl = document.getElementById('detail-stock-status');
      
      if (countEl) countEl.textContent = sStock + ' ชิ้น';
      if (labelEl) labelEl.textContent = 'คงเหลือในไซส์ ' + size;
      if (statusEl) {
        var dot = statusEl.querySelector('div');
        if (dot) dot.style.background = sStock > 0 ? 'var(--accent)' : 'var(--danger)';
      }

      // Highlight in grid
      document.querySelectorAll('.stock-grid-item').forEach(function(item) {
        item.style.background = 'rgba(255,255,255,0.03)';
        item.style.borderColor = 'rgba(255,255,255,0.05)';
        item.style.transform = 'scale(1)';
      });
      var gridItem = document.getElementById('stock-grid-' + size);
      if (gridItem) {
        gridItem.style.background = sStock > 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)';
        gridItem.style.borderColor = sStock > 0 ? 'var(--accent)' : 'var(--danger)';
        gridItem.style.transform = 'scale(1.05)';
      }
      
      // Update Add to Cart button
      var btn = document.getElementById('detailAddToCartBtn');
      if (btn && hasPermission('can_request')) {
        var out = sStock <= 0;
        btn.disabled = out;
        btn.style.opacity = out ? '0.5' : '1';
        btn.innerHTML = out ? 'ไซส์นี้หมด' : '<i data-lucide="shopping-cart" style="width:18px;height:18px"></i> เพิ่มลงตะกร้า';
      }
    }
  } catch(err) {
    console.error('selectProductSize error:', err);
  } finally {
    setTimeout(function() { isUpdatingSize = false; }, 50);
  }
}

/**
 * getImageUrl - แปลงลิงก์ Google Drive หลากหลายรูปแบบให้เป็น Direct Link ที่เสถียร
 */
function getImageUrl(url) {
  if (!url) return '';
  if (typeof url !== 'string') return '';
  // หากเป็นลิงก์ Google Drive หรือ googleusercontent
  if (url.indexOf('drive.google.com') !== -1 || url.indexOf('googleusercontent.com') !== -1) {
    var id = '';
    if (url.indexOf('id=') !== -1) {
      id = url.split('id=')[1].split('&')[0];
    } else if (url.indexOf('/d/') !== -1) {
      id = url.split('/d/')[1].split('/')[0];
    } else if (url.indexOf('googleusercontent.com') !== -1) {
      var parts = url.split('/');
      id = parts[parts.length - 1].split('=')[0];
    }
    
    if (id) {
      // ใช้ thumbnail endpoint ของ Google Drive ซึ่งเสถียรที่สุดสำหรับการแสดงผลในเว็บ
      return 'https://drive.google.com/thumbnail?id=' + id + '&sz=w1000';
    }
  }
  return url;
}

function addToCart(productId, event, size) {
  if (!currentUser) {
    var modal = document.getElementById('loginGateModal');
    if (modal) { modal.classList.add('open'); refreshIcons(); }
    return;
  }
  var product = allProducts.filter(function(p) { return String(p.productId) === String(productId); })[0];
  if (product) {
    // If it has sizes but no size provided, force detail modal
    if (product.sizes && !size) {
      openProductDetail(productId);
      return;
    }
    Cart.add(product, size);
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
function loadMyOrders() {
  var list = document.getElementById('myOrdersList');
  if (!list) return;
  
  // 1. Render from Cache first for instant response
  if (myOrdersCache) {
    renderOrderList(myOrdersCache);
  } else {
    list.innerHTML = Array(3).fill('<div class="order-card" style="display:flex; flex-direction:column; gap:0.75rem">'
      + '<div class="flex flex-wrap items-center justify-between gap-2"><div class="skeleton skeleton-text" style="width:120px; margin:0"></div><div class="skeleton" style="width:80px; height:24px; border-radius:12px"></div></div>'
      + '<div class="flex flex-wrap items-center justify-between gap-2" style="margin-top:0.5rem"><div class="skeleton skeleton-text" style="width:150px; margin:0"></div><div class="skeleton skeleton-text" style="width:80px; margin:0"></div></div>'
      + '</div>').join('');
  }

  // 2. Fetch fresh data in background
  API.getMyRequests().then(function(res) {
    myOrdersCache = res.data;
    renderOrderList(res.data);
  }).catch(function(err) {
    if (!myOrdersCache) {
      list.innerHTML = '<div class="empty-state"> '
        + '<div style="color:var(--danger); display:flex; align-items:center; gap:0.5rem; justify-content:center"><i data-lucide="alert-octagon"></i> โหลดข้อมูลไม่สำเร็จ</div>'
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
      + '<div class="flex flex-wrap items-center justify-between gap-2" style="margin-bottom:0.75rem">'
      +   '<div style="font-weight:600">#' + o.orderId + '</div>'
      +   '<div class="badge ' + bc + '">' + (o.statusLabel || o.status) + '</div>'
      + '</div>'
      + '<div class="flex flex-wrap items-center justify-between gap-2" style="font-size:0.9rem">'
      +   '<div style="font-size:0.85rem;color:var(--text3);margin-bottom:0.75rem"><i data-lucide="clock" style="width:14px;height:14px"></i> ' + (o.createdAt || '-') + '</div>'
      +   '<div class="flex flex-wrap items-center justify-between gap-2">'
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
  body.innerHTML = '<div class="skeleton sk-line" style="height:30px"></div><div class="skeleton sk-line sk-line-short"></div>';
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
        var sizeInfo = i.size ? ' <span class="badge badge-pending" style="font-size:0.7rem; padding:0.1rem 0.4rem; vertical-align:middle; margin-left:0.4rem">' + i.size + '</span>' : '';
        return '<tr><td>' + i.productName + sizeInfo + '</td><td class="text-center">' + i.quantity + '</td>'
          + '<td class="text-right" style="font-weight:600">฿' + (Number(i.price) * Number(i.quantity)).toLocaleString() + '</td></tr>';
      }).join('')
      + '</tbody></table></div>';

    if (order && order.signature) {
      html += '<div style="margin-top:1.5rem;text-align:center;border-top:1px solid var(--border);padding-top:1rem">'
        + '<p style="font-size:0.8rem;color:var(--text3);display:flex;align-items:center;justify-content:center;gap:0.4rem"><i data-lucide="pen-tool"></i> ลายเซ็นรับของ:</p>'
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

  var options = {};
  var useTeamStock = hasPermission('manage_team_substock') && currentUser && currentUser.teamId;
  if (useTeamStock) {
    options.teamId = currentUser.teamId;
  }

  API.getSubStock(options).then(function(res) {
    subStockCache = res.data;
    renderSubStock(res.data, useTeamStock ? res.teamName : null);
  }).catch(function(err) {
    showToast('โหลดสต๊อกย่อยไม่สำเร็จ: ' + err, 'error');
  });
}

function renderSubStock(data, teamName) {
  var grid = document.getElementById('subStockGrid');
  if (!grid) return;

  var titleEl = document.querySelector('#view-substock h2');
  if (titleEl) {
    if (teamName) {
      titleEl.innerHTML = '<i data-lucide="users" style="color:var(--primary)"></i> คลังย่อยทีม: ' + teamName;
    } else {
      titleEl.innerHTML = '<i data-lucide="package-search"></i> คลังย่อยของฉัน';
    }
    refreshIcons();
  }

  if (!data || data.length === 0) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><p>ไม่มีสินค้าในคลังย่อย' + (teamName ? 'ของทีม' : '') + '</p></div>';
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
      +   '<div class="product-name">' + item.productName + (item.size ? ' <span class="badge" style="font-size:0.7rem; padding:2px 6px">' + item.size + '</span>' : '') + '</div>'
      +   '<div class="product-stock">คงเหลือ: <span id="ss-qty-' + item.productId + '-' + (item.size || 'default') + '">' + item.quantity + '</span></div>'
      +   '<div style="margin-top:1rem; display:flex; gap:0.5rem; flex-wrap:wrap">'
      +     '<button class="btn btn-primary btn-sm flex-1" onclick="openActionModal(\'use\', \'' + item.productId + '\', \'' + item.productName.replace(/'/g, "\\'") + '\', ' + item.quantity + ', \'' + (item.size || '') + '\')"><i data-lucide="sparkles" style="width:14px;height:14px"></i> เบิกใช้งาน</button>'
      +     '<button class="btn btn-outline btn-sm" title="โอนให้เพื่อน" onclick="openActionModal(\'transfer\', \'' + item.productId + '\', \'' + item.productName.replace(/'/g, "\\'") + '\', ' + item.quantity + ', \'' + (item.size || '') + '\')"><i data-lucide="repeat" style="width:14px;height:14px"></i> โอน</button>'
      +     '<button class="btn btn-ghost btn-sm" title="คืนคลังหลัก" onclick="openActionModal(\'return\', \'' + item.productId + '\', \'' + item.productName.replace(/'/g, "\\'") + '\', ' + item.quantity + ', \'' + (item.size || '') + '\')"><i data-lucide="archive" style="width:14px;height:14px"></i> คืน</button>'
      +   '</div>'
      + '</div>'
      + '</div>';
  }).join('');
  refreshIcons();
}

var _activeAction = null;

function openActionModal(action, productId, productName, maxQty, size) {
  _activeAction = { type: action, productId: productId, max: maxQty, size: size };
  var mTitle = document.getElementById('actionModalTitle');
  var mDesc = document.getElementById('actionModalDesc');
  var inputWrap = document.getElementById('actionModalInputWrap');
  var inputEl = document.getElementById('actionModalInput');
  var qtyEl = document.getElementById('actionModalQty');
  
  qtyEl.value = '1';
  qtyEl.max = maxQty;
  inputWrap.classList.add('hidden');
  var bWrap = document.getElementById('actionModalBranchWrap');
  bWrap.classList.add('hidden');
  inputEl.value = '';
  
  var bSelect = document.getElementById('actionModalBranch');
  bSelect.value = '';
  
  // Populate Branches
  var opts = '<option value="">-- เลือกสาขาที่ใช้งาน --</option>';
  if (window.allBranches && allBranches.length > 0) {
    allBranches.forEach(function(b) {
      var name = b.name || b;
      var id = b.branchId || '';
      var displayText = id ? '[' + id + '] ' + name : name;
      opts += '<option value="' + (id || name) + '">' + displayText + '</option>';
    });
  }
  bSelect.innerHTML = opts;

  
  if (action === 'use') {
    mTitle.innerHTML = '<i data-lucide="sparkles" style="width:18px;height:18px;color:var(--primary);"></i> นำไปใช้งานจริง';
    mDesc.innerHTML = 'คุณกำลังจะตัดยอด <b>' + productName + '</b> ออกจากคลังย่อยเพื่อนำไปใช้งาน';
    document.getElementById('actionModalBranchWrap').classList.remove('hidden');
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
  if (_activeAction.type === 'use') {
    initSearchSelect('actionModalBranch');
  }
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
    var branch = document.getElementById('actionModalBranch').value.trim();
    if (!branch) { btn.disabled=false; btn.innerHTML='ยืนยัน'; showToast('กรุณาระบุสาขาหรือหน่วยงาน', 'warning'); return; }
    promise = API.deductSubStock(_activeAction.productId, qty, branch, _activeAction.size);
  } else if (_activeAction.type === 'transfer') {

    var toId = document.getElementById('actionModalInput').value.trim();
    if (!toId) { btn.disabled=false; btn.innerHTML='ยืนยัน'; showToast('กรุณาระบุรหัสพนักงานเป้าหมาย', 'warning'); return; }
    promise = API.transferSubStock({ toEmployeeId: toId, productId: _activeAction.productId, qty: qty, size: _activeAction.size });
  } else if (_activeAction.type === 'return') {
    promise = API.returnToMainStock({ productId: _activeAction.productId, qty: qty, size: _activeAction.size });
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
  
  var iconMap = {
    'success': 'check-circle',
    'error': 'alert-circle',
    'warning': 'alert-triangle',
    'info': 'info'
  };
  var icon = iconMap[type] || 'info';
  
  t.innerHTML = '<div style="display:flex;align-items:center;gap:0.75rem">'
    + '<i data-lucide="' + icon + '" style="width:18px;height:18px"></i>'
    + '<span>' + msg + '</span>'
    + '</div>';
    
  container.appendChild(t);
  if (typeof lucide !== 'undefined') lucide.createIcons();
  
  setTimeout(function() {
    t.classList.add('fade-out');
    setTimeout(function() { t.remove(); }, 500);
  }, 4000);
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
        var sizeInfo = i.size ? ' <span class="badge badge-pending" style="font-size:0.7rem; padding:0.1rem 0.4rem; vertical-align:middle; margin-left:0.4rem">' + i.size + '</span>' : '';
        return '<tr><td>' + i.name + sizeInfo + '</td><td class="text-center">' + i.qty + '</td><td class="text-right" style="font-weight:600;color:var(--accent)">฿' + (i.price * i.qty).toLocaleString() + '</td></tr>';
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

  var itemsPayload = items.map(function(i) { return { productId: i.productId, qty: i.qty, size: i.size || '' }; });
  var requestData = {
    items: itemsPayload,
    teamId: currentUser.teamId || null
  };

  API.createRequest(requestData)
    .then(function(res) {
      closeModal('checkoutModal');
      triggerConfetti();
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

var scriptUrl = 'index.html';

// ─── SEARCHABLE SELECT UTILITY ────────────────────────────
function initSearchableSelect(selectId) {
  var select = document.getElementById(selectId);
  if (!select) return;

  var oldWrapper = select.parentElement.querySelector('.search-select-wrapper');
  if (oldWrapper) oldWrapper.remove();

  var wrapper = document.createElement('div');
  wrapper.className = 'search-select-wrapper minimal'; // Added minimal class for storefront
  select.style.display = 'none';
  select.parentNode.insertBefore(wrapper, select);
  wrapper.appendChild(select);

  var input = document.createElement('input');
  input.type = 'text';
  input.className = 'search-select-input';
  input.placeholder = 'ค้นหา...';
  input.autocomplete = 'off';

  var dropdown = document.createElement('div');
  dropdown.className = 'search-select-dropdown';

  wrapper.appendChild(input);
  wrapper.appendChild(dropdown);

  input.value = select.options[select.selectedIndex] ? select.options[select.selectedIndex].text : '';

  input.addEventListener('focus', function() {
    renderDropdown();
    dropdown.classList.add('active');
  });

  document.addEventListener('click', function(e) {
    if (!wrapper.contains(e.target)) {
      dropdown.classList.remove('active');
      input.value = select.options[select.selectedIndex] ? select.options[select.selectedIndex].text : '';
    }
  });

  input.addEventListener('input', function() {
    renderDropdown(input.value);
  });

  function renderDropdown(filter) {
    var options = Array.from(select.options);
    var filtered = options.filter(function(opt) {
      if (!filter) return true;
      return opt.text.toLowerCase().includes(filter.toLowerCase());
    });

    if (filtered.length === 0) {
      dropdown.innerHTML = '<div class="search-select-item" style="opacity:0.5; cursor:default">ไม่พบข้อมูล</div>';
    } else {
      dropdown.innerHTML = filtered.map(function(opt) {
        var isSelected = opt.value === select.value;
        return '<div class="search-select-item ' + (isSelected ? 'selected' : '') + '" data-value="' + opt.value + '">' + opt.text + '</div>';
      }).join('');

      dropdown.querySelectorAll('.search-select-item').forEach(function(item) {
        item.addEventListener('click', function() {
          select.value = item.getAttribute('data-value');
          input.value = item.innerText;
          dropdown.classList.remove('active');
          select.dispatchEvent(new Event('change'));
        });
      });
    }
  }
}

// Global Keyboard Accessibility
window.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    // Close any open modal
    var openModal = document.querySelector('.modal-overlay.open');
    if (openModal) {
      closeModal(openModal.id);
    }
    // Close cart drawer if open
    var drawer = document.getElementById('cartDrawer');
    if (drawer && drawer.classList.contains('open')) {
      toggleDrawer('cartDrawer');
    }
  }
});

// ─── DRAG TO SCROLL (FOR TABS & CATEGORIES) ────────────────
function initDragScroll(selector) {
  const sliders = document.querySelectorAll(selector);
  sliders.forEach(slider => {
    let isDown = false;
    let startX;
    let scrollLeft;
    let hasMoved = false;

    slider.addEventListener('mousedown', (e) => {
      isDown = true;
      hasMoved = false;
      startX = e.pageX - slider.offsetLeft;
      scrollLeft = slider.scrollLeft;
    });

    slider.addEventListener('mouseleave', () => {
      isDown = false;
      slider.classList.remove('drag-scroll-active');
    });

    slider.addEventListener('mouseup', () => {
      isDown = false;
      slider.classList.remove('drag-scroll-active');
    });

    slider.addEventListener('mousemove', (e) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - slider.offsetLeft;
      const walk = (x - startX) * 2; // Scroll speed factor
      
      // Only consider it a drag if moved more than 10px
      if (Math.abs(x - startX) > 10) {
        hasMoved = true;
        slider.classList.add('drag-scroll-active');
      }
      
      if (hasMoved) {
        slider.scrollLeft = scrollLeft - walk;
      }
    });

    // Handle clicks during drag (don't trigger tab change if dragged)
    slider.addEventListener('click', (e) => {
      if (hasMoved) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);
  });
}

// Initialize for category filters on DOM load
document.addEventListener('DOMContentLoaded', function() {
  initDragScroll('.cat-filter');
});

// ─── PREMIUM UX: MOBILE TABLE AUTO-LABELLER ──────────────────
function initMobileTableLabeller() {
  function applyLabels(table) {
    if (table.dataset.labelled === "true") return;
    var headers = Array.from(table.querySelectorAll('thead th')).map(th => th.innerText.trim());
    if (headers.length === 0) return;
    
    // Check if it should be responsive
    if (!table.closest('.table-responsive-premium') && !table.parentElement.classList.contains('table-wrap')) {
        // Upgrade existing table-wraps to use our premium responsive rules
        if(table.parentElement) table.parentElement.classList.add('table-responsive-premium');
    }

    table.querySelectorAll('tbody tr').forEach(tr => {
      Array.from(tr.querySelectorAll('td')).forEach((td, i) => {
        if (headers[i] && !td.getAttribute('data-label')) {
          td.setAttribute('data-label', headers[i]);
        }
      });
    });
    // Mark as processed (re-evaluates if innerHTML is fully replaced)
    table.dataset.labelled = "true";
  }

  // Initial pass
  document.querySelectorAll('table').forEach(applyLabels);

  // Watch for dynamically rendered tables
  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      if (mutation.addedNodes.length) {
        // Apply to any new tables
        document.querySelectorAll('table').forEach(applyLabels);
      }
    });
  });
  
  observer.observe(document.body, { childList: true, subtree: true });
}

// Start watching when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMobileTableLabeller);
} else {
  initMobileTableLabeller();
}

// ─── SUB-STOCK SCANNER ────────────────────────────────────
var substockScanner = null;

function openSubStockScanner() {
  document.getElementById('subStockScannerModal').classList.add('open');
  document.getElementById('substockScannerPlaceholder').style.display = 'flex';
  refreshIcons();
}

function closeSubStockScanner() {
  if (substockScanner) {
    substockScanner.stop().then(function() {
      substockScanner = null;
    }).catch(function(err) { console.error('Stop scanner error:', err); });
  }
  document.getElementById('subStockScannerModal').classList.remove('open');
}

function startSubStockScan() {
  if (typeof Html5Qrcode === 'undefined') {
    showToast('กำลังโหลดระบบสแกนเนอร์...', 'info');
    return;
  }
  
  document.getElementById('substockScannerPlaceholder').style.display = 'none';
  substockScanner = new Html5Qrcode("substock-reader");

  var config = { 
    fps: 10, 
    qrbox: { width: 250, height: 250 },
    aspectRatio: 1.0
  };

  substockScanner.start(
    { facingMode: "environment" }, 
    config,
    function(decodedText) {
      // Success callback
      onSubStockScanned(decodedText);
    },
    function(err) {
      // Error callback (optional, silences constant frame errors)
    }
  ).catch(function(err) {
    console.error('Scanner start error:', err);
    showToast('ไม่สามารถเปิดกล้องได้: ' + err, 'error');
    document.getElementById('substockScannerPlaceholder').style.display = 'flex';
  });
}

function onSubStockScanned(code) {
  if (!code) return;
  
  // 1. Play success sound/vibration
  if (navigator.vibrate) navigator.vibrate(100);
  
  // 2. Stop scanner
  closeSubStockScanner();
  
  // 3. Find item in current sub-stock data
  if (!currentSubStockData) {
    showToast('ไม่พบข้อมูลคลังย่อยในขณะนี้', 'warning');
    return;
  }
  
  var item = currentSubStockData.find(function(i) {
    return String(i.productId).toLowerCase() === String(code).toLowerCase();
  });
  
  if (item) {
    showToast('พบสินค้า: ' + item.productName, 'success');
    openActionModal('use', item.productId, item.productName, item.quantity, item.size || '');
  } else {
    showToast('ไม่พบรหัส "' + code + '" ในคลังย่อยของคุณ', 'warning');
  }
}

