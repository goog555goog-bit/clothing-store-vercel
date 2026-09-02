
    var currentAdminPage = sessionStorage.getItem('currentAdminPage') || 'dashboard';
    var allEmployees = [];
    var allAdminCategories = [];
    var allAdminDepartments = [];
    var allBranches = [];
    var globalRolePermissions = {};
    var currentUser = null;

    window.onload = function () {
      initDarkMode();
      initDragScroll('.tabs');
      initDragScroll('.cat-filter');
      if (typeof API !== 'undefined') {
        checkAuth();
      } else {
        var checkCount = 0;
        var checkTimer = setInterval(function () {
          checkCount++;
          if (typeof API !== 'undefined') {
            clearInterval(checkTimer);
            checkAuth();
          } else if (checkCount > 50) {
            clearInterval(checkTimer);
            showToast('เชื่อมต่อ API ไม่สำเร็จ กรุณารีเฟรช', 'error');
          }
        }, 100);
      }
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
      // รีเฟรชกราฟถ้ามี
      if (currentAdminPage === 'dashboard') loadDashboard();
      refreshIcons();
    }

    function updateDarkModeUI(isDark) {
      var icon = document.getElementById('darkModeIcon');
      var text = document.getElementById('darkModeText');
      if (icon) icon.innerHTML = isDark ? '<i data-lucide="sun"></i>' : '<i data-lucide="moon"></i>';
      if (text) text.textContent = isDark ? 'โหมดสว่าง' : 'โหมดมืด';
    }

    function hasPermission(key, value) {
      if (!currentUser) return false;
      var role = String(currentUser.role || '').toLowerCase();
      var isSuperAdmin = (role === 'superadmin' || role === 'owner' || String(currentUser.employeeId || '').toLowerCase() === 'admin');
      if (isSuperAdmin) return true;

      // Compatibility for admin check
      if (key === 'manage_inventory') return API.hasPermission(API.PERMS.MANAGE_INVENTORY);
      if (key === 'manage_categories') return API.hasPermission(API.PERMS.MANAGE_CATEGORIES);

      return API.hasPermission(key);
    }

    function checkAuth() {
      var stored = localStorage.getItem('_user');
      if (stored) try { currentUser = JSON.parse(stored); } catch (e) { }

      if (!currentUser) {
        var loginUrl = window.location.hostname.indexOf('script.google.com') !== -1
          ? (typeof scriptUrl !== 'undefined' ? scriptUrl + '?page=login' : '?page=login')
          : 'login.html';
        window.location.href = loginUrl;
        return;
      }

      // [NEW] ตรวจสอบสิทธิ์แบบยืดหยุ่น (Role + Permissions + Team Context)
      var hasTeam = currentUser && currentUser.teamId;
      var hasAnyAdminPerm = API.hasRole('superadmin') ||
        API.hasPermission(API.PERMS.MANAGE_PRODUCTS) ||
        API.hasPermission(API.PERMS.APPROVE_REQUEST) ||
        API.hasPermission(API.PERMS.MANAGE_INVENTORY) ||
        API.hasPermission(API.PERMS.MANAGE_EMPLOYEES) ||
        hasTeam; // [NEW] คนมีทีมสามารถเข้าหน้าแอดมินเพื่อดูใบเบิกทีมตนเองได้

      if (!hasAnyAdminPerm) {
        document.querySelector('.container').innerHTML = '<div class="card text-center" style="padding:3rem;margin-top:2rem">'
          + '<p style="color:var(--danger);font-size:1.1rem">⛔ คุณไม่มีสิทธิ์เข้าถึงส่วนงานแอดมิน</p>'
          + '<button class="btn btn-primary" style="margin-top:1rem" onclick="navigateTo(scriptUrl)">กลับหน้าหลัก</button></div>';
        return;
      }

      // จัดการการมองเห็น Tab ตามสิทธิ์จริง
      var tabPermissions = {
        'tab-dashboard': API.PERMS.VIEW_DASHBOARD,
        'tab-products': API.PERMS.MANAGE_PRODUCTS,
        'tab-categories': API.PERMS.MANAGE_CATEGORIES,
        'tab-inventory': API.PERMS.MANAGE_INVENTORY,
        'tab-employees': API.PERMS.VIEW_EMPLOYEES,
        'tab-teams': API.PERMS.VIEW_EMPLOYEES,
        'tab-departments': API.PERMS.MANAGE_STRUCTURE,
        'tab-reports': API.PERMS.VIEW_REPORTS,
        'tab-audit': API.PERMS.VIEW_REPORTS,
        'tab-usage': API.PERMS.VIEW_REPORTS,
        'tab-settings': API.PERMS.MANAGE_SETTINGS,
        'tab-branches': API.PERMS.MANAGE_STRUCTURE,
        'tab-permissions': API.PERMS.MANAGE_EMPLOYEES,
        'tab-orders': 'VIEW_ORDERS_OR_TEAM' // [Special Key]
      };

      for (var id in tabPermissions) {
        var el = document.getElementById(id);
        if (!el) continue;

        var isAllowed = false;
        var p = tabPermissions[id];

        if (p === 'VIEW_ORDERS_OR_TEAM') {
          isAllowed = API.hasPermission(API.PERMS.APPROVE_REQUEST) ||
            API.hasPermission(API.PERMS.VIEW_ALL_REQUESTS) ||
            hasTeam;
        } else {
          isAllowed = API.hasPermission(p);
        }

        el.style.display = isAllowed ? 'flex' : 'none';
      }

      // ถ้าไม่มีสิทธิ์ดู Dashboard ให้สลับไปหน้า Orders อัตโนมัติ
      if (!API.hasPermission(API.PERMS.VIEW_DASHBOARD)) {
        switchAdminTab('orders');
      }

      // Hide Inventory/Products management buttons if no permission
      var canEditInventory = API.hasPermission(API.PERMS.MANAGE_INVENTORY);
      document.querySelectorAll('.btn-inventory-mgr').forEach(function (b) {
        b.style.display = canEditInventory ? 'inline-flex' : 'none';
      });

      // ปุ่มไปหน้า Manager (ถ้ามีสิทธิ์อนุมัติ หรือ มีทีม)
      var mgrBtn = document.getElementById('mgrPaneBtn');
      var mgrMob = document.getElementById('mgrMobileBtn');
      var mgrMob2 = document.getElementById('mgrMobileBtn2');
      var canManage = API.hasPermission(API.PERMS.APPROVE_REQUEST) || hasTeam;

      if (canManage) {
        if (mgrBtn) mgrBtn.classList.remove('hidden');
        if (mgrMob) mgrMob.classList.remove('hidden');
        if (mgrMob2) mgrMob2.style.display = 'flex';
      }

      document.getElementById('adminName').textContent = '👤 ' + currentUser.name;

      // Load initial data
      Promise.all([
        API.getCategories(),
        API.getSystemSettings(),
        API.getReportData('Departments')
      ]).then(function (results) {
        if (results[0].success && results[0].data) allAdminCategories = results[0].data;
        if (results[1].success && results[1].data) {
          globalRolePermissions = results[1].data.rolePermissions || {};
        }
        if (results[2].success && results[2].data) {
          allAdminDepartments = results[2].data;
        }

        // [NEW] บันทึกสินค้าลง LocalStorage สำหรับหน้าสแกนในโหมด Admin
        API.getProducts().then(function (res) {
          if (res.success) localStorage.setItem('_all_products_cache', JSON.stringify(res.data));
        });

        var initialPage = sessionStorage.getItem('currentAdminPage') || 'dashboard';
        currentAdminPage = '';
        adminNav(initialPage);
      }).catch(function (err) {
        console.warn('Initial Data Load Failed:', err);
        var initialPage = sessionStorage.getItem('currentAdminPage') || 'dashboard';
        currentAdminPage = '';
        adminNav(initialPage);
      }).finally(function () {
        // Polling removed per user request
      });
    };

    // startAppPolling function completely removed


    window.adminNav = function (page, el, options) {
      if (currentAdminPage === page && !el && !options) return;
      currentAdminPage = page;
      try {
        sessionStorage.setItem('currentAdminPage', page);
      } catch (e) { }

      // Close open elements
      document.querySelectorAll('.modal-overlay').forEach(function (m) { m.classList.remove('open'); });
      var suggestions = document.getElementById('adminProductSuggestions');
      if (suggestions) suggestions.classList.remove('active');

      // 1. UI Sync
      document.querySelectorAll('.tab, .admin-mobile-tab').forEach(function (t) {
        t.classList.toggle('active', t.getAttribute('data-admin-page') === page);
      });

      document.querySelectorAll('.admin-page').forEach(function (p) {
        p.classList.remove('active-page');
        p.style.display = 'none';
      });

      var target = document.getElementById('p-' + page);
      if (target) {
        target.style.display = 'block';
        setTimeout(function () { target.classList.add('active-page'); }, 10);
      }

      // Update Page Title and Description
      var titles = {
        'dashboard': { t: 'ภาพรวมระบบ', d: 'ข้อมูลสรุปและสถานะระบบแบบเรียลไทม์' },
        'products': { t: 'จัดการสินค้า', d: 'เพิ่ม แก้ไข และบริหารจัดการรายการสินค้าทั้งหมด' },
        'categories': { t: 'หมวดหมู่สินค้า', d: 'จัดการกลุ่มประเภทของสินค้าในระบบ' },
        'orders': { t: 'ประวัติใบเบิก', d: 'ตรวจสอบและจัดการสถานะการเบิกพัสดุ' },
        'inventory': { t: 'สต็อกสินค้า', d: 'ตรวจสอบจำนวนและปรับยอดสต็อกสินค้า' },
        'reports': { t: 'รายงานสถิติ', d: 'วิเคราะห์ข้อมูลการเบิกพัสดุเชิงลึก' },
        'employees': { t: 'จัดการพนักงาน', d: 'บริหารจัดการข้อมูลและสิทธิ์เข้าใช้งาน' },
        'teams': { t: 'ทีมช่าง', d: 'จัดการทีมช่างและการสังกัดทีม' },
        'settings': { t: 'ตั้งค่าระบบ', d: 'กำหนดค่าพื้นฐานและการตั้งค่าขั้นสูง' },
        'departments': { t: 'แผนกงาน', d: 'จัดการรายชื่อแผนกในองค์กร' },
        'branches': { t: 'จัดการสาขา', d: 'ตั้งค่าข้อมูลสาขาและที่ตั้ง' },
        'audit': { t: 'ประวัติกิจกรรมระบบ', d: 'ตรวจสอบความเคลื่อนไหวและการทำงานของระบบ' },
        'usage': { t: 'ประวัติการเบิกใช้', d: 'ตรวจสอบข้อมูลการเบิกใช้พัสดุรายทีมและรายบุคคล' }
      };

      if (titles[page]) {
        document.getElementById('currentPageTitle').textContent = titles[page].t;
        document.getElementById('currentPageDesc').textContent = titles[page].d;
      }

      // 2. Data Loading
      var loaders = {
        'dashboard': loadDashboard,
        'products': function () { loadProducts(options); },
        'categories': loadAdminCategories,
        'orders': loadAdminOrders,
        'inventory': loadInventory,
        'reports': loadReports,
        'employees': loadAdminEmployees,
        'permissions': loadPermissionsPage,
        'teams': loadTeams,
        'settings': loadSystemSettings,
        'departments': loadAdminDepartments,
        'branches': loadBranches,
        'audit': loadAuditLogs,
        'usage': function () {
          loadInventoryAudit();
          initLogFilters();
        }
      };

      if (loaders[page]) {
        setTimeout(loaders[page], 50);
      }

      window.scrollTo({ top: 0, behavior: 'smooth' });
      refreshIcons();
    }

    // ─── DASHBOARD ────────────────────────────────────────
    var chartInstance = null;
    var _dbDeptsLoaded = false;
    var _lastDashboardStats = null; // Store for low-stock modal

    function formatDateLocal(d) {
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    function loadDashboard() {
      if (!API.hasPermission(API.PERMS.VIEW_DASHBOARD)) return; // ข้ามการโหลดถ้าไม่มีสิทธิ์
      if (typeof API === 'undefined' || !API.getAdvancedDashboardData) return;

      // 0. Setup Filters
      var period = 'month';
      var dept = 'all';

      var pEl = document.getElementById('dbFilterPeriod');
      var dEl = document.getElementById('dbFilterDept');
      if (pEl) period = pEl.value;
      if (dEl) dept = dEl.value;

      var filters = { department: dept };
      var now = new Date();
      if (period === 'today') {
        filters.startDate = formatDateLocal(now);
        filters.endDate = formatDateLocal(now);
      } else if (period === 'week') {
        var startWeek = new Date(now);
        startWeek.setDate(now.getDate() - now.getDay());
        filters.startDate = formatDateLocal(startWeek);
        filters.endDate = formatDateLocal(now);
      } else if (period === 'month') {
        filters.startDate = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-01';
        filters.endDate = formatDateLocal(now);
      }

      // 1. Initial State UI - Setup Spinners
      var statsGrid = document.getElementById('statsGrid');
      var dbTopList = document.getElementById('dbTopProductsList');
      var dbDeptList = document.getElementById('dbDeptSpendingList');

      if (statsGrid) statsGrid.innerHTML = '<div class="spinner" style="grid-column:1/-1;margin:2rem auto;"></div>';
      if (dbTopList) dbTopList.innerHTML = '<div class="spinner" style="margin:2rem auto;"></div>';
      if (dbDeptList) dbDeptList.innerHTML = '<div class="spinner" style="margin:2rem auto;"></div>';

      // 2. Sequential Data Fetching (Prevent backend congestion)

      // Step A: Load Depts Dropdown if needed
      var deptPromise = (_dbDeptsLoaded || !dEl) ? Promise.resolve() : API.getReportData('Departments').then(function (res) {
        if (res.success && res.data && Array.isArray(res.data)) {
          var currentVal = dEl.value;
          var opts = '<option value="all">ทุกแผนก (All Departments)</option>';
          res.data.forEach(function (dep) {
            if (dep && dep.name) opts += '<option value="' + dep.name + '">' + dep.name + '</option>';
          });
          dEl.innerHTML = opts;
          dEl.value = currentVal;
        }
        _dbDeptsLoaded = true;
      }).catch(function (err) { console.warn('Dept Load Error:', err); });

      deptPromise.then(function () {
        // Step B: Load Main Dashboard Stats (Batched for Speed)
        return API.getDashboardBatchData(filters);
      }).then(function (batch) {
        if (!batch.success) throw (batch.message || 'โหลดข้อมูลแดชบอร์ดล้มเหลว');

        // B.1 Advanced Dashboard Data
        var res = batch.advancedData;
        if (res.success && res.data) {
          var d = res.data.stats || {};
          _lastDashboardStats = d;

          if (statsGrid) {
            statsGrid.innerHTML =
              statCard('clipboard-list', 'ใบเบิกตามช่วงเวลา', d.totalOrders || 0) +
              '<div onclick="adminNav(\'orders\', document.querySelector(\'[data-admin-page=orders]\'))" style="cursor:pointer">' + statCard('clock', 'รออนุมัติทั้งหมด', d.pendingCount || 0, 'warning') + '</div>' +
              statCard('check-circle', 'อนุมัติแล้ว', d.approvedCount || 0, 'success') +
              statCard('package-check', 'แจกจ่ายแล้ว', d.receivedCount || 0, 'primary') +
              statCard('coins', 'ยอดการเบิก', hasPermission('view_prices') ? '฿' + (Number(d.totalVolume) || 0).toLocaleString() : '***', 'accent') +
              statCard('package', 'สินค้าในระบบ', d.totalProducts || 0) +
              '<div onclick="showLowStockModal()" style="cursor:pointer">' +
              statCard('alert-octagon', 'สต๊อกต่ำ', d.lowStockCount || 0, (d.lowStockCount > 0 ? 'danger' : '')) +
              '</div>';
          }

          var badge = document.getElementById('ordersTabBadge');
          if (badge) {
            if (d.pendingCount > 0) {
              badge.textContent = d.pendingCount;
              badge.style.display = 'inline-block';
            } else { badge.style.display = 'none'; }
          }

          // Render Top Products List & Chart
          if (dbTopList) {
            if (res.data.topProducts && res.data.topProducts.length > 0) {
              dbTopList.innerHTML = '<div class="flex flex-col gap-2" style="padding:0 1rem 1rem;">' +
                res.data.topProducts.map(function (tp, idx) {
                  return '<div class="flex flex-wrap items-center justify-between gap-2" style="padding:0.5rem; background:rgba(255,255,255,0.01); border-radius:6px; font-size:0.85rem">' +
                    '<div style="flex:1"><strong>#' + (idx + 1) + ' ' + tp.productName + '</strong></div>' +
                    '<div style="font-weight:700; color:var(--accent)">' + tp.totalQty + ' ชิ้น</div>' +
                    '</div>';
                }).join('') + '</div>';
              renderTopProductsChart(res.data.topProducts, 'topProductsChart');
            } else {
              dbTopList.innerHTML = '<div class="text-center" style="padding:2rem; color:var(--text3)">ไม่พบข้อมูล</div>';
            }
          }

          // Render Dept Spending List & Category Chart
          if (dbDeptList) {
            if (res.data.deptSpending && res.data.deptSpending.length > 0) {
              dbDeptList.innerHTML = '<div class="flex flex-col gap-1" style="padding:0 1rem 1rem; border-top:1px solid var(--border); margin-top:0.5rem; padding-top:1rem">' +
                '<div style="font-size:0.75rem; color:var(--text3); margin-bottom:0.5rem">สัดส่วนตามแผนก (Department):</div>' +
                res.data.deptSpending.slice(0, 3).map(function (ds) {
                  return '<div class="flex justify-between" style="font-size:0.8rem"><span>' + ds.department + '</span><span style="color:var(--primary-light)">' + (hasPermission('view_prices') ? '฿' + (ds.totalSpending || 0).toLocaleString() : '***') + '</span></div>';
                }).join('') + '</div>';
            }
            if (res.data.categorySpending) {
              renderCategorySpendingChart(res.data.categorySpending, 'categorySpendingChart');
            }
          }
        }

        // B.2 Activities (Audit Logs)
        renderDashboardActivities(batch.activities);

        // B.3 Trends Chart
        renderTrendsChart(batch.trends);

      }).catch(function (err) {
        console.error('loadDashboard Batch Error:', err);
        if (statsGrid) statsGrid.innerHTML = '<div class="card" style="grid-column: 1/-1; color: var(--danger); padding:2rem; text-align:center;">⚠️ ไม่สามารถโหลดข้อมูลได้<br><small style="opacity:0.6">' + err + '</small></div>';
      }).finally(function () {
        refreshIcons();
      });
    }

    function renderDashboardActivities(res) {
      var body = document.getElementById('dashboardActivitiesBody');
      if (!body) return;
      if (!res.success || !res.data || !res.data.logs) {
        body.innerHTML = '<tr><td colspan="3" class="text-center" style="padding:1rem;color:var(--text3)">ไม่มีกิจกรรม</td></tr>';
        return;
      }
      body.innerHTML = res.data.logs.slice(0, 8).map(function (l) {
        var time = '--:--';
        if (l.timestamp && String(l.timestamp).indexOf(' ') !== -1) {
          var parts = String(l.timestamp).split(' ');
          if (parts[1]) time = parts[1].substring(0, 5);
        }
        var markerClass = 'status-dot';
        if (l.action.indexOf('เบิก') !== -1) markerClass += ' info';
        if (l.action.indexOf('อนุมัติ') !== -1) markerClass += ' success';
        if (l.action.indexOf('ปฏิเสธ') !== -1) markerClass += ' danger';
        if (l.action.indexOf('อัปเดต') !== -1) markerClass += ' warning';

        return '<tr>'
          + '<td style="color:var(--text3);font-size:0.75rem">' + time + '</td>'
          + '<td style="font-weight:500;"><div class="flex items-center gap-2"><span class="' + markerClass + '"></span>' + l.action + '</div></td>'
          + '<td style="font-size:0.8rem">' + (l.userName || 'SYSTEM') + '</td>'
          + '</tr>';
      }).join('');
    }

    function renderTrendsChart(res) {
      if (!res.success || !res.data) return;
      if (typeof Chart === 'undefined') return;
      var canvas = document.getElementById('trendsChart');
      if (!canvas) return;

      var ctx = canvas.getContext('2d');
      if (window.trendsChartInstance) window.trendsChartInstance.destroy();

      window.trendsChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
          labels: res.data.labels,
          datasets: [
            {
              label: 'จำนวนใบเบิก',
              data: res.data.orderCounts,
              borderColor: '#6366f1',
              backgroundColor: 'rgba(99, 102, 241, 0.1)',
              fill: true,
              tension: 0.4
            },
            {
              label: 'ยอดการเบิก (฿)',
              data: hasPermission('view_prices') ? res.data.volumes : res.data.volumes.map(function () { return 0; }),
              borderColor: '#10b981',
              backgroundColor: 'transparent',
              borderDash: [5, 5],
              tension: 0.4,
              yAxisID: 'y1'
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: { legend: { position: 'top', labels: { color: '#94a3b8', boxWidth: 10, usePointStyle: true } } },
          scales: {
            x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 10 } } },
            y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b', font: { size: 10 } } },
            y1: { position: 'right', beginAtZero: true, grid: { display: false }, ticks: { color: '#10b981', font: { size: 10 } } }
          }
        }
      });
    }

    var categoryChartInstances = {};
    function renderCategorySpendingChart(data, canvasId) {
      var canvas = document.getElementById(canvasId);
      if (!canvas || typeof Chart === 'undefined') return;
      if (categoryChartInstances[canvasId]) categoryChartInstances[canvasId].destroy();

      categoryChartInstances[canvasId] = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: data.map(function (d) { return getCategoryName(d.category); }),
          datasets: [{
            data: data.map(function (d) { return hasPermission('view_prices') ? d.totalValue : 0; }),
            backgroundColor: ['#6366f1', '#a855f7', '#ec4899', '#f43f5e', '#f59e0b', '#10b981', '#06b6d4'],
            borderWidth: 0,
            hoverOffset: 10
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 10 }, usePointStyle: true } }
          },
          cutout: '70%'
        }
      });
    }

    var topChartInstances = {};
    function renderTopProductsChart(data, canvasId) {
      var canvas = document.getElementById(canvasId);
      if (!canvas || typeof Chart === 'undefined') return;
      if (topChartInstances[canvasId]) topChartInstances[canvasId].destroy();

      topChartInstances[canvasId] = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
          labels: data.map(function (d) { return d.productName; }),
          datasets: [{
            label: 'จำนวนที่เบิก',
            data: data.map(function (d) { return d.totalQty; }),
            backgroundColor: 'rgba(251, 191, 36, 0.8)',
            borderRadius: 6,
            barThickness: 20
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { grid: { display: false }, ticks: { color: '#94a3b8' } },
            y: { grid: { display: false }, ticks: { color: '#fff', font: { weight: 'bold' } } }
          },
          plugins: { legend: { display: false } }
        }
      });
    }


    function statCard(iconName, label, value, color) {
      var colorStyle = color ? 'style="color:var(--' + color + ')"' : '';
      return '<div class="stat-card mouse-glow-card">'
        + '<div class="stat-label"><i data-lucide="' + iconName + '"></i> ' + label + '</div>'
        + '<div class="stat-value" ' + colorStyle + '>' + value + '</div>'
        + '</div>';
    }

    function showLowStockModal() {
      var listEl = document.getElementById('lowStockModalList');
      if (!listEl || !_lastDashboardStats) return;

      var items = _lastDashboardStats.lowStockItems || [];
      if (items.length === 0) {
        listEl.innerHTML = '<div class="text-center" style="padding:3rem; color:var(--text3)">🙌 ยอดเยี่ยม! ไม่มีสินค้าสต็อกต่ำในขณะนี้</div>';
      } else {
        var html = '<table class="admin-table"><thead><tr>' +
          '<th>สินค้า</th>' +
          '<th style="text-align:center">คงเหลือ</th>' +
          '<th style="text-align:center">ขั้นต่ำ</th>' +
          '</tr></thead><tbody>';

        items.forEach(function (itm) {
          var isTotalLow = Number(itm.stock) <= Number(itm.minStock);
          var lowSizes = [];
          if (itm.variantStock) {
            try {
              var vs = typeof itm.variantStock === 'string' ? JSON.parse(itm.variantStock) : itm.variantStock;
              for (var k in vs) { if (Number(vs[k]) <= 2) lowSizes.push(k); }
            } catch (e) { }
          }

          var detail = '';
          if (lowSizes.length > 0 && !isTotalLow) {
            detail = '<div style="font-size:0.7rem; color:var(--danger); font-weight:600">ต่ำเฉพาะไซส์: ' + lowSizes.join(', ') + '</div>';
          } else if (isTotalLow) {
            detail = '<div style="font-size:0.7rem; color:var(--danger); font-weight:600">ต่ำกว่าเกณฑ์ขั้นต่ำรวม</div>';
          }

          html += '<tr>' +
            '<td>' +
            '<div style="font-weight:600">' + itm.name + '</div>' +
            '<div style="font-size:0.7rem; color:var(--text3)">ID: ' + itm.productId + '</div>' +
            detail +
            '</td>' +
            '<td style="text-align:center; color:var(--danger); font-weight:700">' + itm.stock + '</td>' +
            '<td style="text-align:center; opacity:0.6">' + itm.minStock + '</td>' +
            '</tr>';
        });
        html += '</tbody></table>';
        listEl.innerHTML = html;
      }

      document.getElementById('lowStockModal').classList.add('open');
      refreshIcons();
    }

    function closeLowStockModal() {
      document.getElementById('lowStockModal').classList.remove('open');
    }


    // ─── PRODUCTS ─────────────────────────────────────────
    // ─── PAGINATION HELPERS ───────────────────────────────
    function renderPaginationControls(totalPages, currentPage, containerId, renderFunctionStr) {
      var container = document.getElementById(containerId);
      if (!container) return;
      if (totalPages <= 1) { container.innerHTML = ''; return; }

      var html = '<div class="flex justify-center flex-wrap gap-2" style="margin-top:1rem; margin-bottom:1rem">';
      var prevDisabled = currentPage === 1 ? 'disabled' : '';
      html += '<button class="btn btn-outline btn-sm" ' + prevDisabled + ' onclick="' + renderFunctionStr + '(' + (currentPage - 1) + ')">&laquo; ก่อนหน้า</button>';

      var startPage = Math.max(1, currentPage - 2);
      var endPage = Math.min(totalPages, currentPage + 2);

      if (startPage > 1) {
        html += '<button class="btn btn-outline btn-sm" onclick="' + renderFunctionStr + '(1)">1</button>';
        if (startPage > 2) html += '<span style="align-self:end; padding:0 0.25rem">...</span>';
      }

      for (var i = startPage; i <= endPage; i++) {
        var activeClass = i === currentPage ? 'btn-primary' : 'btn-outline';
        html += '<button class="btn ' + activeClass + ' btn-sm" onclick="' + renderFunctionStr + '(' + i + ')">' + i + '</button>';
      }

      if (endPage < totalPages) {
        if (endPage < totalPages - 1) html += '<span style="align-self:end; padding:0 0.25rem">...</span>';
        html += '<button class="btn btn-outline btn-sm" onclick="' + renderFunctionStr + '(' + totalPages + ')">' + totalPages + '</button>';
      }

      var nextDisabled = currentPage === totalPages ? 'disabled' : '';
      html += '<button class="btn btn-outline btn-sm" ' + nextDisabled + ' onclick="' + renderFunctionStr + '(' + (currentPage + 1) + ')">ถัดไป &raquo;</button>';

      html += '</div>';
      container.innerHTML = html;
    }

    // ─── PRODUCTS ─────────────────────────────────────────
    var allAdminProducts = [];
    var filteredAdminProducts = [];
    var adminProductsPageSize = 25;
    var currentAdminProductsPage = 1;

    function loadProducts(options) {
      var body = document.getElementById('productsBody');
      if (body) body.innerHTML = '<tr><td colspan="8" class="text-center" style="padding:2rem"><div class="spinner"></div></td></tr>';

      API.getProducts().then(function (res) {
        if (!res.data) res.data = [];
        allAdminProducts = res.data;

        // Sync products to cache for scanner
        localStorage.setItem('_all_products_cache', JSON.stringify(res.data));

        // Load categories for filter
        API.getCategories().then(function (cRes) {
          allAdminCategories = cRes.data || [];
          var sel = document.getElementById('adminProductCatFilter');
          if (sel) {
            sel.innerHTML = '<option value="all">ทั้งหมด</option>' + (cRes.data || []).map(function (c) {
              return '<option value="' + (c.id || c.categoryId) + '">' + c.name + '</option>';
            }).join('');

            // Apply low-stock filter if requested from dashboard
            if (options && options.filter === 'lowstock') {
              var stockSel = document.getElementById('adminProductStockFilter');
              if (stockSel) stockSel.value = 'low';
            }

            initSearchableSelect('adminProductCatFilter', true);
            initSearchableSelect('adminProductStockFilter', true);
          }
          filterAdminProducts(); // Initial render after categories loaded
        }).catch(function (err) {
          console.warn('Category Load Error in Products:', err);
          filterAdminProducts();
        });
      }).catch(function (err) {
        showToast('ไม่สามารถโหลดข้อมูลสินค้าได้: ' + err, 'error');
      });
    }

    function onAdminProductSearch(query) {
      showAdminProductSuggestions(query);
      filterAdminProducts();
    }

    function showAdminProductSuggestions(query) {
      var dropdown = document.getElementById('adminProductSuggestions');

      // If query is empty, show all active products as a dropdown
      var suggestions = allAdminProducts;
      if (query && query.trim().length > 0) {
        suggestions = allAdminProducts.filter(function (p) {
          var name = String(p.name || "");
          return name.toLowerCase().includes(query.toLowerCase()) ||
            String(p.productId).toLowerCase().includes(query.toLowerCase());
        });
      }

      // Limit to 20 products for performance when empty, or 8 when searching
      suggestions = query ? suggestions.slice(0, 8) : suggestions.slice(0, 20);

      if (suggestions.length === 0) {
        dropdown.innerHTML = '<div class="search-select-item" style="opacity:0.5; cursor:default">ไม่พบสินค้า</div>';
        dropdown.classList.add('active');
        return;
      }

      dropdown.innerHTML = suggestions.map(function (p) {
        var pName = String(p.name || "ไม่มีชื่อ");
        var safeName = pName.replace(/'/g, "\\'");
        return '<div class="search-select-item" onclick="selectAdminProductSuggestion(\'' + p.productId + '\', \'' + safeName + '\')">' +
          '<div style="font-weight:600">' + pName + '</div>' +
          '<div style="font-size:0.75rem; color:var(--text3)">ID: ' + p.productId + ' | ' + (p.categoryId || '-') + '</div>' +
          '</div>';
      }).join('');
      dropdown.classList.add('active');
    }

    document.addEventListener('click', function (e) {
      var dropdown = document.getElementById('adminProductSuggestions');
      var searchInput = document.getElementById('adminProductSearch');
      if (dropdown && dropdown.classList.contains('active') && searchInput) {
        if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
          dropdown.classList.remove('active');
        }
      }
    });

    function selectAdminProductSuggestion(id, name) {
      document.getElementById('adminProductSearch').value = name;
      document.getElementById('adminProductSuggestions').classList.remove('active');
      filterAdminProducts();
    }

    function filterAdminProducts() {
      var query = document.getElementById('adminProductSearch').value.toLowerCase();
      var cat = document.getElementById('adminProductCatFilter').value;
      var stock = document.getElementById('adminProductStockFilter').value;

      filteredAdminProducts = allAdminProducts.filter(function (p) {
        var pName = String(p.name || "").toLowerCase();
        var pId = String(p.productId || "").toLowerCase();

        var matchText = !query || pName.includes(query) || pId.includes(query);
        // Use == to allow numeric ID matching with string value
        var matchCat = (cat === 'all') || (p.categoryId == cat);

        var s = Number(p.stock) || 0;
        var min = Number(p.minStock) || 5;
        var matchStock = true;
        if (stock === 'low') matchStock = (s > 0 && s <= min);
        else if (stock === 'out') matchStock = (s <= 0);
        else if (stock === 'active') matchStock = (String(p.status).toLowerCase() === 'active');
        else if (stock === 'inactive') matchStock = (String(p.status).toLowerCase() === 'inactive');

        return matchText && matchCat && matchStock;
      });

      renderAdminProducts(1);
    }

    function renderAdminProducts(pageNum) {
      if (pageNum) currentAdminProductsPage = pageNum;

      var body = document.getElementById('productsBody');
      var container = document.getElementById('productsPagination');

      if (filteredAdminProducts.length === 0) {
        body.innerHTML = '<tr><td colspan="8" class="text-center" style="padding:2rem;color:var(--text3)">ไม่พบสินค้าที่ตรงตามเงื่อนไข</td></tr>';
        if (container) container.innerHTML = '';
        return;
      }

      var totalPages = Math.ceil(filteredAdminProducts.length / adminProductsPageSize);
      if (currentAdminProductsPage > totalPages) currentAdminProductsPage = totalPages;
      if (currentAdminProductsPage < 1) currentAdminProductsPage = 1;

      var startIdx = (currentAdminProductsPage - 1) * adminProductsPageSize;
      var paginated = filteredAdminProducts.slice(startIdx, startIdx + adminProductsPageSize);

      body.innerHTML = paginated.map(function (p) {
        var stock = Number(p.stock) || 0;
        var min = Number(p.minStock) || 5;
        var stockClass = 'stock-safe';
        var rowClass = '';
        if (stock <= 0) { stockClass = 'stock-danger'; rowClass = 'row-stock-danger'; }
        else if (stock <= min) { stockClass = 'stock-warning'; rowClass = 'row-stock-warning'; }

        return '<tr class="hover-row ' + rowClass + '">'
          + '<td><img src="' + (p.imageUrl || 'https://placehold.co/100x100/12121e/fbbf24?text=📦') + '" style="width:32px;height:32px;object-fit:cover;border-radius:4px;background:rgba(255,255,255,0.05)" onerror="this.src=\'https://placehold.co/100x100/12121e/fbbf24?text=📦\'"></td>'
          + '<td data-label="รหัสสินค้า" class="hide-mobile" style="font-size:0.8rem;color:var(--text3)">' + escapeHTML(p.productId) + '</td>'
          + '<td data-label="ชื่อสินค้า" style="font-weight:500">'
          + escapeHTML(p.name)
          + (p.sizes ? '<div style="font-size:0.7rem; color:var(--primary); font-weight:400; margin-top:2px">ไซส์: ' + escapeHTML(p.sizes) + '</div>' : '')
          + '</td>'
          + '<td data-label="หมวดหมู่">' + escapeHTML(getCategoryName(p.categoryId)) + '</td>'
          + '<td data-label="ราคา">' + (hasPermission('view_prices') ? '฿' + Number(p.price).toLocaleString() : '***') + '</td>'
          + '<td data-label="สต๊อก">'
          + '<div class="' + stockClass + '" style="font-weight:700; font-size:1rem">' + stock + '</div>'
          + '<div style="font-size:0.75rem; color:var(--text2); margin-top:4px; line-height:1.2">' + (p.variantStock ? formatVariantStock(p.variantStock) : '<span style="opacity:0.4; font-size:0.65rem">(ยังไม่ระบุไซส์)</span>') + '</div>'
          + '</td>'
          + '<td data-label="สถานะ"><span class="badge ' + (p.status === 'active' ? 'badge-approved' : 'badge-rejected') + '" style="cursor:pointer" onclick="event.stopPropagation(); toggleProductStatus(\'' + p.productId + '\', \'' + p.status + '\')">' + (p.status === 'active' ? 'เปิด' : 'ปิด') + '</span></td>'
          + '<td data-label="จัดการ" onclick="event.stopPropagation()">'
          + '<button class="btn btn-sm btn-ghost" onclick="generateBarcode(\'' + escapeHTML(p.productId) + '\', \'' + String(p.name || "").replace(/'/g, "\\'") + '\')" title="ดูบาร์โค้ด"><i data-lucide="barcode" style="width:14px;height:14px"></i></button>'
          + '<button class="btn btn-sm btn-ghost btn-inventory-mgr" onclick="editProduct(\'' + escapeHTML(p.productId) + '\')"><i data-lucide="edit" style="width:14px;height:14px"></i></button>'
          + '<button class="btn btn-sm btn-ghost btn-inventory-mgr" style="color:var(--danger)" onclick="delProduct(\'' + escapeHTML(p.productId) + '\')"><i data-lucide="trash-2" style="width:14px;height:14px"></i></button></td>'
          + '</tr>';
      }).join('');

      renderPaginationControls(totalPages, currentAdminProductsPage, 'productsPagination', 'renderAdminProducts');
      refreshIcons();
    }

    function getCategoryName(id) {
      if (!id) return '-';
      var searchId = String(id).trim();
      var cat = allAdminCategories.find(function (c) {
        var catId = c.id || c.categoryId || c.ID || c.CategoryID || c.CategoryCode || c.name;
        return String(catId).trim() === searchId;
      });
      return cat ? cat.name : id;
    }

    // ─── CATEGORIES ───────────────────────────────────────
    function loadAdminCategories() {
      var body = document.getElementById('categoriesBody');
      if (body) body.innerHTML = '<tr><td colspan="4" class="text-center" style="padding:2rem"><div class="spinner"></div></td></tr>';

      API.getCategories().then(function (res) {
        var body = document.getElementById('categoriesBody');
        if (!res.data || res.data.length === 0) { body.innerHTML = '<tr><td colspan="4" class="text-center" style="padding:2rem;color:var(--text3)">ยังไม่มีหมวดหมู่</td></tr>'; return; }
        body.innerHTML = res.data.map(function (c) {
          var catId = c.id || c.categoryId || c.ID || c.CategoryID || c.CategoryCode || c.name;
          var branchId = c.branchId || '-';
          return '<tr>'
            + '<td>' + escapeHTML(catId) + '</td>'
            + '<td style="font-weight:600">' + escapeHTML(c.name) + '</td>'
            + '<td><span class="badge badge-outline">' + escapeHTML(branchId) + '</span></td>'
            + '<td><button class="btn btn-sm btn-ghost" onclick="editCategory(\'' + escapeHTML(catId) + '\', \'' + String(c.name || "").replace(/'/g, "\\'") + '\', \'' + escapeHTML(c.branchId || "") + '\')"><i data-lucide="edit" style="width:14px;height:14px"></i> แก้ไข</button>'
            + '<button class="btn btn-sm btn-ghost" style="color:var(--danger)" onclick="delCategory(\'' + escapeHTML(catId) + '\')"><i data-lucide="trash-2" style="width:14px;height:14px"></i> ลบ</button></td>'
            + '</tr>';
        }).join('');
        refreshIcons();
      });
    }

    function openCategoryModal(cat) {
      document.getElementById('cf-old-id').value = cat ? cat.id : '';
      document.getElementById('cf-id').value = cat ? cat.id : '';
      document.getElementById('cf-name').value = cat ? cat.name : '';

      // Populate Branches
      var branchSelect = document.getElementById('cf-branch');
      if (branchSelect && typeof allBranches !== 'undefined') {
        branchSelect.innerHTML = '<option value="">ทุกสาขา / ส่วนกลาง</option>' +
          allBranches.map(function (b) { return '<option value="' + b.branchId + '">' + b.name + ' (' + b.branchId + ')</option>'; }).join('');
        branchSelect.value = cat ? (cat.branchId || '') : '';
      }

      document.getElementById('categoryModalTitle').textContent = cat ? 'แก้ไขหมวดหมู่' : 'เพิ่มหมวดหมู่ใหม่';
      document.getElementById('categoryModal').classList.add('open');
    }
    function closeCategoryModal() { document.getElementById('categoryModal').classList.remove('open'); }

    function saveCategory() {
      var oldId = document.getElementById('cf-old-id').value.trim();
      var newId = document.getElementById('cf-id').value.trim();
      var name = document.getElementById('cf-name').value.trim();
      var branchId = document.getElementById('cf-branch').value;

      var op = oldId ? 'update' : 'add';

      if (!name) { showToast('กรุณาระบุชื่อหมวดหมู่', 'warning'); return; }
      if (op === 'update' && !newId) { showToast('กรุณาระบุรหัสหมวดหมู่ใหม่', 'warning'); return; }
      var data = { oldCategoryId: oldId, categoryId: newId, name: name, branchId: branchId };

      showToast('กำลังบันทึก...', 'info');
      API.manageCategory(op, data).then(function (res) {
        if (res.success) {
          showToast('บันทึกหมวดหมู่เรียบร้อย', 'success');
          closeCategoryModal();
          loadAdminCategories();
        } else {
          showToast(res.message, 'error');
        }
      }).catch(function (err) { showToast(err, 'error'); });
    }

    function editCategory(id, name, branchId) { openCategoryModal({ id: id, name: name, branchId: branchId }); }

    function delCategory(id) {
      if (!confirm('ยืนยันการลบหมวดหมู่ ' + id + '? (เฉพาะหมวดที่ไม่มีสินค้าเท่านั้น)')) return;
      API.manageCategory('delete', { categoryId: id }).then(function (res) {
        if (res && res.success) {
          showToast('ลบหมวดหมู่เรียบร้อย', 'success');
          loadAdminCategories();
        }
        else { showToast(res.message || 'ไม่สามารถลบหมวดหมู่ได้', 'error'); }
      }).catch(function (err) { showToast('ข้อผิดพลาด: ' + err, 'error'); });
    }

    function openProductModal(product) {
      document.getElementById('pf-old-id').value = product ? (product.productId || product.id || '') : '';
      document.getElementById('pf-id').value = product ? (product.productId || product.id || '') : '';
      document.getElementById('pf-name').value = product ? product.name : '';

      // Load categories and set selected
      API.getCategories().then(function (res) {
        var sel = document.getElementById('pf-cat');
        sel.innerHTML = (res.data || []).map(function (c) {
          var catId = c.id || c.categoryId || c.ID || c.CategoryID || c.CategoryCode || c.name;
          return '<option value="' + catId + '" ' + (product && (product.categoryId === catId || product.categoryId === c.name) ? 'selected' : '') + '>' + c.name + '</option>';
        }).join('');
        initSearchableSelect('pf-cat');
      });

      document.getElementById('pf-price').value = product ? product.price : '';
      document.getElementById('pf-stock').value = product ? product.stock : '';
      document.getElementById('pf-min').value = product ? product.minStock || '5' : '5';
      document.getElementById('pf-sizes').value = product ? (product.sizes || '') : '';
      
      var hasSizes = product && product.sizes && product.sizes.trim() !== '';
      document.getElementById('pf-has-sizes').checked = hasSizes;
      toggleSizeInput(hasSizes);

      generateSizeStockInputs(product ? product.variantStock : null);

      document.getElementById('pf-img').value = product ? product.imageUrl : '';
      updateImagePreview(document.getElementById('pf-img').value);
      document.getElementById('productModalTitle').textContent = product ? 'แก้ไขสินค้า' : 'เพิ่มสินค้า';
      document.getElementById('productModal').classList.add('open');
    }

    function updateImagePreview(url) {
      var wrap = document.getElementById('pf-preview-wrap');
      var img = document.getElementById('pf-preview');
      var directUrl = getImageUrl(url);
      if (directUrl) {
        img.src = directUrl;
        wrap.style.display = 'flex';
      } else {
        wrap.style.display = 'none';
      }
    }
    function closeProductModal() { document.getElementById('productModal').classList.remove('open'); }

    function toggleSizeInput(show) {
      var wrapper = document.getElementById('pf-size-input-wrapper');
      var sizeInput = document.getElementById('pf-sizes');
      if (show) {
        wrapper.style.display = 'block';
        if (!sizeInput.value) sizeInput.value = 'S, M, L, XL';
      } else {
        wrapper.style.display = 'none';
        sizeInput.value = '';
      }
      generateSizeStockInputs();
    }

    function generateSizeStockInputs(variantStock) {
      var sizesStr = document.getElementById('pf-sizes').value;
      var container = document.getElementById('size-stock-container');
      var list = document.getElementById('size-stock-list');
      var stockInput = document.getElementById('pf-stock');

      if (!sizesStr.trim()) {
        container.style.display = 'none';
        stockInput.disabled = false;
        return;
      }

      container.style.display = 'block';
      stockInput.disabled = true; // Total stock will be calculated

      var sizes = sizesStr.split(',').map(function (s) { return s.trim(); }).filter(function (s) { return s !== ''; });
      var vStock = {};
      if (typeof variantStock === 'string' && variantStock.startsWith('{')) {
        try { vStock = JSON.parse(variantStock); } catch (e) { }
      } else if (typeof variantStock === 'object' && variantStock !== null) {
        vStock = variantStock;
      }

      list.innerHTML = sizes.map(function (s) {
        var val = vStock[s] || 0;
        return '<div style="display:flex; flex-direction:column; gap:2px; min-width:60px">' +
          '<span style="font-size:0.7rem; font-weight:600">' + s + '</span>' +
          '<input type="number" class="pf-size-stock-input form-input" style="padding:4px 8px; font-size:0.85rem" data-size="' + s + '" value="' + val + '" oninput="calculateTotalStock()">' +
          '</div>';
      }).join('');

      calculateTotalStock();
    }

    function calculateTotalStock() {
      var inputs = document.querySelectorAll('.pf-size-stock-input');
      var total = 0;
      var vStock = {};

      inputs.forEach(function (input) {
        var val = Number(input.value) || 0;
        total += val;
        vStock[input.getAttribute('data-size')] = val;
      });

      if (inputs.length > 0) {
        document.getElementById('pf-stock').value = total;
        // Hidden field to store JSON? Or just collect it in saveProduct
        document.getElementById('pf-stock').setAttribute('data-variant-json', JSON.stringify(vStock));
      }
    }

    function formatVariantStock(vs, threshold) {
      if (!vs) return '';
      var limit = threshold || 2;
      var obj = vs;
      if (typeof vs === 'string' && vs.trim().startsWith('{')) {
        try { obj = JSON.parse(vs); } catch (e) { return vs; }
      }
      if (typeof obj !== 'object' || obj === null) return String(vs);
      var parts = [];
      for (var k in obj) {
        var qty = Number(obj[k]);
        var style = qty <= limit ? 'color:var(--danger); font-weight:bold' : '';
        parts.push('<span style="' + style + '">' + k + ':' + qty + '</span>');
      }
      return parts.join(' | ');
    }

    function editProduct(id) {
      var p = allAdminProducts.filter(function (x) { return String(x.productId || x.id) === String(id); })[0];
      if (p) {
        openProductModal(p);
      } else {
        // Fallback if not in cache
        API.getProducts().then(function (res) {
          var p2 = (res.data || []).filter(function (x) { return String(x.productId || x.id) === String(id); })[0];
          if (p2) openProductModal(p2);
        });
      }
    }

    function saveProduct() {
      var data = {
        oldProductId: document.getElementById('pf-old-id').value.trim(),
        productId: document.getElementById('pf-id').value.trim(),
        name: document.getElementById('pf-name').value.trim(),
        categoryId: document.getElementById('pf-cat').value,
        price: Number(document.getElementById('pf-price').value),
        stock: Number(document.getElementById('pf-stock').value),
        minStock: Number(document.getElementById('pf-min').value),
        sizes: document.getElementById('pf-sizes').value.trim(),
        variantStock: document.getElementById('pf-stock').getAttribute('data-variant-json') || '',
        imageUrl: document.getElementById('pf-img').value.trim()
      };
      if (!data.name || isNaN(data.price)) { showToast('กรุณากรอกข้อมูลให้ครบถ้วน', 'warning'); return; }

      var btn = document.getElementById('saveProductBtn');
      var oldHtml = btn.innerHTML;
      btn.innerHTML = '<div class="spinner" style="width:16px;height:16px"></div> กำลังบันทึก...';
      btn.disabled = true;

      var op = data.oldProductId ? 'update' : 'add';
      API.manageProduct(op, data).then(function (res) {
        if (res.success) {
          showToast('บันทึกเรียบร้อย', 'success');
          closeProductModal(); loadProducts();
        } else {
          showToast(res.message, 'error');
        }
      }).catch(function (err) {
        showToast(err, 'error');
      }).finally(function () {
        btn.innerHTML = oldHtml;
        btn.disabled = false;
      });
    }

    function toggleProductStatus(id, current) {
      var newStatus = current === 'active' ? 'inactive' : 'active';
      var p = null;
      for (var i = 0; i < allAdminProducts.length; i++) {
        if (String(allAdminProducts[i].productId) === String(id)) {
          p = allAdminProducts[i];
          break;
        }
      }
      if (!p) return;
      var data = {};
      for (var key in p) { if (p.hasOwnProperty(key)) data[key] = p[key]; }
      data.status = newStatus;
      API.manageProduct('update', data).then(function (res) {
        if (res.success) { showToast('อัปเดตสถานะแล้ว', 'success'); loadProducts(); }
        else { showToast(res.message, 'error'); }
      }).catch(function (err) {
        showToast(err, 'error');
      });
    }



    function delProduct(id) {
      if (!confirm('ลบสินค้า ' + id + ' ?')) return;
      API.manageProduct('delete', { productId: id }).then(function (res) {
        if (res && res.success) {
          showToast('ลบเรียบร้อย', 'success');
          loadProducts();
        } else {
          showToast(res.message || 'ไม่สามารถลบสินค้าได้', 'error');
        }
      }).catch(function (err) { showToast('ข้อผิดพลาด: ' + err, 'error'); });
    }

    function handleImageUpload(input) {
      var file = input.files[0];
      if (!file) return;

      var status = document.getElementById('pf-upload-status');
      var wrap = document.getElementById('pf-preview-wrap');
      if (status) {
        status.textContent = 'กำลังอัปโหลด...';
        status.style.color = 'var(--primary-light)';
      }
      if (wrap) wrap.style.display = 'flex';

      var reader = new FileReader();
      reader.onload = function (e) {
        var base64 = e.target.result;
        if (!base64) {
          if (status) status.textContent = '❌ อ่านไฟล์ไม่สำเร็จ';
          return;
        }
        API.uploadToDrive(base64, 'prod_' + Date.now() + '.jpg').then(function (res) {
          if (res.success) {
            document.getElementById('pf-img').value = res.directLink;
            updateImagePreview(res.directLink);
            if (status) {
              status.textContent = '✅ อัปโหลดสำเร็จ';
              status.style.color = 'var(--accent)';
            }
          } else {
            if (status) {
              status.textContent = '❌ ' + res.message;
              status.style.color = 'var(--danger)';
            }
          }
        }).catch(function (err) {
          if (status) {
            status.textContent = '❌ ผิดพลาด: ' + err;
            status.style.color = 'var(--danger)';
          }
        });
      };
      reader.readAsDataURL(file);
    }

    // ─── ORDERS ───────────────────────────────────────────
    var allAdminOrders = [];
    var masterAdminOrders = []; // Full list for filtering
    var adminOrdersPageSize = 25;
    var currentAdminOrdersPage = 1;

    function loadAdminOrders(forceRefresh) {
      var body = document.getElementById('ordersBody');
      if (body) {
        body.innerHTML = '<tr><td colspan="7" class="text-center" style="padding:2rem"><div class="spinner"></div></td></tr>';
      }

      API.getAllOrders(forceRefresh).then(function (res) {
        masterAdminOrders = res.data || [];

        // Apply current filter if any
        var filter = document.getElementById('adminOrderFilter') ? document.getElementById('adminOrderFilter').value : 'all';
        if (filter === 'all') {
          allAdminOrders = masterAdminOrders;
        } else {
          allAdminOrders = masterAdminOrders.filter(function (o) { return o.status === filter; });
        }

        renderAdminOrders(1);
      }).catch(function (err) { showToast(err, 'error'); });
    }

    function renderAdminOrders(pageNum) {
      if (pageNum) currentAdminOrdersPage = pageNum;

      var body = document.getElementById('ordersBody');
      var container = document.getElementById('ordersPagination');

      if (allAdminOrders.length === 0) {
        body.innerHTML = '<tr><td colspan="7" class="text-center" style="padding:2rem;color:var(--text3)">ยังไม่มีใบเบิก</td></tr>';
        if (container) container.innerHTML = '';
        return;
      }

      var totalPages = Math.ceil(allAdminOrders.length / adminOrdersPageSize);
      if (currentAdminOrdersPage > totalPages) currentAdminOrdersPage = totalPages;
      if (currentAdminOrdersPage < 1) currentAdminOrdersPage = 1;

      var startIdx = (currentAdminOrdersPage - 1) * adminOrdersPageSize;
      var paginated = allAdminOrders.slice(startIdx, startIdx + adminOrdersPageSize);

      body.innerHTML = paginated.map(function (o) {
        var bc = 'badge-pending';
        if (o.status === 'Approved' || o.status === 'Dispatched') bc = 'badge-approved';
        if (o.status === 'READY' || o.status === 'Ready') bc = 'badge-ready';
        if (o.status === 'Received') bc = 'badge-complete';
        if (o.status === 'Rejected') bc = 'badge-rejected';

        var actions = '';
        var user = JSON.parse(localStorage.getItem('_user') || '{}');
        var userTeamId = user.teamId || '';

        var isSameTeam = userTeamId && o.teamId && String(userTeamId) === String(o.teamId);
        var canApprove = hasPermission('approve_orders') || isSameTeam;
        var canDispatch = hasPermission('dispatch_orders') || isSameTeam;

        if (o.status === 'Pending' && canApprove) {
          actions = '<button class="btn btn-sm btn-accent" onclick="doApprove(\'' + o.orderId + '\', \'' + (o.employeeName || o.employeeId) + '\')"><i data-lucide="check" style="width:14px;height:14px"></i> อนุมัติ</button>';
        } else if (o.status === 'Approved' && canDispatch) {
          actions = '<button class="btn btn-sm btn-warning" onclick="doReady(\'' + o.orderId + '\')"><i data-lucide="package-check" style="width:14px;height:14px"></i> จัดเสร็จแล้ว</button>';
        } else if (o.status === 'Ready' && canDispatch) {
          actions = '<button class="btn btn-sm btn-primary" onclick="doDispatch(\'' + o.orderId + '\', this)"><i data-lucide="package" style="width:14px;height:14px"></i> จ่ายของ</button>';
        } else if (o.status === 'Dispatched') {
          actions = '<button class="btn btn-primary btn-sm" onclick="openSignatureModal(\'' + o.orderId + '\')"><i data-lucide="edit-3" style="width:14px;height:14px"></i> เซ็นรับของ</button>';
        }

        // Allow Admin/Superadmin to cancel Pending/Approved/Ready/Dispatched
        var isAdmin = user.role === 'admin' || user.role === 'superadmin';
        if (isAdmin && ['Pending', 'Approved', 'Ready', 'Dispatched'].indexOf(o.status) !== -1) {
          actions += ' <button class="btn btn-sm btn-ghost" style="color:var(--danger)" onclick="doCancel(\'' + o.orderId + '\')"><i data-lucide="trash-2" style="width:14px;height:14px"></i> ยกเลิก</button>';
        }

        // Always allow viewing details
        actions += ' <button class="btn btn-sm btn-outline" style="margin-left:0.25rem" onclick="openSignatureModal(\'' + o.orderId + '\')"><i data-lucide="eye" style="width:14px;height:14px"></i> ดูรายละเอียด</button>';

        return '<tr>'
          + '<td style="font-weight:500">' + o.orderId + '</td>'
          + '<td>' + (o.employeeName || o.employeeId) + '</td>'
          + '<td class="hide-mobile">' + (o.department || '-') + '</td>'
          + '<td style="font-weight:600;color:var(--accent)">฿' + Number(o.totalAmount).toLocaleString() + '</td>'
          + '<td><span class="badge ' + bc + '">' + (o.statusLabel || o.status) + '</span></td>'
          + '<td class="hide-mobile" style="font-size:0.8rem">' + String(o.createdAt || '').split(' ')[0] + '</td>'
          + '<td>' + actions + '</td>'
          + '</tr>';
      }).join('');

      renderPaginationControls(totalPages, currentAdminOrdersPage, 'ordersPagination', 'renderAdminOrders');
      refreshIcons();
    }

    function doApprove(id, empName) {
      openOrderApprovalModal(id, empName);
    }

    function doCancel(id) {
      var reason = prompt('ระบุเหตุผลในการยกเลิกใบเบิก ' + id + ':');
      if (reason === null) return;
      if (!reason.trim()) { alert('กรุณาระบุเหตุผลในการยกเลิก'); return; }

      if (!confirm('ยืนยันการยกเลิกใบเบิก ' + id + '? \nการกระทำนี้จะเปลี่ยนสถานะเป็นยกเลิกและคืนสต็อก (ถ้ามีการจ่ายของแล้ว)')) return;

      API.cancelRequest({ requestId: id, reason: reason }).then(function (res) {
        showToast(res.message, res.success ? 'success' : 'error');
        loadAdminOrders(true);
      }).catch(function (err) { showToast('เกิดข้อผิดพลาด: ' + err, 'error'); });
    }

    function closeModal(id) {
      var m = document.getElementById(id);
      if (m) m.classList.remove('open');
    }

    // ─── ADMIN SIGNATURE MODAL ───────────────────────────────────
    var currentSigningRequestId = null;
    var signatureCanvas, signatureCtx, isDrawing = false;

    function openSignatureModal(requestId) {
      var modal = document.getElementById('orderDetailModal');
      var body = document.getElementById('orderDetailBody');
      var sigSection = document.getElementById('signatureSection');
      if (!modal || !body) return;

      currentSigningRequestId = requestId;
      body.innerHTML = '<div class="text-center" style="padding:2rem"><div class="spinner"></div></div>';
      sigSection.classList.add('hidden');
      modal.classList.add('open');

      var order = allAdminOrders.filter(function (o) { return o.orderId === requestId; })[0];

      API.getOrderItems(requestId).then(function (res) {
        var items = res.data || [];
        var html = '<div class="table-wrap"><table><thead><tr><th>สินค้า</th><th class="text-center">จำนวน</th><th class="text-right">รวม</th></tr></thead><tbody>'
          + items.map(function (i) {
            var sizeInfo = i.size ? ' <span class="badge badge-pending" style="font-size:0.7rem; padding:0.1rem 0.4rem">' + i.size + '</span>' : '';
            return '<tr><td>' + i.productName + sizeInfo + '</td><td class="text-center">' + i.quantity + '</td>'
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

        // --- Show Reject/Cancel Reason if applicable ---
        if (order && (order.status === 'Rejected' || order.status === 'Cancelled') && order.comment) {
           html += '<div style="margin-top:1rem; padding:1rem; background:rgba(239,68,68,0.1); border-radius:8px; border:1px solid rgba(239,68,68,0.2);">'
                 + '<p style="color:var(--danger); font-size:0.9rem; margin-bottom:0.25rem; display:flex; align-items:center; gap:0.4rem;"><i data-lucide="info" style="width:16px;height:16px;"></i> <strong>เหตุผล:</strong></p>'
                 + '<p style="color:var(--text2); font-size:0.85rem; margin-left:1.5rem;">' + escapeHTML(order.comment) + '</p>'
                 + '</div>';
        }

        // Add history section for this employee
        if (order && (order.employeeId || order.employeeName)) {
          var eIdMatch = order.employeeId || order.employeeName;
          var pastOrders = allAdminOrders.filter(function (o) {
            return (o.employeeId === eIdMatch || o.employeeName === eIdMatch) && o.orderId !== requestId &&
              (o.status === 'Received' || o.status === 'Approved' || o.status === 'Dispatched');
          });
          if (pastOrders.length > 0) {
            html += '<div style="margin-top:1.5rem;border-top:1px dashed var(--border);padding-top:1rem;">'
              + '<h4 style="font-size:0.9rem;font-weight:700;margin-bottom:0.5rem"><i data-lucide="history" style="width:14px;height:14px"></i> ประวัติการเบิกของ ' + (order.employeeName || order.employeeId) + '</h4>'
              + '<ul style="font-size:0.8rem;color:var(--text2);list-style:none;padding:0;display:flex;flex-direction:column;gap:0.5rem">';
            pastOrders.slice(0, 5).forEach(function (po) {
              html += '<li style="display:flex;justify-content:space-between;background:rgba(255,255,255,0.02);padding:0.5rem;border-radius:4px;">'
                + '<span>#' + po.orderId + ' (' + (po.createdAt ? po.createdAt.split(' ')[0] : '') + ')</span>'
                + '<span style="font-weight:600;color:var(--accent)">฿' + Number(po.totalAmount).toLocaleString() + '</span>'
                + '</li>';
            });
            html += '</ul></div>';
          }
        }

        // Add Status Timeline
        var statuses = ['Pending', 'Approved', 'Ready', 'Dispatched', 'Received'];
        var labels = ['รออนุมัติ', 'อนุมัติแล้ว', 'จัดเสร็จ', 'จ่ายของ', 'รับของแล้ว'];
        var currentIdx = statuses.indexOf(order.status);
        if (order.status === 'Rejected') {
          html = '<div class="badge badge-rejected" style="width:100%;padding:1rem;margin-bottom:1rem;justify-content:center">🚫 รายการนี้ถูกปฏิเสธ: ' + (order.reason || 'ไม่ระบุเหตุผล') + '</div>' + html;
        } else {
          var timelineHtml = '<div class="status-timeline">';
          statuses.forEach(function (st, idx) {
            var active = idx <= currentIdx ? 'active' : '';
            var icon = 'circle';
            if (idx < currentIdx) icon = 'check-circle';
            else if (idx === currentIdx) {
              icon = (st === 'Ready') ? 'package-check' : 'clock';
            }
            timelineHtml += '<div class="status-step ' + active + '"><div class="status-dot"><i data-lucide="' + icon + '" style="width:16px;height:16px"></i></div><div class="status-label">' + labels[idx] + '</div></div>';
          });
          timelineHtml += '</div>';
          html = timelineHtml + html;
        }

        body.innerHTML = html;
        refreshIcons();

        if (order && order.status === 'Dispatched') {
          sigSection.classList.remove('hidden');
          initSignaturePad();
        }
      });
    }

    function initSignaturePad() {
      signatureCanvas = document.getElementById('signatureCanvas');
      if (!signatureCanvas) return;
      signatureCtx = signatureCanvas.getContext('2d');
      signatureCanvas.width = signatureCanvas.offsetWidth || 300;
      signatureCanvas.height = 200;
      signatureCtx.strokeStyle = '#000';
      signatureCtx.lineWidth = 2;
      signatureCtx.lineJoin = 'round';
      signatureCtx.lineCap = 'round';
      signatureCanvas.onmousedown = function (e) { isDrawing = true; signatureCtx.beginPath(); var pos = getMousePos(e); signatureCtx.moveTo(pos.x, pos.y); };
      signatureCanvas.onmousemove = function (e) { if (!isDrawing) return; var pos = getMousePos(e); signatureCtx.lineTo(pos.x, pos.y); signatureCtx.stroke(); };
      signatureCanvas.onmouseup = function () { isDrawing = false; };
      signatureCanvas.onmouseleave = function () { isDrawing = false; };
      signatureCanvas.ontouchstart = function (e) { e.preventDefault(); isDrawing = true; signatureCtx.beginPath(); var p = getMousePos(e.touches[0]); signatureCtx.moveTo(p.x, p.y); };
      signatureCanvas.ontouchmove = function (e) { e.preventDefault(); if (!isDrawing) return; var p = getMousePos(e.touches[0]); signatureCtx.lineTo(p.x, p.y); signatureCtx.stroke(); };
      signatureCanvas.ontouchend = function () { isDrawing = false; };
    }
    function getMousePos(e) {
      if (!signatureCanvas) return { x: 0, y: 0 };
      var rect = signatureCanvas.getBoundingClientRect();
      return { x: (e.clientX || e.pageX) - rect.left, y: (e.clientY || e.pageY) - rect.top };
    }
    function clearSignature() { if (signatureCtx) signatureCtx.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height); }
    function submitReceipt(btn) {
      if (!currentSigningRequestId) return;
      var blank = document.createElement('canvas');
      blank.width = signatureCanvas.width;
      blank.height = signatureCanvas.height;
      if (signatureCanvas.toDataURL() === blank.toDataURL()) { showToast('กรุณาเซ็นชื่อก่อนยืนยัน', 'warning'); return; }

      showToast('กำลังบันทึก...', 'info');
      var originalHtml = '';
      if (btn) {
        originalHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<div class="spinner" style="width:14px;height:14px;border-width:2px;margin-right:0.5rem;display:inline-block;vertical-align:middle;"></div> กำลังบันทึก...';
      }

      API.signForReceipt(currentSigningRequestId, signatureCanvas.toDataURL('image/png')).then(function (res) {
        showToast('✅ บันทึกการรับของเรียบร้อย', 'success');
        if (typeof triggerConfetti === 'function') triggerConfetti();
        closeModal('orderDetailModal');
        loadAdminOrders();
      }).catch(function (err) { showToast('ข้อผิดพลาด: ' + err, 'error'); }).finally(function () {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = originalHtml;
        }
      });
    }



    var currentProcessingOrderId = null;
    function openOrderApprovalModal(id, empName) {
      currentProcessingOrderId = id;
      document.getElementById('ai-id').textContent = '📄 เลขที่ใบเบิก: ' + id;
      document.getElementById('ai-user').textContent = '👤 ผู้เบิก: ' + (empName || 'ไม่ทราบชื่อ');
      document.getElementById('approvalComment').value = '';
      document.getElementById('approvalItems').innerHTML = '<div class="text-center p-4"><div class="spinner"></div></div>';
      document.getElementById('orderApprovalModal').classList.add('open');

      API.getOrderItems(id).then(function (res) {
        if (!res.data || res.data.length === 0) {
          document.getElementById('approvalItems').innerHTML = '<div class="text-center color-danger">ไม่พบรายการสินค้า</div>';
          return;
        }
        document.getElementById('approvalItems').innerHTML = '<div style="font-size:0.85rem;font-weight:600;margin-bottom:0.5rem">รายการสินค้า:</div>'
          + '<div class="card glass" style="padding:0.5rem">'
          + res.data.map(function (item) {
            var sizeInfo = item.size ? ' <span style="font-size:0.75rem; color:var(--accent); font-weight:normal">(' + item.size + ')</span>' : '';
            return '<div class="flex flex-wrap items-center justify-between gap-2" style="padding:0.5rem;border-bottom:1px solid rgba(255,255,255,0.05)">'
              + '<div style="font-size:0.9rem">' + item.productName + sizeInfo + '</div>'
              + '<div style="font-weight:700">x' + item.quantity + '</div>'
              + '</div>';
          }).join('')
          + '</div>';
        refreshIcons();
      });
    }

    function closeApprovalModal() {
      document.getElementById('orderApprovalModal').classList.remove('open');
      currentProcessingOrderId = null;
    }

    function submitOrderDecision(action) {
      if (!currentProcessingOrderId) return;
      if (!confirm('ยืนยันการ' + (action === 'approve' ? 'อนุมัติ' : 'ปฏิเสธ') + 'ใบเบิก ' + currentProcessingOrderId + ' ?')) return;
      var comment = document.getElementById('approvalComment').value.trim() || (action === 'approve' ? 'ผ่านการตรวจสอบ' : 'ไม่อนุมัติ');

      showToast('⏳ กำลังดำเนินการ...', 'info');

      var requestPromise = action === 'approve' ?
        API.approveRequest(currentProcessingOrderId, comment) :
        API.rejectRequest(currentProcessingOrderId, comment);

      requestPromise.then(function (res) {
        if (res.success) {
          showToast('✅ ดำเนินการ ' + (action === 'approve' ? 'อนุมัติ' : 'ปฏิเสธ') + ' เรียบร้อย', 'success');
          if (action === 'approve' && typeof triggerConfetti === 'function') triggerConfetti();
          closeApprovalModal();
          loadAdminOrders();
          loadDashboard();

        } else {
          showToast('❌ ' + res.message, 'error');
        }
      }).catch(function (err) {
        showToast('❌ ผิดพลาด: ' + err, 'error');
      });
    }

    function doDispatch(id, btnEl) {
      if (!confirm('ยืนยันการจ่ายพัสดุและตัดสต๊อกใบเบิก ' + id + ' ?')) return;

      var btn = btnEl || event.currentTarget;
      var oldHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<div class="spinner" style="width:14px;height:14px"></div>';

      API.dispatchRequest(id).then(function (res) {
        if (res.success) {
          showToast(res.message || 'ส่งพัสดุเรียบร้อย', 'success');
        } else {
          showToast(res.message, 'error');
        }
        loadAdminOrders();
        loadDashboard();
      }).catch(function (err) {
        showToast('ข้อผิดพลาด: ' + err, 'error');
      }).finally(function () {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = oldHtml;
        }
      });
    }

    function doReady(id) {
      showToast('กำลังส่งแจ้งเตือน...', 'info');
      API.setReady(id).then(function () {
        showToast('จัดสินค้าเสร็จแล้วและแจ้งเตือนผู้เบิกเรียบร้อย', 'success');
        loadAdminOrders();
        loadDashboard();
      }).catch(function (err) { showToast('ข้อผิดพลาด: ' + err, 'error'); });
    }

    // ─── EMPLOYEES ────────────────────────────────────────
    var allAdminTeams = [];
    var allAdminEmployees = [];

    function loadAdminEmployees() {
      var body = document.getElementById('employeesBody');
      if (body) body.innerHTML = '<tr><td colspan="7" class="text-center" style="padding:2rem"><div class="spinner"></div></td></tr>';

      Promise.all([API.getEmployees(), API.getTeams()]).then(function (results) {
        var resEmp = results[0];
        var resTeams = results[1];
        allAdminTeams = resTeams.data || [];
        allAdminEmployees = resEmp.data || [];

        if (!resEmp.data || resEmp.data.length === 0) {
          body.innerHTML = '<tr><td colspan="7" class="text-center" style="padding:2rem;color:var(--text3)">ไม่พบข้อมูลพนักงาน</td></tr>';
          return;
        }
        body.innerHTML = resEmp.data.map(function (e) {
          var isMe = currentUser && e.employeeId === currentUser.employeeId;
          var roleSelect = '<select class="input input-sm" onchange="changeEmpRole(\'' + e.employeeId + '\', this)" ' + (isMe ? 'disabled' : '') + '>'
            + '<option value="employee" ' + (e.role === 'employee' ? 'selected' : '') + '>พนักงานทั่วไป</option>'
            + '<option value="fc" ' + (e.role === 'fc' ? 'selected' : '') + '>FC</option>'
            + '<option value="technician" ' + (e.role === 'technician' ? 'selected' : '') + '>ช่างเทคนิค</option>'
            + '<option value="hr" ' + (e.role === 'hr' ? 'selected' : '') + '>HR</option>'
            + '<option value="manager" ' + (e.role === 'manager' ? 'selected' : '') + '>ผู้จัดการ</option>'
            + '<option value="admin" ' + (e.role === 'admin' ? 'selected' : '') + '>แอดมิน</option>'
            + '<option value="superadmin" ' + (e.role === 'superadmin' ? 'selected' : '') + '>แอดมินสูงสุด</option>'
            + '</select>';

          var teamName = '-';
          if (e.teamId) {
            var team = allAdminTeams.find(function (t) { return String(t.teamId) === String(e.teamId); });
            if (team) teamName = team.name;
          }

          return '<tr>'
            + '<td class="hide-mobile">' + e.employeeId + '</td>'
            + '<td style="font-weight:500">' + e.name + '</td>'
            + '<td class="hide-mobile">' + (e.department || '-') + '</td>'
            + '<td>' + teamName + '</td>'
            + '<td>' + (isMe ? '<span class="badge badge-approved">คุณ (' + e.role + ')</span>' : roleSelect) + '</td>'
            + '<td class="hide-mobile"><span class="badge ' + (e.status === 'active' ? 'badge-approved' : 'badge-rejected') + '">' + (e.status === 'active' ? 'ปกติ' : 'ปิด') + '</span></td>'
            + '<td class="flex flex-wrap gap-1">'
            + '<button class="btn btn-xs btn-outline" onclick="showUserSubStock(\'' + String(e.employeeId).replace(/'/g, "\\'") + '\', \'' + String(e.name || "").replace(/'/g, "\\'") + '\')" title="ดูคลังสินค้าส่วนตัว" ' + (hasPermission('supervise_substock') ? '' : 'style="display:none"') + '><i data-lucide="eye" style="width:12px;height:12px;pointer-events:none"></i></button>'
            + '<button class="btn btn-xs btn-outline" onclick="editEmployee(\'' + String(e.employeeId).replace(/'/g, "\\'") + '\')" title="แก้ไขข้อมูล" ' + (hasPermission('manage_users') ? '' : 'style="display:none"') + '><i data-lucide="edit-2" style="width:12px;height:12px;pointer-events:none"></i></button>'
            + (isMe || !hasPermission('manage_users') ? '' : '<button class="btn btn-xs btn-ghost hide-mobile" style="color:var(--danger)" onclick="delEmployee(\'' + String(e.employeeId).replace(/'/g, "\\'") + '\')" title="ลบพนักงาน"><i data-lucide="trash-2" style="width:12px;height:12px;pointer-events:none"></i></button>')
            + '</td>'
            + '</tr>';
        }).join('');
        refreshIcons();
      });
    }

    function changeEmpRole(id, sel) {
      var newRole = sel.value;
      if (!confirm('ยืนยันการเปลี่ยนบทบาทของ ' + id + ' เป็น ' + newRole + ' ?')) {
        loadAdminEmployees();
        return;
      }
      API.updateEmployeeRole(id, newRole).then(function (res) {
        if (res.success) showToast('เปลี่ยนบทบาทเรียบร้อย', 'success');
        else showToast(res.message, 'error');
        loadAdminEmployees();
      });
    }

    function editEmployee(id) {
      var emp = allAdminEmployees.find(function (e) {
        return String(e.employeeId) === String(id);
      });
      if (emp) openEmployeeModal(emp);
    }

    function openEmployeeModal(emp) {
      document.getElementById('ef-old-id').value = emp ? emp.employeeId : '';
      document.getElementById('ef-id').value = emp ? emp.employeeId : '';
      document.getElementById('ef-name').value = emp ? emp.name : '';

      // Load departments into dropdown
      var deptSel = document.getElementById('ef-dept');
      if (deptSel) {
        deptSel.innerHTML = '<option value="">-- เลือกแผนก --</option>' + allAdminDepartments.map(function (d) {
          return '<option value="' + d.name + '" ' + (emp && emp.department === d.name ? 'selected' : '') + '>' + d.name + '</option>';
        }).join('');
        initSearchableSelect('ef-dept');
      }

      document.getElementById('ef-role').value = emp ? emp.role : 'employee';

      // Load teams into dropdown
      var teamSel = document.getElementById('ef-team');
      if (teamSel) {
        teamSel.innerHTML = '<option value="">-- ไม่สังกัดทีม --</option>' + allAdminTeams.map(function (t) {
          return '<option value="' + t.teamId + '" ' + (emp && emp.teamId === t.teamId ? 'selected' : '') + '>' + t.name + '</option>';
        }).join('');
        initSearchableSelect('ef-team');
      }

      // Only superadmin can manage detailed permissions
      // Permissions are now managed in a separate page, so we only handle basic roles here.

      document.getElementById('employeeModalTitle').textContent = emp ? 'แก้ไขข้อมูลพนักงาน' : 'เพิ่มพนักงาน';
      document.getElementById('employeeModal').classList.add('open');
    }
    function closeEmployeeModal() { document.getElementById('employeeModal').classList.remove('open'); }

    function saveEmployee() {
      var oldId = document.getElementById('ef-old-id').value.trim();
      var data = {
        employeeId: document.getElementById('ef-id').value.trim(),
        name: document.getElementById('ef-name').value.trim(),
        department: document.getElementById('ef-dept').value.trim(),
        role: document.getElementById('ef-role').value,
        teamId: document.getElementById('ef-team').value
      };
      if (!data.employeeId || !data.name) { showToast('กรุณากรอกข้อมูลให้ครบถ้วน', 'warning'); return; }

      var btn = document.getElementById('saveEmployeeBtn');
      var oldHtml = btn.innerHTML;
      btn.innerHTML = '<div class="spinner" style="width:16px;height:16px"></div> กำลังบันทึก...';
      btn.disabled = true;

      var op = oldId ? 'update' : 'add';
      var apiCall = oldId ? API.manageEmployee(op, data, oldId) : API.addEmployee(data);

      apiCall.then(function (res) {
        if (res.success) {
          showToast(oldId ? 'อัปเดตข้อมูลเรียบร้อย' : 'เพิ่มพนักงานเรียบร้อย', 'success');
          closeEmployeeModal();
          loadAdminEmployees();
        } else {
          showToast(res.message, 'error');
        }
      }).catch(function (err) {
        showToast(err, 'error');
      }).finally(function () {
        btn.innerHTML = oldHtml;
        btn.disabled = false;
      });
    }

    // ─── PERMISSIONS PAGE (Role Based) ────────────────────
    var ADMIN_ROLES = [
      { id: 'employee', name: 'Employee (พนักงานทั่วไป)' },
      { id: 'fc', name: 'FC (คลังสินค้า/จ่ายของ)' },
      { id: 'technician', name: 'Technician (ช่างเทคนิค)' },
      { id: 'hr', name: 'HR (บุคคล)' },
      { id: 'manager', name: 'Manager (ผู้จัดการ)' },
      { id: 'admin', name: 'Admin (ผู้ดูแลระบบ)' },
      { id: 'superadmin', name: 'Superadmin (ผู้บริหาร)' }
    ];
    var PERMISSION_KEYS = [
      { key: 'view_prices', label: 'ดูราคา', cat: 'inventory' },
      { key: 'manage_inventory', label: 'จัดการสต็อก', cat: 'inventory' },
      { key: 'manage_products', label: 'จัดการรายการสินค้า', cat: 'inventory' },
      { key: 'manage_categories', label: 'จัดการหมวดหมู่', cat: 'inventory' },
      { key: 'has_substock', label: 'คลังย่อยส่วนตัว', cat: 'inventory' },
      { key: 'manage_team_substock', label: 'คลังย่อยทีม', cat: 'inventory' },
      { key: 'supervise_substock', label: 'ดูแลคลังย่อย', cat: 'inventory' },

      { key: 'can_request', label: 'สิทธิ์เบิก', cat: 'orders' },
      { key: 'approve_orders', label: 'อนุมัติใบเบิก', cat: 'orders' },
      { key: 'dispatch_orders', label: 'จ่ายของ', cat: 'orders' },

      { key: 'view_reports', label: 'ดูรายงาน', cat: 'reports' },
      { key: 'view_audit_logs', label: 'ดูประวัติกิจกรรม', cat: 'reports' },
      { key: 'export_excel', label: 'ส่งออก Excel', cat: 'reports' },

      { key: 'manage_users', label: 'จัดการคน/ทีม', cat: 'system' },
      { key: 'manage_branches', label: 'จัดการสาขา', cat: 'system' },
      { key: 'manage_settings', label: 'ตั้งค่าระบบ', cat: 'system' }
    ];
    var globalRolePermissions = {};
    var defaultRolePermissions = {};

    function loadPermissionsPage() {
      var body = document.getElementById('permissionsBody');
      if (body) body.innerHTML = '<tr><td colspan="16" class="text-center" style="padding:2rem"><div class="spinner"></div></td></tr>';

      API.getSystemSettings().then(function (res) {
        var settings = res.data || {};
        globalRolePermissions = settings.rolePermissions || {};
        defaultRolePermissions = res.defaultPermissions || {};

        var mapping = {
          'can_request': 'create_request',
          'view_prices': 'view_products',
          'approve_orders': 'approve_request',
          'dispatch_orders': 'dispatch_request',
          'manage_users': 'manage_employees',
          'manage_branches': 'manage_structure',
          'manage_inventory': 'manage_inventory',
          'manage_products': 'manage_products',
          'manage_categories': 'manage_categories',
          'view_reports': 'view_reports',
          'manage_settings': 'manage_settings'
        };

        body.innerHTML = ADMIN_ROLES.map(function (role) {
          var p = globalRolePermissions[role.id] || {};
          var defaults = defaultRolePermissions[role.id] || [];

          var cells = PERMISSION_KEYS.map(function (k) {
            var isChecked = false;
            if (p.hasOwnProperty(k.key)) {
              isChecked = p[k.key];
            } else {
              // Check hardcoded defaults
              var mapped = mapping[k.key];
              isChecked = defaults.indexOf(mapped) !== -1 || defaults.indexOf(k.key) !== -1;
            }

            var checkedAttr = isChecked ? 'checked' : '';
            return '<td style="text-align:center"><input type="checkbox" ' + checkedAttr + ' onchange="updateRolePermission(\'' + role.id + '\', \'' + k.key + '\', this.checked)"></td>';
          }).join('');

          var allowedCats = p.allowed_categories || [];
          var catLabel = allowedCats.length === 0 ? 'ทั้งหมด' : allowedCats.length + ' หมวด';

          return '<tr class="hover-row">' +
            '<td style="background:rgba(255,255,255,0.02); position:sticky; left:0; z-index:5">' +
            '<div style="font-weight:700; color:var(--primary)">' + role.name + '</div>' +
            '<button class="btn btn-xs btn-outline" style="margin-top:0.5rem" onclick="openRoleCategoryModal(\'' + role.id + '\')"><i data-lucide="layers" style="width:10px;height:10px"></i> ' + catLabel + '</button>' +
            '</td>' +
            cells +
            '</tr>';
        }).join('');
        refreshIcons();
      }).catch(function (err) {
        console.error('Failed to load role permissions:', err);
        body.innerHTML = '<tr><td colspan="16" class="text-center" style="padding:2rem">' +
          '<div style="color:var(--danger);margin-bottom:1rem">⚠️ ไม่สามารถโหลดข้อมูลสิทธิ์จากเซิร์ฟเวอร์ได้</div>' +
          '<button class="btn btn-sm btn-outline" onclick="loadPermissionsPage()">ลองใหม่อีกครั้ง</button>' +
          '</td></tr>';
        showToast('เกิดข้อผิดพลาด: ' + err, 'error');
      });
    }

    function updateRolePermission(roleId, key, value) {
      if (!globalRolePermissions[roleId]) globalRolePermissions[roleId] = {};
      globalRolePermissions[roleId][key] = value;
      saveAllRolePermissions();
    }

    function closeCategoryPermissionsModal() {
      var m = document.getElementById('categoryPermissionsModal');
      if (m) m.classList.remove('open');
    }

    function openRoleCategoryModal(roleId) {
      var role = ADMIN_ROLES.find(function (r) { return r.id === roleId; });
      if (!role) return;

      document.getElementById('cpm-role-id').value = roleId;
      document.getElementById('cpm-role-name').textContent = role.name;

      var p = globalRolePermissions[roleId] || {};
      var allowed = p.allowed_categories || [];

      var body = document.getElementById('cpm-list');
      API.getCategories().then(function (res) {
        var cats = res.data || [];
        body.innerHTML = cats.map(function (c) {
          var isChecked = allowed.includes(String(c.categoryId)) ? 'checked' : '';
          return '<label class="flex items-center gap-2 p-2 hover-bg" style="cursor:pointer; border-radius:4px">' +
            '<input type="checkbox" class="role-cat-checkbox" value="' + c.categoryId + '" ' + isChecked + '> ' +
            '<span>' + c.name + '</span>' +
            '</label>';
        }).join('');
      });
      document.getElementById('categoryPermissionsModal').classList.add('open');
    }

    function saveRoleCategoryPermissions() {
      var roleId = document.getElementById('cpm-role-id').value;
      var checkboxes = document.querySelectorAll('.role-cat-checkbox');
      var allowed = [];
      checkboxes.forEach(function (cb) { if (cb.checked) allowed.push(cb.value); });

      if (!globalRolePermissions[roleId]) globalRolePermissions[roleId] = {};
      globalRolePermissions[roleId].allowed_categories = allowed;

      saveAllRolePermissions();
      closeCategoryPermissionsModal();
      loadPermissionsPage();
    }

    function saveAllRolePermissions() {
      showToast('กำลังบันทึกสิทธิ์บทบาท...', 'info');
      API.getSystemSettings().then(function (res) {
        var settings = res.data || {};
        settings.rolePermissions = globalRolePermissions;
        return API.saveSystemSettings(settings);
      }).then(function (res) {
        if (res.success) showToast('บันทึกสิทธิ์บทบาทเรียบร้อย', 'success');
        else showToast(res.message, 'error');
      }).catch(function (err) {
        console.error('Save permissions error:', err);
        showToast('ไม่สามารถบันทึกสิทธิ์ได้ กรุณาตรวจสอบอินเทอร์เน็ต: ' + err, 'error');
      });
    }

    // ─── TEAMS ──────────────────────────────────────────
    function loadTeams() {
      var grid = document.getElementById('teamsGrid');
      if (grid) grid.innerHTML = '<div class="text-center" style="grid-column:1/-1; padding:3rem; color:var(--text3)"><div class="spinner" style="margin:0 auto 1rem"></div>กำลังโหลดข้อมูล...</div>';

      Promise.all([API.getTeams(), API.getEmployees()]).then(function (results) {
        var resTeams = results[0];
        var resEmp = results[1];
        allAdminTeams = resTeams.data || [];
        allAdminEmployees = resEmp.data || [];

        // ponytail: dynamically map members to teams since backend cache or return formats might miss them
        allAdminTeams.forEach(function (t) {
          var members = allAdminEmployees.filter(function (e) {
            return e.teamId && String(e.teamId) === String(t.teamId);
          });
          t.members = members;
          t.memberCount = members.length;
        });

        if (!grid) return;
        if (allAdminTeams.length === 0) {
          grid.innerHTML = '<div class="card text-center" style="grid-column:1/-1; padding:3rem; color:var(--text3)">ยังไม่มีทีมช่างในระบบ</div>';
          return;
        }
        grid.innerHTML = allAdminTeams.map(function (t) {
          return '<div class="card glass hover-lift">' +
            '<div class="flex flex-wrap items-center justify-between gap-2 mb-4">' +
            '<div>' +
            '<h3 style="margin:0; font-size:1.1rem">' + t.name + '</h3>' +
            '<span style="font-size:0.75rem; color:var(--text3)">ID: ' + t.teamId + '</span>' +
            '</div>' +
            '<div class="flex flex-wrap gap-1">' +
            '<button class="btn btn-ghost btn-xs" onclick="editTeam(\'' + String(t.teamId).replace(/'/g, "\\'") + '\')"><i data-lucide="edit-3" style="pointer-events:none"></i></button>' +
            '<button class="btn btn-ghost btn-xs" style="color:var(--danger)" onclick="delTeam(\'' + String(t.teamId).replace(/'/g, "\\'") + '\')"><i data-lucide="trash" style="pointer-events:none"></i></button>' +
            '</div>' +
            '</div>' +
            '<div style="background:rgba(251,191,36,0.05); padding:0.75rem; border-radius:12px; border:1px solid var(--glass-border); margin-bottom:1rem">' +
            '<div style="font-size:0.7rem; color:var(--primary); text-transform:uppercase; font-weight:800; letter-spacing:0.05em; margin-bottom:0.25rem">ตัวเอก (Lead)</div>' +
            '<div style="font-weight:700; display:flex; align-items:center; gap:0.5rem; margin-bottom:0.5rem"><i data-lucide="crown" style="width:14px; color:var(--primary)"></i> ' + (t.leadName || t.leadId) + '</div>' +
            '<div style="font-size:0.7rem; color:var(--text3); text-transform:uppercase; margin-bottom:0.25rem">สมาชิกในทีม:</div>' +
            '<div style="font-size:0.85rem; color:var(--text2); line-height:1.4">' +
            (t.members && t.members.length > 0 ? t.members.map(function (m) { return m.name; }).join(', ') : 'ไม่มีสมาชิก') +
            '</div>' +
            '</div>' +
            '<div class="flex flex-wrap items-center justify-between gap-2" style="font-size:0.85rem; color:var(--text2)">' +
            '<span>สมาชิก: ' + (t.memberCount || 0) + ' คน</span>' +
            '<div class="flex gap-1">' +
            (hasPermission('supervise_substock') || hasPermission('manage_team_substock') ? '<button class="btn btn-outline btn-xs" onclick="viewTeamInventory(\'' + String(t.teamId).replace(/'/g, "\\'") + '\')">ดูสต๊อกทีม</button>' : '') +
            '<button class="btn btn-primary btn-xs" onclick="openManageMembersModal(\'' + String(t.teamId).replace(/'/g, "\\'") + '\')">จัดการสมาชิก</button>' +
            '</div>' +
            '</div>' +
            '</div>';
        }).join('');
        refreshIcons();
      });
    }


    function openManageMembersModal(teamId) {
      document.getElementById('mm-team-id').value = teamId;
      var team = allAdminTeams.find(function (t) { return t.teamId === teamId; });
      document.getElementById('manageMembersTitle').textContent = 'จัดการสมาชิก: ' + (team ? team.name : teamId);

      renderMemberList(teamId);
      loadUnassignedEmployees();

      document.getElementById('manageMembersModal').classList.add('open');
    }
    function closeManageMembersModal() { document.getElementById('manageMembersModal').classList.remove('open'); }

    function renderMemberList(teamId) {
      var list = document.getElementById('mm-list');
      var members = allAdminEmployees.filter(function (e) {
        return e.teamId && String(e.teamId) === String(teamId);
      });

      if (members.length === 0) {
        list.innerHTML = '<p class="text-center" style="padding:1rem; color:var(--text3); font-size:0.85rem">ยังไม่มีสมาชิกในทีมนี้</p>';
        return;
      }

      list.innerHTML = members.map(function (m) {
        return '<div class="flex items-center justify-between p-2 glass" style="border-radius:8px">' +
          '<div>' +
          '<div style="font-weight:600; font-size:0.9rem">' + m.name + '</div>' +
          '<div style="font-size:0.75rem; color:var(--text3)">' + m.employeeId + ' (' + m.role + ')</div>' +
          '</div>' +
          '<button class="btn btn-ghost btn-xs" style="color:var(--danger)" onclick="removeMemberFromTeam(\'' + m.employeeId + '\', \'' + teamId + '\')">' +
          '<i data-lucide="user-minus" style="width:14px;height:14px"></i> ลบออก' +
          '</button>' +
          '</div>';
      }).join('');
      refreshIcons();
    }

    function loadUnassignedEmployees() {
      var sel = document.getElementById('mm-add-emp');
      // Filter for Technicians/FCs who don't have a team yet
      var available = allAdminEmployees.filter(function (e) {
        return (e.role === 'technician' || e.role === 'fc') && !e.teamId;
      });

      sel.innerHTML = '<option value="">-- เลือกพนักงานเพื่อเข้าทีม --</option>' + available.map(function (e) {
        return '<option value="' + e.employeeId + '">' + e.name + ' (' + e.employeeId + ')</option>';
      }).join('');
      initSearchableSelect('mm-add-emp');
    }

    function addMemberToTeam() {
      var teamId = document.getElementById('mm-team-id').value;
      var empId = document.getElementById('mm-add-emp').value;
      if (!empId) { showToast('กรุณาเลือกพนักงาน', 'warning'); return; }

      var emp = allAdminEmployees.find(function (e) { return String(e.employeeId) === String(empId); });
      if (!emp) return;

      API.updateEmployeeRole(empId, emp.role, teamId).then(function (res) {
        if (res.success) {
          showToast('เพิ่มเข้าทีมเรียบร้อย', 'success');
          // Update local cache
          emp.teamId = teamId;
          renderMemberList(teamId);
          loadUnassignedEmployees();
          loadTeams(); // Refresh team cards count
        } else {
          showToast(res.message, 'error');
        }
      });
    }

    function removeMemberFromTeam(empId, teamId) {
      if (!confirm('ยืนยันการนำสมาชิกออกจากทีม?')) return;

      var emp = allAdminEmployees.find(function (e) { return String(e.employeeId) === String(empId); });
      if (!emp) return;

      API.updateEmployeeRole(empId, emp.role, '').then(function (res) {
        if (res.success) {
          showToast('นำออกจากทีมเรียบร้อย', 'success');
          // Update local cache
          emp.teamId = '';
          renderMemberList(teamId);
          loadUnassignedEmployees();
          loadTeams(); // Refresh team cards count
        } else {
          showToast(res.message, 'error');
        }
      });
    }

    function openTeamModal(team) {
      document.getElementById('tf-id').value = team ? team.teamId : '';
      document.getElementById('tf-id-wrap').style.display = team ? 'block' : 'none';
      document.getElementById('tf-name').value = team ? team.name : '';

      // Filter for Technicians/FCs or the current lead
      var technicians = allAdminEmployees.filter(function (e) {
        return e.role === 'technician' || e.role === 'fc' || (team && String(team.leadId) === String(e.employeeId));
      });
      var leadSel = document.getElementById('tf-lead');
      leadSel.innerHTML = '<option value="">-- เลือกหัวหน้าทีม --</option>' + technicians.map(function (e) {
        return '<option value="' + e.employeeId + '" ' + (team && String(team.leadId) === String(e.employeeId) ? 'selected' : '') + '>' + e.name + ' (' + e.employeeId + ')</option>';
      }).join('');
      initSearchableSelect('tf-lead');

      var membersDiv = document.getElementById('tf-members');
      membersDiv.innerHTML = '';
      var teamIdToMatch = team ? team.teamId : '';
      var members = allAdminEmployees.filter(function (e) {
        return e.teamId && String(e.teamId) === String(teamIdToMatch);
      });

      if (members.length > 0) {
        membersDiv.innerHTML = members.map(function (m) {
          return '<div class="badge badge-pending" style="font-size:0.75rem; padding:0.4rem 0.8rem; display:flex; align-items:center; gap:0.5rem">' +
            m.name +
            '<span style="cursor:pointer; opacity:0.6" onclick="removeMemberFromTeam(\'' + String(m.employeeId).replace(/'/g, "\\'") + '\', \'' + String(teamIdToMatch).replace(/'/g, "\\'") + '\'); this.parentElement.remove()">✕</span>' +
            '</div>';
        }).join('');
      } else {
        membersDiv.innerHTML = '<span style="font-size:0.8rem; color:var(--text3)">ยังไม่มีสมาชิก</span>';
      }

      document.getElementById('teamModalTitle').textContent = team ? 'แก้ไขข้อมูลทีม' : 'สร้างทีมใหม่';
      document.getElementById('teamModal').classList.add('open');
      refreshIcons();
    }
    function closeTeamModal() { document.getElementById('teamModal').classList.remove('open'); }

    function editTeam(id) {
      var team = allAdminTeams.find(function (t) {
        return String(t.teamId) === String(id);
      });
      if (team) openTeamModal(team);
    }

    function saveTeam() {
      var data = {
        teamId: document.getElementById('tf-id').value,
        name: document.getElementById('tf-name').value.trim(),
        leadId: document.getElementById('tf-lead').value
      };
      if (!data.name || !data.leadId) { showToast('กรุณากรอกข้อมูลให้ครบถ้วน', 'warning'); return; }

      var btn = document.getElementById('saveTeamBtn');
      var oldHtml = btn.innerHTML;
      btn.innerHTML = '<div class="spinner" style="width:16px;height:16px"></div> กำลังบันทึก...';
      btn.disabled = true;

      var op = data.teamId ? 'update' : 'add';
      API.manageTeam(op, data).then(function (res) {
        if (res.success) {
          showToast('บันทึกข้อมูลทีมเรียบร้อย', 'success');
          closeTeamModal();
          loadTeams();
        } else {
          showToast(res.message, 'error');
        }
      }).catch(function (err) {
        showToast(err, 'error');
      }).finally(function () {
        btn.innerHTML = oldHtml;
        btn.disabled = false;
      });
    }

    function delTeam(id) {
      if (!confirm('ยืนยันการลบทีม ' + id + ' ? (สมาชิกในทีมจะกลายเป็นผู้ไม่สังกัดทีม)')) return;
      API.manageTeam('delete', { teamId: id }).then(function (res) {
        if (res && res.success) {
          showToast('ลบทีมเรียบร้อย', 'success');
          loadTeams();
        } else {
          showToast(res.message || 'ไม่สามารถลบทีมได้', 'error');
        }
      }).catch(function (err) { showToast('ข้อผิดพลาด: ' + err, 'error'); });
    }

    function openSwapLeadModal() {
      var s1 = document.getElementById('swap-t1');
      var s2 = document.getElementById('swap-t2');
      var opStr = '<option value="">-- เลือกทีม --</option>' + allAdminTeams.map(function (t) { return '<option value="' + t.teamId + '">' + t.name + '</option>'; }).join('');
      s1.innerHTML = opStr;
      s2.innerHTML = opStr;
      initSearchableSelect('swap-t1');
      initSearchableSelect('swap-t2');
      document.getElementById('swapPreview').style.display = 'none';
      document.getElementById('swapLeadModal').classList.add('open');
      refreshIcons();
    }
    function closeSwapLeadModal() { document.getElementById('swapLeadModal').classList.remove('open'); }

    function updateSwapPreview() {
      var t1id = document.getElementById('swap-t1').value;
      var t2id = document.getElementById('swap-t2').value;
      var preview = document.getElementById('swapPreview');

      if (t1id && t2id && t1id !== t2id) {
        var t1 = allAdminTeams.find(function (t) { return t.teamId === t1id; });
        var t2 = allAdminTeams.find(function (t) { return t.teamId === t2id; });
        document.getElementById('sp-t1-lead').innerHTML = '<div style="font-size:0.75rem; color:var(--text3)">' + t1.name + '</div><div style="font-weight:700">' + t1.leadName + '</div>';
        document.getElementById('sp-t2-lead').innerHTML = '<div style="font-size:0.75rem; color:var(--text3)">' + t2.name + '</div><div style="font-weight:700">' + t2.leadName + '</div>';
        preview.style.display = 'block';
      } else {
        preview.style.display = 'none';
      }
      refreshIcons();
    }

    function executeSwapLead() {
      var t1id = document.getElementById('swap-t1').value;
      var t2id = document.getElementById('swap-t2').value;
      if (!t1id || !t2id || t1id === t2id) { showToast('กรุณาเลือก 2 ทีมที่แตกต่างกัน', 'warning'); return; }

      if (!confirm('ยืนยันการสลับ "ตัวเอก" ระหว่างทีม? (รวมถึงการย้ายสิทธิ์การจัดการและสต๊อกของทีม)')) return;

      API.swapTeamLead({ team1Id: t1id, team2Id: t2id }).then(function (res) {
        showToast('สลับตัวเอกเรียบร้อย', 'success');
        closeSwapLeadModal();
        loadTeams();
        if (typeof triggerConfetti === 'function') triggerConfetti();
      }).catch(function (err) { showToast(err, 'error'); });
    }

    function viewTeamInventory(teamId) {
      // Re-use existing substock viewer but with team ID
      showUserSubStock(teamId, 'สต๊อกทีม ' + teamId, true);
    }

    function showUserSubStock(targetId, title, isTeam) {
      // existing showUserSubStock usually takes employee ID, we'll adapt it to handle team ID if needed
      // For now, let's assume API.getSubStock handles it if we pass { teamId: targetId }
      var modal = document.getElementById('orderDetailModal');
      var body = document.getElementById('orderDetailBody');
      var sig = document.getElementById('signatureSection');
      if (!modal || !body) return;

      body.innerHTML = '<div class="text-center p-4"><div class="spinner"></div></div>';
      sig.classList.add('hidden');
      modal.classList.add('open');

      API.getSubStock({ employeeId: isTeam ? null : targetId, teamId: isTeam ? targetId : null }).then(function (res) {
        var items = res.data || [];
        
        var histPromise = !isTeam ? API.getTransferHistory({ employeeId: targetId }) : Promise.resolve({success:true, data:[]});
        
        histPromise.then(function(histRes) {
          var html = '<div class="flex justify-between items-center mb-4" style="gap:0.5rem; flex-wrap:wrap"><h4>📦 คลังย่อย: ' + title + '</h4>' +
            '<div style="display:flex; gap:0.5rem">' +
            '<button class="btn btn-outline btn-sm" onclick="exportAdminSubStockExcel(\'' + title + '\')"><i data-lucide="download"></i> Export Excel</button>' +
            '<button class="btn btn-accent btn-sm" onclick="openScannerForSubStock(\'' + targetId + '\', \'' + (isTeam ? 'team' : 'personal') + '\')"><i data-lucide="scan"></i> สแกนใช้งาน</button>' +
            '</div></div>';

          window._tempSubStockExportData = items;

          if (items.length === 0) {
            html += '<div class="empty-state" style="margin-bottom:1.5rem"><i>📦</i><p>ไม่พบพัสดุในคลังย่อย</p></div>';
          } else {
            html += '<div class="table-wrap mb-4" style="margin-bottom:1.5rem"><table><thead><tr><th>สินค้า</th><th>ไซส์</th><th>จำนวน</th></tr></thead><tbody>' +
              items.map(function (i) {
                return '<tr><td>' + (i.productName || i.productId) + '</td><td>' + (i.size || '-') + '</td><td style="font-weight:700">' + i.quantity + '</td></tr>';
              }).join('') + '</tbody></table></div>';
          }

          if (!isTeam) {
            var hist = histRes.data || [];
            html += '<h4 style="margin-bottom:0.5rem">🔄 ประวัติการโอน</h4>';
            if (hist.length === 0) {
               html += '<div class="empty-state" style="padding:1rem; border:1px dashed var(--border)">ไม่มีประวัติการโอน</div>';
            } else {
               html += '<div class="table-wrap"><table><thead><tr><th>วันที่</th><th>รายการ</th><th>จำนวน</th><th>โอน/รับจาก</th></tr></thead><tbody>' +
                 hist.map(function(h) {
                   var isOut = h.quantity < 0;
                   return '<tr><td style="font-size:0.8rem">' + (h.date||'-') + '</td><td>' + (h.productName||h.productId) + ' <span class="badge" style="font-size:0.7rem">' + (h.action||'') + '</span></td><td style="' + (isOut?'color:var(--danger)':'color:var(--success)') + ';font-weight:700">' + (isOut?'':'+') + h.quantity + '</td><td>' + (h.relatedUser||'-') + '</td></tr>';
                 }).join('') + '</tbody></table></div>';
            }
          }
          
          body.innerHTML = html;
          refreshIcons();
        });
      }).catch(function(err) {
        body.innerHTML = '<div class="empty-state"><p style="color:var(--danger)">เกิดข้อผิดพลาด: ' + err + '</p></div>';
      });
    }

    function exportAdminSubStockExcel(title) {
      var items = window._tempSubStockExportData || [];
      if (items.length === 0) {
        showToast('ไม่มีข้อมูล', 'warning');
        return;
      }
      var ws_data = [["รหัสสินค้า", "ชื่อสินค้า", "ไซส์", "จำนวน", "อัปเดตล่าสุด"]];
      items.forEach(function(i) {
        ws_data.push([
          i.productId || '',
          i.productName || i.productId || '',
          i.size || '',
          i.quantity || 0,
          i.lastUpdate || ''
        ]);
      });
      var ws = XLSX.utils.aoa_to_sheet(ws_data);
      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "SubStock");
      XLSX.writeFile(wb, "SubStock_" + title + ".xlsx");
    }


    function delEmployee(id) {
      if (!confirm('ยืนยันการลบพนักงาน ' + id + ' ?')) return;
      API.deleteEmployee(id).then(function (res) {
        if (res.success) { showToast('ลบเรียบร้อย', 'success'); loadAdminEmployees(); }
        else showToast(res.message, 'error');
      });
    }

    function loadAdminDepartments() {
      var body = document.getElementById('departmentsBody');
      if (body) body.innerHTML = '<tr><td colspan="3" class="text-center" style="padding:2rem"><div class="spinner"></div></td></tr>';

      API.getReportData('Departments').then(function (res) {
        if (!body) return;
        allAdminDepartments = res.data || [];
        if (!res.data || res.data.length === 0) {
          body.innerHTML = '<tr><td colspan="3" class="text-center" style="padding:2rem;color:var(--text3)">ไม่พบข้อมูลแผนก</td></tr>';
          return;
        }
        body.innerHTML = res.data.map(function (d) {
          return '<tr>'
            + '<td>' + (d.departmentId || '-') + '</td>'
            + '<td style="font-weight:600">' + d.name + '</td>'
            + '<td class="flex gap-1">'
            + '<button class="btn btn-sm btn-ghost" onclick="openDeptModal({departmentId:\'' + d.departmentId + '\', name:\'' + d.name + '\'})"><i data-lucide="edit-2" style="width:14px;height:14px;pointer-events:none"></i></button>'
            + '<button class="btn btn-sm btn-ghost" style="color:var(--danger)" onclick="delDept(\'' + d.departmentId + '\')"><i data-lucide="trash-2" style="width:14px;height:14px;pointer-events:none"></i></button></td>'
            + '</tr>';
        }).join('');
        refreshIcons();
      });
    }

    function openDeptModal(dept) {
      document.getElementById('df-old-id').value = dept ? dept.departmentId : '';
      document.getElementById('df-id').value = dept ? dept.departmentId : '';
      document.getElementById('df-name').value = dept ? dept.name : '';
      document.getElementById('deptModalTitle').textContent = dept ? 'แก้ไขแผนก' : 'เพิ่มแผนก';
      document.getElementById('deptModal').classList.add('open');
    }
    function closeDeptModal() { document.getElementById('deptModal').classList.remove('open'); }

    function saveDept() {
      var oldId = document.getElementById('df-old-id').value.trim();
      var data = {
        departmentId: document.getElementById('df-id').value.trim(),
        name: document.getElementById('df-name').value.trim()
      };
      if (!data.name) { showToast('กรุณากรอกชื่อแผนก', 'warning'); return; }

      var op = oldId ? 'update' : 'add';
      showToast('กำลังบันทึก...', 'info');
      API.manageDepartment(op, data, oldId).then(function (res) {
        if (res.success) {
          showToast(res.message || 'บันทึกแผนกเรียบร้อย', 'success');
          closeDeptModal();
          loadAdminDepartments();
        } else {
          showToast(res.message || 'เกิดข้อผิดพลาด', 'error');
        }
      }).catch(function (err) {
        showToast('ผิดพลาด: ' + err, 'error');
      });
    }

    function delDept(id) {
      if (!confirm('ยืนยันการลบแผนก?')) return;
      API.manageDepartment('delete', { departmentId: id }).then(function (res) {
        if (res.success) {
          showToast('ลบแผนกเรียบร้อย', 'success');
          loadAdminDepartments();
        } else {
          showToast(res.message, 'error');
        }
      });
    }

    function openExportModal() {
      // โหลดรายชื่อแผนกมาใส่ใน select (ถ้ามี)
      API.getReportData('Departments').then(function (res) {
        var sel = document.getElementById('ex-dept');
        sel.innerHTML = '<option value="all">ทั้งหมด</option>' + (res.data || []).map(function (d) {
          return '<option value="' + d.name + '">' + d.name + '</option>';
        }).join('');
        initSearchableSelect('ex-dept');
      });
      document.getElementById('exportModal').classList.add('open');
    }
    function closeExportModal() { document.getElementById('exportModal').classList.remove('open'); }



    var _subStockTarget = null;
    var _subStockType = null;
    function openScannerForSubStock(targetId, type) {
      _subStockTarget = targetId;
      _subStockType = type;
      setScanMode('sub');
      openScanner();
    }
    function doDetailedExport() {
      var filters = {
        startDate: document.getElementById('ex-start').value,
        endDate: document.getElementById('ex-end').value,
        department: document.getElementById('ex-dept').value,
        status: document.getElementById('ex-status').value
      };

      var btn = document.getElementById('doExportBtn');
      var oldHtml = btn.innerHTML;
      btn.innerHTML = '<div class="spinner" style="width:16px;height:16px"></div> กำลังเตรียมข้อมูล...';
      btn.disabled = true;

      API.getFilteredOrders(filters).then(function (res) {
        if (!res.data || res.data.length === 0) { showToast('ไม่มีข้อมูลตามเงื่อนไขที่เลือก', 'warning'); return; }

        var ws = XLSX.utils.json_to_sheet(res.data);
        var wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Detailed_Report");

        XLSX.writeFile(wb, 'Detailed_Requisition_' + new Date().getTime() + '.xlsx');
        showToast('✅ ดาวน์โหลดเรียบร้อย', 'success');
        closeExportModal();
      }).catch(function (err) {
        showToast('เกิดข้อผิดพลาด: ' + err, 'error');
      }).finally(function () {
        btn.innerHTML = oldHtml;
        btn.disabled = false;
      });
    }

    // ─── INVENTORY ────────────────────────────────────────
    function loadInventory() {
      var body = document.getElementById('inventoryBody');
      if (body) body.innerHTML = '<tr><td colspan="6" class="text-center" style="padding:2rem"><div class="spinner"></div></td></tr>';

      API.getProducts().then(function (res) {
        if (!res.success) return;
        var body = document.getElementById('inventoryBody');
        if (!body) return;
        body.innerHTML = res.data.map(function (p) {
          var isTotalLow = Number(p.stock) <= Number(p.minStock);
          var isAnySizeLow = false;
          var lowSizes = [];
          if (p.variantStock) {
            var vs = {};
            try {
              vs = typeof p.variantStock === 'string' ? JSON.parse(p.variantStock) : p.variantStock;
            } catch (e) { }
            for (var k in vs) {
              if (Number(vs[k]) <= 2) {
                isAnySizeLow = true;
                lowSizes.push(k);
              }
            }
          }
          var isLow = isTotalLow || isAnySizeLow;

          var statusBadge = '<span class="badge badge-approved">ปกติ</span>';
          if (isLow) {
            var lowText = isTotalLow ? 'ทั้งหมด' : lowSizes.join(', ');
            statusBadge = '<span class="badge badge-rejected">⚠️ ต่ำ: ' + lowText + '</span>';
          }

          return '<tr>'
            + '<td>' + p.productId + '</td>'
            + '<td style="font-weight:500">' + p.name + '</td>'
            + '<td style="font-weight:700;' + (isTotalLow ? 'color:var(--danger)' : '') + '">'
            + '<div>' + p.stock + '</div>'
            + (p.variantStock ? '<div style="font-size:0.65rem; color:var(--text3); font-weight:normal">' + formatVariantStock(p.variantStock, 2) + '</div>' : '')
            + '</td>'
            + '<td>' + p.minStock + '</td>'
            + '<td>' + statusBadge + '</td>'
            + '<td><button class="btn btn-sm btn-outline" onclick="openStockModal(\'' + p.productId + '\',\'' + p.name + '\')">ปรับ</button></td>'
            + '</tr>';
        }).join('');
        refreshIcons();
      });
    }

    function openStockModal(id, name) {
      document.getElementById('stockProductId').value = id;
      document.getElementById('stockProductName').textContent = '📦 ' + name;
      document.getElementById('stockAdjust').value = '';

      var sizeContainer = document.getElementById('sizeStockContainer');
      var sizeInputs = document.getElementById('sizeStockInputs');
      var adjustWrap = document.getElementById('stockAdjustWrap');

      sizeInputs.innerHTML = '';
      sizeContainer.style.display = 'none';
      adjustWrap.style.display = 'block';

      // ค้นหาสินค้าเพื่อดูว่ามีไซส์ไหม
      var p = allAdminProducts.find(function (x) { return String(x.productId) === String(id); });
      if (p && (p.sizes || p.variantStock)) {
        var sizes = [];
        if (p.sizes) {
          sizes = p.sizes.split(',').map(function (s) { return s.trim(); }).filter(function (s) { return s !== ''; });
        } else if (p.variantStock) {
          try {
            var vs = typeof p.variantStock === 'string' ? JSON.parse(p.variantStock) : p.variantStock;
            sizes = Object.keys(vs);
          } catch (e) { }
        }

        if (sizes.length > 0) {
          adjustWrap.style.display = 'none';
          sizeContainer.style.display = 'block';
          sizeInputs.innerHTML = sizes.map(function (s) {
            return '<div class="form-group" style="margin:0">' +
              '<label class="form-label" style="font-size:0.75rem;margin-bottom:0.25rem">ไซส์ ' + s + '</label>' +
              '<input type="number" class="form-input size-adj-input" data-size="' + s + '" placeholder="0" style="text-align:center;font-weight:600">' +
              '</div>';
          }).join('');
        }
      }

      document.getElementById('stockModal').classList.add('open');
    }
    function closeStockModal() { document.getElementById('stockModal').classList.remove('open'); }

    function doStockAdjust() {
      var id = document.getElementById('stockProductId').value;
      var adj = Number(document.getElementById('stockAdjust').value);

      var isBulk = document.getElementById('sizeStockContainer').style.display !== 'none';
      var adjustments = null;

      if (isBulk) {
        adjustments = {};
        var inputs = document.querySelectorAll('.size-adj-input');
        var hasAny = false;
        inputs.forEach(function (inp) {
          var val = Number(inp.value);
          if (val !== 0) {
            adjustments[inp.dataset.size] = val;
            hasAny = true;
          }
        });
        if (!hasAny) { showToast('กรุณากรอกจำนวนในอย่างน้อยหนึ่งไซส์', 'warning'); return; }
      } else {
        if (!adj) { showToast('กรุณากรอกจำนวน', 'warning'); return; }
      }

      var btn = document.getElementById('doStockAdjustBtn');
      var oldHtml = btn.innerHTML;
      btn.innerHTML = '<div class="spinner" style="width:16px;height:16px"></div> กำลังบันทึก...';
      btn.disabled = true;

      API.updateStock(id, adj, (currentUser ? currentUser.employeeId : 'SYSTEM'), null, adjustments).then(function (res) {
        showToast(res.message || res.error, res.success ? 'success' : 'error');
        if (res.success) {
          closeStockModal();
          loadInventory();
          loadDashboard();
        }
      }).catch(function (err) {
        showToast(err, 'error');
      }).finally(function () {
        btn.innerHTML = oldHtml;
        btn.disabled = false;
      });
    }

    function loadAuditLogs() {
      var body = document.getElementById('auditBody');
      if (!body) return;
      body.innerHTML = '<tr><td colspan="5" class="text-center" style="padding:2rem"><div class="spinner"></div></td></tr>';

      API.getReportData('auditActivities').then(function (res) {
        if (!res.success || !res.data || !res.data.logs) {
          body.innerHTML = '<tr><td colspan="5" class="text-center" style="padding:2rem">ไม่พบประวัติกิจกรรม</td></tr>';
          return;
        }
        body.innerHTML = res.data.logs.map(function (l) {
          var detailDisplay = l.detail;
          try {
            if (l.detail && l.detail.indexOf('{') === 0) {
              var parsed = JSON.parse(l.detail);
              detailDisplay = '<pre style="font-size:0.7rem; margin:0; opacity:0.7; overflow:auto; max-width:200px">' + JSON.stringify(parsed, null, 2) + '</pre>';
            }
          } catch (e) { }

          return '<tr>'
            + '<td>' + l.logId + '</td>'
            + '<td>' + (l.user || 'SYSTEM') + '</td>'
            + '<td>' + l.action + '</td>'
            + '<td style="font-size:0.85rem">' + detailDisplay + '</td>'
            + '<td style="font-size:0.75rem">' + l.timestamp + '</td>'
            + '</tr>';
        }).join('');
        refreshIcons();
      }).catch(function (err) {
        body.innerHTML = '<tr><td colspan="5" class="text-center" style="padding:2rem;color:var(--danger)">ไม่สามารถโหลดข้อมูลได้: ' + err + '</td></tr>';
      });
    }

    function loadInventoryAudit() {
      var body = document.getElementById('inventoryAuditBody');
      if (!body) return;

      // ดึงค่าจากตัวกรอง
      var teamId = document.getElementById('logFilterTeam') ? document.getElementById('logFilterTeam').value : 'all';
      var userId = document.getElementById('logFilterUser') ? document.getElementById('logFilterUser').value : 'all';
      var productQuery = document.getElementById('logFilterProduct') ? document.getElementById('logFilterProduct').value : '';

      body.innerHTML = '<tr><td colspan="6" class="text-center" style="padding:2rem"><div class="spinner"></div></td></tr>';

      // ส่ง Parameter ไปยัง Backend
      API.getInventoryLogs({
        userFilter: userId,
        productIdFilter: productQuery,
        limit: 100,
        teamFilter: teamId
      }).then(function (res) {
        var logs = res.data || [];
        if (logs.length === 0) {
          body.innerHTML = '<tr><td colspan="6" class="text-center" style="padding:2rem; color:var(--text3)">ยังไม่มีประวัติการเบิกใช้พัสดุตามเงื่อนไขที่เลือก</td></tr>';
          return;
        }
        body.innerHTML = logs.map(function (l) {
          var color = Number(l.quantity) < 0 ? 'var(--danger)' : 'var(--accent)';
          var icon = Number(l.quantity) < 0 ? '📤' : '📥';
          return '<tr>'
            + '<td style="font-size:0.75rem">' + (l.date || '-') + '</td>'
            + '<td style="font-weight:500">' + (l.userName || l.user) + '</td>'
            + '<td>' + l.productName + '</td>'
            + '<td class="text-center" style="font-weight:700; color:' + color + '">' + icon + ' ' + Math.abs(l.quantity) + '</td>'
            + '<td>' + (l.branchName || l.branchId || '-') + '</td>'
            + '<td style="font-size:0.8rem; color:var(--text3)">' + l.action + '</td>'
            + '</tr>';
        }).join('');
      }).catch(function (err) {
        body.innerHTML = '<tr><td colspan="6" class="text-center" style="padding:2rem; color:var(--danger)">เกิดข้อผิดพลาดในการโหลดประวัติการใช้งาน</td></tr>';
      });
    }

    // ฟังก์ชันเมื่อเปลี่ยนทีม -> กรองรายชื่อพนักงาน
    function onLogTeamChange() {
      var teamId = document.getElementById('logFilterTeam').value;
      var userSelect = document.getElementById('logFilterUser');

      // กรองพนักงานในทีม
      var filteredEmps = allEmployees.filter(function (e) {
        return teamId === 'all' || String(e.teamId) === String(teamId);
      });

      userSelect.innerHTML = '<option value="all">ทุกคน (All Employees)</option>' +
        filteredEmps.map(function (e) {
          return '<option value="' + e.employeeId + '">' + e.name + ' (' + e.employeeId + ')</option>';
        }).join('');

      loadInventoryAudit();
    }

    // เริ่มต้นตัวกรองทีมและพนักงาน
    function initLogFilters() {
      var teamSelect = document.getElementById('logFilterTeam');
      if (!teamSelect) return;

      // เติมรายชื่อทีม
      API.getTeams().then(function (res) {
        var teams = res.data || [];
        teamSelect.innerHTML = '<option value="all">ทุกทีม (All Teams)</option>' +
          teams.map(function (t) {
            return '<option value="' + t.teamId + '">' + t.name + '</option>';
          }).join('');
        refreshIcons();
      });

      // ดึงรายชื่อพนักงานทั้งหมดไว้รอ (ถ้ายังไม่มี)
      if (!allEmployees || allEmployees.length === 0) {
        API.getEmployees().then(function (res) {
          allEmployees = res.data || [];
          onLogTeamChange(); // Init user list
        });
      } else {
        onLogTeamChange();
      }
    }

    // ─── REPORTS ──────────────────────────────────────────


    function loadReports() {
      var topList = document.getElementById('reportTopList');
      var deptList = document.getElementById('reportDeptList');
      if (topList) topList.innerHTML = '<div class="text-center" style="padding:2rem"><div class="spinner"></div></div>';
      if (deptList) deptList.innerHTML = '<div class="text-center" style="padding:2rem"><div class="spinner"></div></div>';

      API.getAdvancedDashboardData().then(function (res) {
        if (!res.success || !res.data) return;

        // 1. Render Charts
        if (res.data.topProducts) {
          renderTopProductsChart(res.data.topProducts, 'reportProductsChart');
        }
        if (res.data.categorySpending) {
          renderCategorySpendingChart(res.data.categorySpending, 'reportCategoryChart');
        }

        // 2. Render List Data
        if (topList) {
          topList.innerHTML = res.data.topProducts.map(function (tp, idx) {
            return '<div class="flex items-center justify-between" style="padding:0.5rem; border-bottom:1px solid var(--border); font-size:0.85rem">' +
              '<span>' + (idx + 1) + '. ' + tp.productName + '</span>' +
              '<span style="font-weight:700; color:var(--accent)">' + tp.totalQty + ' ชิ้น</span>' +
              '</div>';
          }).join('');
        }

        if (deptList) {
          deptList.innerHTML = '<div style="font-size:0.75rem; color:var(--text3); margin-bottom:0.5rem; margin-top:1rem">สัดส่วนตามแผนก:</div>' +
            res.data.deptSpending.map(function (ds) {
              return '<div class="flex justify-between" style="font-size:0.85rem; margin-bottom:0.25rem">' +
                '<span>' + ds.department + '</span>' +
                '<span style="color:var(--primary-light)">฿' + (ds.totalSpending || 0).toLocaleString() + '</span>' +
                '</div>';
            }).join('');
        }

        // 3. Render Inventory Table
        API.getInventoryForecast().then(function (resInv) {
          var body = document.getElementById('reportInventoryBody');
          if (!body) return;
          if (!resInv.success || !resInv.data) {
            body.innerHTML = '<tr><td colspan="6" class="text-center">ไม่มีข้อมูล</td></tr>';
            return;
          }
          body.innerHTML = resInv.data.slice(0, 20).map(function (p) {
            var statusClass = p.currentStock <= 0 ? 'badge-rejected' : p.currentStock <= 5 ? 'badge-pending' : 'badge-approved';
            var statusText = p.currentStock <= 0 ? 'หมด' : p.currentStock <= 5 ? 'ใกล้หมด' : 'ปกติ';
            return '<tr>' +
              '<td>' + p.productId + '</td>' +
              '<td style="font-weight:500">' + p.productName + '</td>' +
              '<td>' + getCategoryName(p.category) + '</td>' +
              '<td>' +
              '<div style="font-weight:700">' + p.currentStock + '</div>' +
              (p.variantStock ? '<div style="font-size:0.7rem; color:var(--text3)">' + formatVariantStock(p.variantStock) + '</div>' : '') +
              '</td>' +
              '<td>' + (p.minStock || 5) + '</td>' +
              '<td><span class="badge ' + statusClass + '">' + statusText + '</span></td>' +
              '</tr>';
          }).join('');
        });
      });
    }

    function showToast(msg, type) {
      var c = document.getElementById('toastContainer');
      var t = document.createElement('div');
      t.className = 'toast ' + (type || 'success');
      t.textContent = msg;
      c.appendChild(t);
      setTimeout(function () { t.remove(); }, 4000);
    }


    /**
     * getImageUrl - แปลงลิงก์ Google Drive ให้เป็น Direct Link
     */
    function getImageUrl(url) {
      if (!url) return '';
      if (typeof url !== 'string') return '';
      // หากเป็นลิงก์ Google Drive หรือ lh3
      if (url.indexOf('drive.google.com') !== -1 || url.indexOf('lh3.googleusercontent.com') !== -1 || url.indexOf('googleusercontent.com') !== -1) {
        var id = '';
        if (url.indexOf('id=') !== -1) {
          id = url.split('id=')[1].split('&')[0];
        } else if (url.indexOf('/d/') !== -1) {
          id = url.split('/d/')[1].split('/')[0];
        } else if (url.indexOf('lh3.googleusercontent.com') !== -1 || url.indexOf('googleusercontent.com') !== -1) {
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

    // ─── CSV EXPORT ─────────────────────────────────────────
    function _downloadCSVGeneric(sheetName) {
      showToast('⏳ กำลังเตรียมข้อมูล ' + sheetName + '...', 'info');
      API.exportToCSV(sheetName).then(function (res) {
        if (!res.success) { showToast('ไม่สามารถดึงข้อมูลได้', 'error'); return; }
        var BOM = '\uFEFF'; // UTF-8 BOM สำหรับ Excel ภาษาไทย
        var blob = new Blob([BOM + res.csv], { type: 'text/csv;charset=utf-8;' });
        var link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = res.filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('✅ ดาวน์โหลด ' + res.filename + ' เรียบร้อย', 'success');
      }).catch(function (err) { showToast('❌ ' + err, 'error'); });
    }

    // ─── EXCEL EXPORT (SheetJS) ─────────────────────────────
    function downloadExcel(sheetName) {
      if (typeof XLSX === 'undefined') {
        showToast('❌ ไม่พบไลบรารี XLSX (กรุณาเช็คอินเทอร์เน็ต)', 'error');
        return;
      }
      showToast('⏳ กำลังเตรียมไฟล์ Excel...', 'info');

      // ดึงข้อมูลในรูปแบบอ็อบเจกต์มาทำเป็นแผ่นงาน
      var action = 'get' + sheetName; // เช่น getOrders
      if (sheetName === 'Orders') action = 'getAllOrders';

      API[action]().then(function (res) {
        if (!res.data || res.data.length === 0) { showToast('ไม่มีข้อมูลสำหรับการส่งออก', 'warning'); return; }

        var data = res.data;
        var ws = XLSX.utils.json_to_sheet(data);
        var wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, sheetName);

        // เขียนไฟล์และดาวน์โหลด
        XLSX.writeFile(wb, sheetName + '_' + new Date().getTime() + '.xlsx');
        showToast('✅ ดาวน์โหลด Excel สำเร็จ', 'success');
      }).catch(function (err) { showToast('เกิดข้อผิดพลาด: ' + err, 'error'); });
    }

    // ─── PREMIUM INTEGRATED MODAL SCANNER ───────────────────
    var modalScanner = null;
    var currentScanMode = 'deduct';
    var isScannerBusy = false;

    function setScanMode(mode) {
      currentScanMode = mode;

      // Sync with Quick Scan Tag
      var tag = document.getElementById('qsModeTag');
      if (tag) {
        var label = { 'deduct': 'จ่ายออก', 'receive': 'รับเข้า', 'sub': 'คลังย่อย' }[mode] || mode;
        tag.textContent = label;
      }

      // Update UI Buttons (Lucide Icons)
      document.querySelectorAll('.scanner-mode-btn').forEach(function (btn) {
        var btnMode = btn.id.replace('scanMode', '').toLowerCase();
        btn.classList.toggle('active', btnMode === mode.toLowerCase());
      });

      showToast('สลับโหมดเป็น: ' + mode, 'info');
    }

    function toggleScanModeDropdown(e) {
      if (e) e.stopPropagation();
      var dropdown = document.getElementById('scanModeDropdown');
      if (!dropdown) return;
      var isOpen = dropdown.style.display !== 'none';

      // Close other menus if any
      var moreMenu = document.getElementById('adminMoreMenu');
      if (moreMenu) moreMenu.style.display = 'none';

      dropdown.style.display = isOpen ? 'none' : 'block';
      refreshIcons();
    }

    function updateScanMode(mode, label, e) {
      if (e) e.stopPropagation();
      setScanMode(mode);
      document.getElementById('scanModeDropdown').style.display = 'none';
    }

    function openScanner(mode) {
      if (mode) setScanMode(mode);

      var modal = document.getElementById('scannerModal');
      if (!modal) return;

      modal.classList.add('open');
      document.body.style.overflow = 'hidden';
      refreshIcons();

      if (!modalScanner) {
        modalScanner = new Html5Qrcode("modal-scanner-v2");
      }
    }

    function closeScanner() {
      stopLiveScan();
      document.getElementById('scannerModal').classList.remove('open');
      document.body.style.overflow = 'auto';
    }

    function startLiveScan() {
      const startBtn = document.getElementById('modalStartBtn');
      const placeholder = document.getElementById('scannerPlaceholder');
      const dot = document.querySelector('.scanner-status-dot');
      const statusText = document.getElementById('ssText');
      const viewport = document.getElementById('scannerViewportParent');

      if (!startBtn) return;

      startBtn.disabled = true;
      startBtn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px"></div> กำลังเชื่อมต่อ...';

      const config = {
        fps: 15,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0
      };

      modalScanner.start(
        { facingMode: "environment" },
        config,
        function (decodedText) {
          if (isScannerBusy) return;
          isScannerBusy = true;
          if (window.navigator && window.navigator.vibrate) window.navigator.vibrate(100);

          processScanResult(decodedText);
          closeScanner();
        },
        function (err) { }
      ).then(function () {
        if (placeholder) placeholder.style.display = 'none';
        if (viewport) viewport.classList.add('scanner-active');
        if (dot) dot.classList.add('active');
        if (statusText) {
          statusText.innerHTML = 'กำลังวิเคราะห์ภาพสด...';
          statusText.style.color = 'var(--accent)';
        }
        startBtn.style.display = 'none';
      }).catch(function (err) {
        startBtn.disabled = false;
        startBtn.innerHTML = '<i data-lucide="camera"></i> เริ่มเปิดกล้องวิดีโอสด';
        showToast('ไม่สามารถเปิดใช้งานกล้องได้: ' + err, 'error');
        refreshIcons();
      });
    }

    let isModalTorchOn = false;
    function toggleModalTorch() {
      if (modalScanner && modalScanner.getState() === 2 /* SCANNING */) {
        isModalTorchOn = !isModalTorchOn;
        var btn = document.getElementById('modalTorchBtn');
        modalScanner.applyVideoConstraints({ advanced: [{ torch: isModalTorchOn }] }).then(function () {
          if (isModalTorchOn) {
            btn.style.background = 'var(--primary)';
            btn.style.color = '#000';
          } else {
            btn.style.background = 'transparent';
            btn.style.color = 'var(--text)';
          }
        }).catch(function (err) {
          showToast('อุปกรณ์นี้/เบราว์เซอร์นี้ ไม่รองรับการเปิดไฟแฟลช', 'error');
          isModalTorchOn = false;
        });
      }
    }

    function stopLiveScan() {
      if (modalScanner && modalScanner.isScanning) {
        modalScanner.stop().then(function () {
          resetScannerUI();
        }).catch(function (err) {
          console.warn("Stop error:", err);
          resetScannerUI();
        });
      } else {
        resetScannerUI();
      }
    }

    function resetScannerUI() {
      const placeholder = document.getElementById('scannerPlaceholder');
      const viewport = document.getElementById('scannerViewportWrap');
      const dot = document.querySelector('.scanner-status-dot');
      const statusText = document.getElementById('ssText');
      const startBtn = document.getElementById('modalStartBtn');

      if (placeholder) placeholder.style.display = 'flex';
      if (viewport) viewport.classList.remove('scanner-active');
      if (dot) dot.classList.remove('active');
      if (statusText) {
        statusText.innerHTML = 'โหมดประหยัดพลังงาน - กดปุ่มด้านล่างเพื่อเริ่ม';
        statusText.style.color = 'var(--text3)';
      }
      if (startBtn) {
        startBtn.style.display = 'flex';
        startBtn.disabled = false;
        startBtn.innerHTML = '<i data-lucide="camera"></i> เริ่มเปิดกล้องวิดีโอสด';
        refreshIcons();
      }
      isScannerBusy = false;
    }

    function handleModalFile(input) {
      if (!input.files || input.files.length === 0) return;
      showToast('กำลังอ่านรูปภาพ...', 'info');

      if (!modalScanner) modalScanner = new Html5Qrcode("modal-scanner-v2");

      modalScanner.scanFile(input.files[0], true)
        .then(function (decodedText) {
          processScanResult(decodedText);
          closeScanner();
        })
        .catch(function (err) {
          showToast('ไม่พบรหัสในรูปภาพนี้', 'error');
        });
      input.value = '';
    }

    function openScanActionModal(prod, title, desc) {
      document.getElementById('scanActionTitle').textContent = title;
      document.getElementById('sa-name').textContent = prod.name;
      document.getElementById('sa-id').textContent = 'SKU: ' + (prod.productId || prod.id);
      document.getElementById('sa-qty-input').value = '1';

      var imgEl = document.getElementById('sa-img');
      var imgCont = document.getElementById('sa-img-container');
      if (imgEl && imgCont) {
        var url = prod.imageUrl || prod.image || '';
        if (url) {
          imgEl.src = getImageUrl(url);
          imgCont.style.display = 'block';
        } else {
          imgCont.style.display = 'none';
        }
      }

      var btn = document.getElementById('sa-confirm-btn');
      btn.onclick = function () {
        var qty = parseInt(document.getElementById('sa-qty-input').value);
        if (qty > 0) {
          performScanAction(prod.productId || prod.id, qty);
        }
      };

      document.getElementById('scanActionModal').classList.add('open');
      refreshIcons();
    }

    function performScanAction(id, qty) {
      var mode = currentScanMode; // 'deduct' | 'receive' | 'sub'
      showToast('กำลังดำเนินการ...', 'info');

      var promise;
      if (mode === 'deduct') {
        promise = API.updateStock(id, -qty, currentUser.employeeId);
      } else if (mode === 'receive') {
        promise = API.updateStock(id, qty, currentUser.employeeId);
      } else if (mode === 'sub') {
        if (_subStockTarget) {
          // สแกนใช้งานจากคลังย่อย (ตัดออก)
          promise = API.addToSubStock({
            productId: id,
            qty: -qty,
            employeeId: _subStockType === 'personal' ? _subStockTarget : null,
            teamId: _subStockType === 'team' ? _subStockTarget : null
          });
        } else {
          // รับเข้าคลังย่อย (กรณีปกติ)
          promise = API.addToSubStock({ productId: id, qty: qty });
        }
      }

      if (promise) {
        promise.then(function (res) {
          if (res.success) {
            showToast('✅ ดำเนินการสำเร็จ: ' + (res.message || ''), 'success');
            closeModal('scanActionModal');
            loadInventory();
            loadDashboard();
          } else {
            showToast('❌ ' + res.message, 'error');
          }
        }).catch(function (err) {
          showToast('❌ ข้อผิดพลาด: ' + err, 'error');
        }).finally(function () {
          isScannerBusy = false;
        });
      }
    }

    function processScanResult(text) {
      if (!text) { isScannerBusy = false; return; }

      var config = {
        'deduct': { title: 'ตัดจ่ายพัสดุ', desc: 'ระบุจำนวนที่ต้องการตัดออกจากสต็อกหลัก' },
        'receive': { title: 'รับพัสดุเข้าคลัง', desc: 'ระบุจำนวนพัสดุที่รับเข้าคลังหลัก' },
        'sub': {
          title: _subStockTarget ? 'บันทึกการใช้งานพัสดุ' : 'รับเข้าคลังย่อย',
          desc: _subStockTarget ? 'ระบุจำนวนที่นำไปใช้งานจริง' : 'ระบุจำนวนที่รับเข้าคลังย่อยของคุณ'
        }
      }[currentScanMode];

      API.getStorefrontData().then(function (res) {
        var products = res.products || [];
        var scannedCode = String(text || '').trim();
        var prod = products.find(function (p) {
          return String(p.productId || p.id).toLowerCase() === scannedCode.toLowerCase();
        });

        if (!prod) {
          showToast('ไม่พบรหัสสินค้า: ' + scannedCode, 'error');
          isScannerBusy = false;
          return;
        }

        // Use the existing action modal to confirm quantity
        openScanActionModal(prod, config.title, config.desc);

      }).catch(function (err) {
        showToast('เกิดข้อผิดพลาดในการโหลดข้อมูล', 'error');
        isScannerBusy = false;
      });
    }

    function promptManualInput() {
      var id = prompt('กรุณาระบุรหัสสินค้า:');
      if (id && id.trim()) {
        processScanResult(id.trim());
      }
    }





    // ─── SYSTEM SETTINGS LOGIC ───
    function loadSystemSettings() {
      var container = document.getElementById('notifyTimesContainer');
      container.innerHTML = '<div style="padding: 1rem; text-align: center;"><div class="spinner"></div></div>';

      API._call('getSystemSettings', {}).then(function (res) {
        container.innerHTML = ''; // clear
        var times = res.notifyTimes || [8, 12, 15, 18];
        if (times.length === 0) times = [8]; // fallback

        times.forEach(function (t) { addTimeSlot(t); });
      }).catch(function (err) {
        container.innerHTML = '<div class="text-center text-danger">เกิดข้อผิดพลาดในการโหลดตั้งค่า</div>';
      });
    }

    function addTimeSlot(value) {
      var val = value !== undefined ? value : 12;
      var wrapper = document.createElement('div');
      wrapper.className = 'flex gap-2 items-center time-slot';

      var select = document.createElement('select');
      select.className = 'input flex-1 notify-time-input';

      for (var i = 0; i <= 23; i++) {
        var option = document.createElement('option');
        option.value = i;
        var displayHour = i.toString().padStart(2, '0') + ':00';
        option.textContent = displayHour;
        if (i == val) option.selected = true;
        select.appendChild(option);
      }

      var removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn btn-outline btn-sm';
      removeBtn.style.color = 'var(--danger)';
      removeBtn.innerHTML = '<i data-lucide="trash-2"></i>';
      removeBtn.onclick = function () { wrapper.remove(); };

      wrapper.appendChild(select);
      wrapper.appendChild(removeBtn);
      document.getElementById('notifyTimesContainer').appendChild(wrapper);
      refreshIcons();
    }

    function saveSystemSettings() {
      var inputs = document.querySelectorAll('.notify-time-input');
      var times = [];
      inputs.forEach(function (input) {
        times.push(parseInt(input.value, 10));
      });

      // Remove duplicates and sort
      times = times.filter(function (item, pos) { return times.indexOf(item) == pos; }).sort(function (a, b) { return a - b });

      var btn = document.getElementById('saveSetBtn');
      btn.innerHTML = '<div class="spinner" style="width:16px;height:16px"></div> กำลังบันทึก...';
      btn.disabled = true;

      API._call('saveSystemSettings', { settings: { notifyTimes: times } }).then(function (res) {
        btn.innerHTML = '<i data-lucide="save"></i> บันทึกการตั้งค่า';
        btn.disabled = false;
        refreshIcons();
        if (res.success) {
          var timeLabels = times.map(function (t) { return String(t).padStart(2, '0') + ':00'; }).join(', ');
          showToast('บันทึกเวลาแจ้งเตือนเรียบร้อยแล้ว: ' + timeLabels, 'success');
          loadSystemSettings();
        } else {
          showToast(res.message || 'บันทึกไม่สำเร็จ', 'error');
        }
      }).catch(function (err) {
        btn.innerHTML = '<i data-lucide="save"></i> บันทึกการตั้งค่า';
        btn.disabled = false;
        showToast('เกิดข้อผิดพลาด: ' + err, 'error');
      });
    }

    // --- Back to Top Button ---
    var backBtn = document.createElement('button');
    backBtn.id = 'backToTopBtn';
    backBtn.className = 'btn btn-primary';
    backBtn.innerHTML = '<i data-lucide="arrow-up"></i>';
    backBtn.style.cssText = 'position:fixed; bottom:2rem; right:2rem; border-radius:50%; width:50px; height:50px; display:none; align-items:center; justify-content:center; box-shadow:var(--shadow-lg); z-index:1200; padding:0;';
    backBtn.onclick = function () { window.scrollTo({ top: 0, behavior: 'smooth' }); };
    document.body.appendChild(backBtn);

    window.addEventListener('scroll', function () {
      if (window.scrollY > 400) backBtn.style.display = 'flex';
      else backBtn.style.display = 'none';
    });



    function loadOrdersBasedOnFilter() {
      var filter = document.getElementById('adminOrderFilter').value;
      if (filter === 'all') {
        allAdminOrders = masterAdminOrders; // Use a master list to filter from
      } else {
        allAdminOrders = masterAdminOrders.filter(function (o) { return o.status === filter; });
      }
      renderAdminOrders(1);
    }



    // --- BRANCH MANAGEMENT LOGIC ---
    function loadBranches() {
      var body = document.getElementById('branchesBody');
      body.innerHTML = '<tr><td colspan="4" class="text-center" style="padding:2rem"><div class="spinner"></div></td></tr>';

      API.getBranches().then(function (res) {
        allBranches = res.data || [];
        if (allBranches.length === 0) {
          body.innerHTML = '<tr><td colspan="4" class="text-center" style="padding:2rem; color:var(--text3)">ไม่พบข้อมูลสาขา</td></tr>';
          return;
        }
        body.innerHTML = allBranches.map(function (b) {
          return '<tr>' +
            '<td>' + escapeHTML(b.branchId) + '</td>' +
            '<td style="font-weight:500">' + escapeHTML(b.name) + '</td>' +
            '<td><span class="badge ' + (b.status === 'active' ? 'badge-approved' : 'badge-rejected') + '">' + (b.status === 'active' ? 'ปกติ' : 'ปิด') + '</span></td>' +
            '<td class="flex flex-wrap gap-1">' +
            '<button class="btn btn-xs btn-outline" onclick="editBranch(\'' + escapeHTML(b.branchId) + '\')"><i data-lucide="edit-2" style="pointer-events:none"></i></button>' +
            '<button class="btn btn-xs btn-ghost" style="color:var(--danger)" onclick="delBranch(\'' + escapeHTML(b.branchId) + '\')"><i data-lucide="trash" style="pointer-events:none"></i></button>' +
            '</td>' +
            '</tr>';
        }).join('');
        refreshIcons();
      }).catch(function (err) {
        body.innerHTML = '<tr><td colspan="4" class="text-center" style="padding:2rem; color:var(--danger)">เกิดข้อผิดพลาด: ' + err + '</td></tr>';
      });
    }

    function openBranchModal(b) {
      document.getElementById('bf-old-id').value = b ? b.branchId : '';
      document.getElementById('bf-id').value = b ? b.branchId : '';
      document.getElementById('bf-name').value = b ? b.name : '';
      document.getElementById('bf-status').value = b ? b.status : 'active';
      document.getElementById('branchModalTitle').textContent = b ? 'แก้ไขข้อมูลสาขา' : 'เพิ่มสาขาใหม่';
      document.getElementById('branchModal').classList.add('open');
    }
    function closeBranchModal() { document.getElementById('branchModal').classList.remove('open'); }
    function editBranch(id) {
      var b = allBranches.find(function (x) { return String(x.branchId) === String(id); });
      if (b) openBranchModal(b);
    }

    function saveBranch() {
      var oldId = document.getElementById('bf-old-id').value.trim();
      var data = {
        branchId: document.getElementById('bf-id').value.trim(),
        name: document.getElementById('bf-name').value.trim(),
        status: document.getElementById('bf-status').value
      };
      if (!data.name) { showToast('กรุณาระบุชื่อสาขา', 'warning'); return; }

      var op = oldId ? 'update' : 'add';
      showToast('กำลังบันทึก...', 'info');
      API.manageBranch(op, data, oldId).then(function (res) {
        if (res.success) {
          showToast(res.message || 'บันทึกเรียบร้อย', 'success');
          closeBranchModal();
          loadBranches();
        } else {
          showToast(res.message || 'เกิดข้อผิดพลาด', 'error');
        }
      }).catch(function (err) {
        showToast('ผิดพลาด: ' + err, 'error');
      });
    }

    function delBranch(id) {
      if (!confirm('ยืนยันการลบสาขา ' + id + ' ?')) return;
      API.manageBranch('delete', { branchId: id }).then(function (res) {
        showToast('ลบสาขาเรียบร้อย', 'success');
        loadBranches();
      });
    }

    // --- BARCODE LOGIC ---
    function generateBarcode(id, name) {
      document.getElementById('barcodeLabel').textContent = name;
      document.getElementById('barcodeModal').classList.add('open');

      setTimeout(function () {
        try {
          bwipjs.toCanvas('barcodeCanvas', {
            bcid: 'code128',
            text: id,
            scale: 3,
            height: 10,
            includetext: true,
            textxalign: 'center',
            textcolor: '000000',
            barcolor: '000000'
          });
        } catch (e) {
          console.error(e);
          showToast('ไม่สามารถสร้างบาร์โค้ดได้', 'error');
        }
      }, 100);
      refreshIcons();
    }
    function closeBarcodeModal() { document.getElementById('barcodeModal').classList.remove('open'); }
    function printBarcode() {
      var canvas = document.getElementById('barcodeCanvas');
      var labelText = document.getElementById('barcodeLabel').textContent;
      var dataUrl = canvas.toDataURL();

      var win = window.open('', '_blank');
      win.document.write('<html><head><title>Print Barcode<\/title><style>body{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2rem;font-family:sans-serif}img{width:300px;margin-top:1rem}<\/style><\/head><body><\/body><\/html>');
      win.document.close();

      var doc = win.document;
      var h2 = doc.createElement('h2');
      h2.textContent = labelText;
      doc.body.appendChild(h2);

      var img = doc.createElement('img');
      img.src = dataUrl;
      doc.body.appendChild(img);

      var script = doc.createElement('script');
      script.textContent = 'window.onload = function() { window.print(); window.close(); };';
      doc.body.appendChild(script);
    }

    // --- SEARCHABLE SELECT UTILITY ---
    function initSearchableSelect(selectId, forceReadOnly) {
      var select = document.getElementById(selectId);
      if (!select) return;

      var prev = select.previousElementSibling;
      if (prev && prev.classList.contains('search-select-wrapper')) {
        prev.remove();
      }

      var wrapper = document.createElement('div');
      wrapper.className = 'search-select-wrapper';
      select.style.display = 'none';
      select.parentElement.insertBefore(wrapper, select);

      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'form-input search-select-input';
      input.placeholder = select.options[0] ? select.options[0].text : 'พิมพ์เพื่อค้นหา...';
      input.autocomplete = 'off';

      var isReadOnly = select.hasAttribute('readonly') || select.readOnly || forceReadOnly;
      var isDisabled = select.disabled;

      if (isReadOnly || isDisabled) {
        input.readOnly = true;
        input.style.cursor = isDisabled ? 'not-allowed' : 'default';
        if (isDisabled) input.style.opacity = '0.6';
      }

      if (select.selectedIndex > 0) {
        input.value = select.options[select.selectedIndex].text;
      }

      var dropdown = document.createElement('div');
      dropdown.className = 'search-select-dropdown';

      wrapper.appendChild(input);
      wrapper.appendChild(dropdown);

      function updateDropdown(filter) {
        var options = Array.from(select.options);
        var filtered = options.filter(function (o, i) {
          if (i === 0 && o.value === "") return false;
          if (!filter) return true;
          return o.text.toLowerCase().indexOf(filter.toLowerCase()) !== -1;
        });

        if (filtered.length === 0) {
          dropdown.innerHTML = '<div class="search-select-empty">ไม่พบตัวเลือก</div>';
        } else {
          dropdown.innerHTML = filtered.map(function (o) {
            return '<div class="search-select-item ' + (o.value === select.value ? 'selected' : '') + '" data-value="' + o.value + '">' + o.text + '</div>';
          }).join('');
        }

        dropdown.querySelectorAll('.search-select-item').forEach(function (item) {
          item.onclick = function () {
            select.value = this.dataset.value;
            input.value = this.textContent;
            dropdown.classList.remove('active');

            if (selectId === 'swap-t1' || selectId === 'swap-t2') updateSwapPreview();

            var event = document.createEvent('HTMLEvents');
            event.initEvent('change', true, false);
            select.dispatchEvent(event);
          };
        });
      }

      input.onfocus = function () {
        if (isDisabled) return;
        if (!isReadOnly) this.value = '';
        updateDropdown('');
        dropdown.classList.add('active');
      };

      input.oninput = function () {
        updateDropdown(this.value);
        dropdown.classList.add('active');
      };

      var outsideClick = function (e) {
        if (!wrapper.contains(e.target)) {
          dropdown.classList.remove('active');
          if (!input.value && select.selectedIndex >= 0) {
            input.value = select.options[select.selectedIndex].text;
          }
          document.removeEventListener('click', outsideClick);
        }
      };

      input.onclick = function (e) {
        if (isDisabled) return;
        dropdown.classList.add('active');
        e.stopPropagation();
        document.addEventListener('click', outsideClick);
      };
    }

    function openPasswordModal() {
      document.getElementById('oldPwd').value = '';
      document.getElementById('newPwd').value = '';
      document.getElementById('confirmNewPwd').value = '';
      document.getElementById('passwordModal').classList.add('open');
    }
    function closePasswordModal() {
      document.getElementById('passwordModal').classList.remove('open');
    }
    function saveNewPassword() {
      var oldP = document.getElementById('oldPwd').value;
      var newP = document.getElementById('newPwd').value;
      var confP = document.getElementById('confirmNewPwd').value;

      if (!oldP || !newP) {
        showToast('กรุณากรอกข้อมูลให้ครบถ้วน', 'error');
        return;
      }
      if (newP !== confP) {
        showToast('รหัสผ่านใหม่ไม่ตรงกัน', 'error');
        return;
      }
      if (newP.length < 4) {
        showToast('รหัสผ่านต้องมีความยาวอย่างน้อย 4 ตัวอักษร', 'error');
        return;
      }

      var btn = document.getElementById('savePwdBtn');
      var oldHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<div class="spinner"></div> กำลังบันทึก...';

      API.changePassword(oldP, newP).then(function (res) {
        if (res.success) {
          showToast('เปลี่ยนรหัสผ่านเรียบร้อยแล้ว', 'success');
          closePasswordModal();
        } else {
          showToast(res.message, 'error');
        }
      }).catch(function (err) {
        showToast(err, 'error');
      }).finally(function () {
        btn.disabled = false;
        btn.innerHTML = oldHtml;
      });
    }

    // --- DRAG SCROLL UTILITY ---
    function initDragScroll(selector) {
      const el = document.querySelector(selector);
      if (!el) return;
      let isDown = false;
      let startX;
      let scrollLeft;
      let moved = false;

      el.addEventListener('mousedown', (e) => {
        isDown = true;
        moved = false;
        startX = e.pageX - el.offsetLeft;
        scrollLeft = el.scrollLeft;
      });
      el.addEventListener('mouseleave', () => {
        isDown = false;
        el.classList.remove('drag-scroll-active');
      });
      el.addEventListener('mouseup', () => {
        isDown = false;
        el.classList.remove('drag-scroll-active');
      });
      el.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        const x = e.pageX - el.offsetLeft;
        if (Math.abs(x - startX) > 5) {
          moved = true;
          el.classList.add('drag-scroll-active');
        }
        e.preventDefault();
        const walk = (x - startX) * 2;
        el.scrollLeft = scrollLeft - walk;
      });
      el.addEventListener('click', (e) => {
        if (moved) {
          e.preventDefault();
          e.stopPropagation();
        }
      }, true);
    }

    function downloadCSV(type) {
      showToast('กำลังเตรียมไฟล์ CSV...', 'info');
      var promise;
      var fileName = type + '_' + new Date().getTime() + '.csv';

      if (type === 'InventoryLogs') {
        promise = API.getInventoryLogs({ limit: 500 }).then(function (res) {
          return res.data || [];
        });
      } else if (type === 'AuditLogs') {
        promise = API.getReportData('auditActivities').then(function (res) {
          return (res.data && res.data.logs) ? res.data.logs : [];
        });
      } else {
        // Fallback to generic backend export
        _downloadCSVGeneric(type);
        return;
      }

      promise.then(function (data) {
        if (data.length === 0) {
          showToast('ไม่มีข้อมูลสำหรับการส่งออก', 'warning');
          return;
        }

        // Simple CSV generation
        var headers = Object.keys(data[0]);
        var csvContent = "\uFEFF"; // BOM for Excel Thai support
        csvContent += headers.join(",") + "\n";

        data.forEach(function (row) {
          var rowData = headers.map(function (header) {
            var val = row[header] === null || row[header] === undefined ? "" : String(row[header]);
            // Escape quotes and wrap in quotes
            return '"' + val.replace(/"/g, '""') + '"';
          });
          csvContent += rowData.join(",") + "\n";
        });

        var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        var link = document.createElement("a");
        var url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", fileName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('✅ ดาวน์โหลด CSV เรียบร้อย', 'success');
      }).catch(function (err) {
        showToast('เกิดข้อผิดพลาด: ' + err, 'error');
      });
    }

    function runDBMaintenance() {
      var btn = document.getElementById('btnUpdateDB');
      if (!btn) return;

      if (!confirm('ยืนยันการตรวจสอบและอัปเดตโครงสร้างฐานข้อมูล (Google Sheets)?')) return;

      var oldHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<div class="spinner"></div> กำลังดำเนินการ...';

      API.setupSpreadsheet().then(function (res) {
        if (res.success) {
          showToast(res.message || 'อัปเดตโครงสร้างฐานข้อมูลเรียบร้อย', 'success');
        } else {
          showToast(res.message || 'เกิดข้อผิดพลาดในการอัปเดต', 'error');
        }
      }).catch(function (err) {
        showToast('เซิร์ฟเวอร์ขัดข้อง: ' + err, 'error');
      }).finally(function () {
        btn.disabled = false;
        btn.innerHTML = oldHtml;
      });
    }


  
