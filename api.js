// ============================================================
//  api.js — Frontend REST Adapter (Refactored & Optimized)
// ============================================================

const GAS_URL = "https://script.google.com/macros/s/AKfycbzzqz0K_FzdL2flMcKoY4frRnM2f7Ya8n9ATvAI4geuAYBG2GGuVmC2nYPEJQsyQHJfRA/exec";

var API = (function () {
  var CACHE_KEY = '_api_cache_v1';
  var _locks = new Set();
  var _cacheTTL = 300000; // 5 minutes for persistent cache

  // 0. Initialize Cache from LocalStorage
  var _cache = {};
  try {
    var storedCache = localStorage.getItem(CACHE_KEY);
    if (storedCache) _cache = JSON.parse(storedCache);

    // Cleanup expired items on start
    var now = Date.now();
    for (var k in _cache) {
      if (now - _cache[k].time > _cacheTTL) delete _cache[k];
    }
  } catch (e) { _cache = {}; }

  var apiObj = {
    isPending: false,

    _saveCache: function () {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(_cache));
      } catch (e) {
        console.warn('⚠️ LocalStorage Error:', e);
        if (e.name === 'QuotaExceededError') {
          // If storage is full, clear 50% oldest cache items
          var keys = Object.keys(_cache).sort(function (a, b) {
            return (_cache[a].time || 0) - (_cache[b].time || 0);
          });
          keys.slice(0, Math.ceil(keys.length / 2)).forEach(function (k) { delete _cache[k]; });
          try { localStorage.setItem(CACHE_KEY, JSON.stringify(_cache)); } catch (e2) { }
        }
      }
    },

    getCached: function (action) {
      if (_cache[action] && (Date.now() - _cache[action].time < _cacheTTL)) {
        return _cache[action].data;
      }
      return null;
    },

    _call: function (action, data, useCache, invalidateGroups) {
      var self = this;
      var maxRetries = 2; // Maximum 2 retries (3 total attempts)
      useCache = !!useCache;
      invalidateGroups = invalidateGroups || [];

      // 1. Double-Submission Protection (Locking)
      var lockKey = action + JSON.stringify(data || {});
      if (_locks.has(lockKey) && !useCache) {
        console.warn('⚠️ Request block: Concurrent identical action [' + action + ']');
        return Promise.reject('กรุณารอสักครู่ กำลังประมวลผลคำสั่งเดิมของคุณ...');
      }
      if (!useCache) _locks.add(lockKey);

      // 2. Check Cache (Memory/Local)
      var cachedData = self.getCached(action);
      if (useCache && cachedData) {
        console.log('⚡ API Cache Hit [' + action + ']');
        return Promise.resolve(cachedData);
      }

      var user = null;
      try {
        var stored = localStorage.getItem('_user');
        if (stored) user = JSON.parse(stored);
      } catch (e) { }

      var payload = {
        action: action,
        data: data || {},
        user: user
      };

      self.isPending = true;

      return new Promise(function (resolve, reject) {
        function executeAttempt(attempt) {
          // Dynamic Timeout - Dashboard/Reports get more time
          var timeoutMs = 30000; // Default 30s
          if (action.indexOf('Report') !== -1 || action.indexOf('Dashboard') !== -1 || action.indexOf('Trends') !== -1) {
            timeoutMs = 45000; // 45s for heavy data
          }

          var controller = new AbortController();
          var timeoutId = setTimeout(function () {
            controller.abort();
          }, timeoutMs);

          fetch(GAS_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(payload),
            signal: controller.signal
          })
            .then(function (response) {
              clearTimeout(timeoutId);
              if (!useCache) _locks.delete(lockKey);
              return response.json();
            })
            .then(function (res) {
              self.isPending = false;
              if (res && res.success) {
                // Save to Cache if needed
                if (useCache) {
                  _cache[action] = { data: res, time: Date.now() };
                  self._saveCache();
                }
                // Invalidate Groups
                if (invalidateGroups && invalidateGroups.length > 0) {
                  invalidateGroups.forEach(function (g) { self.invalidateCache(g); });
                }
                resolve(res);
              } else {
                var msg = res ? (res.message || res.error || 'เซิร์ฟเวอร์แจ้งข้อผิดพลาด') : 'ไม่ได้รับข้อมูลที่ถูกต้อง';
                reject(msg);
              }
            })
            .catch(function (err) {
              if (!useCache) _locks.delete(lockKey);
              clearTimeout(timeoutId);

              // Retry for selective transient errors (timeouts or network failures)
              var isTransient = err.name === 'AbortError' || (err.message && err.message.indexOf('NetworkError') !== -1) || (err.message && err.message.indexOf('Failed to fetch') !== -1);

              if (isTransient && attempt < maxRetries) {
                console.warn('[API Retry] Attempt ' + (attempt + 1) + ' for action: ' + action);
                var backoff = (attempt + 1) * 1000;
                setTimeout(function () { executeAttempt(attempt + 1); }, backoff);
              } else {
                self.isPending = false;
                var friendlyMsg = "การเชื่อมต่อขัดข้อง กรุณาลองใหม่อีกครั้ง";
                if (err.name === 'AbortError') {
                  friendlyMsg = "เซิร์ฟเวอร์ประมวลผลนานเกินไป (Timeout) หรืออินเทอร์เน็ตไม่เสถียร";
                } else if (err.message && err.message.indexOf('NetworkError') !== -1) {
                  friendlyMsg = "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ (Network Error)";
                } else if (typeof err === 'string') {
                  friendlyMsg = err;
                }
                console.error('API Error [' + action + ']:', err);
                reject(friendlyMsg);
              }
            });
        }

        executeAttempt(0);
      });
    },

    invalidateCache: function (actionOrGroups) {
      if (!actionOrGroups) {
        _cache = {};
      } else if (Array.isArray(actionOrGroups)) {
        var self = this;
        actionOrGroups.forEach(function (g) {
          delete _cache[g];
          // Match dynamic keys starting with group name
          for (var k in _cache) { if (k.indexOf(g) === 0) delete _cache[k]; }
        });
      } else {
        delete _cache[actionOrGroups];
        for (var k in _cache) { if (k.indexOf(actionOrGroups) === 0) delete _cache[k]; }
      }
      this._saveCache();
    },

    // ─── READ ACTIONS (Cached for performance) ────────────────
    getProducts: function (filter) { return this._call('getProducts', { filter: filter }, true); },
    getCategories: function () { return this._call('getCategories', {}, true); },
    getEmployees: function () { return this._call('getEmployees', {}, true); },
    getTeams: function () { return this._call('getTeams', {}, true); },
    getBranches: function () { return this._call('getBranches', {}, true); },
    getStorefrontData: function () { return this._call('getStorefrontData', {}, true); },
    getMyRequests: function () { return this._call('getMyRequests', {}, true); },
    getAllOrders: function () { return this._call('getAllOrders', {}, true); },
    getFilteredOrders: function (filters) { return this._call('getFilteredOrders', { filters: filters }, true); },
    getOrderItems: function (orderId) { return this._call('getOrderItems', { orderId: orderId }, true); },
    getPendingApprovals: function () { return this._call('getPendingApprovals', {}, true); },
    getDashboardStats: function () { return this._call('getDashboardStats', {}, true); },
    getAdvancedDashboardData: function (filters) { return this._call('getAdvancedDashboardData', { filters: filters }, true); },
    getReportData: function (type) { return this._call('getReportData', { type: type }, true); },
    getMonthlyTrends: function () { return this._call('getMonthlyTrends', {}, true); },
    getTopRequestedItems: function (month) { return this._call('getTopRequestedItems', { month: month }, true); },
    getDepartmentSpending: function (month) { return this._call('getDepartmentSpending', { month: month }, true); },
    getInventoryForecast: function () { return this._call('getInventoryForecast', {}, true); },
    getSubStock: function (id) { return this._call('getSubStock', { employeeId: id }, true); },
    getSystemSettings: function () { return this._call('getSystemSettings', {}, true); },

    // ─── WRITE ACTIONS (Invalidate relevant caches) ───────────
    manageProduct: function (op, data) { 
      return this._call('manageProduct', { op: op, data: data }, false, ['getProducts', 'getStorefrontData', 'getAdvancedDashboardData', 'getInventoryForecast']); 
    },
    manageCategory: function (op, data) { 
      return this._call('manageCategory', { op: op, data: data }, false, ['getCategories', 'getProducts', 'getStorefrontData']); 
    },
    updateStock: function (productId, qty, adminId) {
      return this._call('updateStock', { productId: productId, qty: qty, adminId: adminId }, false, ['getProducts', 'getDashboardStats', 'getAdvancedDashboardData', 'getInventoryForecast']);
    },
    receiveStock: function (productId, qty) { 
      return this._call('receiveStock', { productId: productId, qty: qty }, false, ['getProducts', 'getAdvancedDashboardData', 'getInventoryForecast']); 
    },
    quickDeductStock: function (productId, qty) { 
      return this._call('quickDeductStock', { productId: productId, qty: qty }, false, ['getProducts', 'getAdvancedDashboardData', 'getInventoryForecast']); 
    },
    
    createRequest: function (items) { 
      return this._call('createRequest', { items: items }, false, ['getMyRequests', 'getAllOrders', 'getDashboardStats', 'getAdvancedDashboardData']); 
    },
    approveRequest: function (requestId, comment) { 
      return this._call('approveRequest', { requestId: requestId, comment: comment }, false, ['getPendingApprovals', 'getAllOrders', 'getAdvancedDashboardData', 'getDashboardStats']); 
    },
    rejectRequest: function (requestId, comment) { 
      return this._call('rejectRequest', { requestId: requestId, comment: comment }, false, ['getPendingApprovals', 'getAllOrders', 'getAdvancedDashboardData', 'getDashboardStats']); 
    },
    setReady: function (requestId) { 
      return this._call('setReady', { requestId: requestId }, false, ['getAllOrders', 'getAdvancedDashboardData']); 
    },
    dispatchRequest: function (requestId) { 
      return this._call('dispatchRequest', { requestId: requestId }, false, ['getAllOrders', 'getAdvancedDashboardData', 'getProducts', 'getInventoryForecast', 'getSubStock']); 
    },
    signForReceipt: function (requestId, signature) { 
      return this._call('signForReceipt', { requestId: requestId, signature: signature }, false, ['getAllOrders', 'getAdvancedDashboardData', 'getMyRequests', 'getProducts', 'getSubStock']); 
    },

    manageEmployee: function (op, data, oldEmployeeId) {
      return this._call('manageEmployee', { op: op, data: data, oldEmployeeId: oldEmployeeId }, false, ['getEmployees']);
    },
    addEmployee: function (employee) {
      return this._call('addEmployee', { employee: employee }, false, ['getEmployees']);
    },
    updateEmployeeRole: function (targetEmployeeId, newRole, teamId) {
      return this._call('updateEmployeeRole', { targetEmployeeId: targetEmployeeId, newRole: newRole, teamId: teamId }, false, ['getEmployees']);
    },
    deleteEmployee: function (targetEmployeeId) {
      return this._call('deleteEmployee', { targetEmployeeId: targetEmployeeId }, false, ['getEmployees']);
    },
    
    manageTeam: function (op, data) { 
      return this._call('manageTeam', { op: op, data: data }, false, ['getTeams', 'getEmployees']); 
    },
    swapTeamLead: function (data) {
      return this._call('swapTeamLead', data, false, ['getTeams', 'getEmployees']);
    },
    manageBranch: function (op, data) {
      return this._call('manageBranch', { op: op, data: data }, false, ['getBranches']);
    },

    saveSystemSettings: function (settings) {
      return this._call('saveSystemSettings', { settings: settings }, false, ['getSystemSettings']);
    },

    // ─── AUTH & USER ──────────────────────────────────────────
    checkEmployee: function (employeeId) { return this._call('checkEmployee', { employeeId: employeeId }, true); },
    login: function (employeeId, password) { return this._call('login', { employeeId: employeeId, password: password }, false); },
    changePassword: function (oldPassword, newPassword) { return this._call('changePassword', { oldPassword: oldPassword, newPassword: newPassword }, false); },

    // ─── OTHERS ───────────────────────────────────────────────
    uploadToDrive: function (base64, fileName) { return this._call('uploadToDrive', { base64: base64, fileName: fileName }); },
    exportToCSV: function (sheetName) { return this._call('exportToCSV', { sheetName: sheetName }); },
    
    // Compatibility wrappers
    approveOrder: function (id, _, comment) { return this.approveRequest(id, comment); },
    rejectOrder: function (id, _, comment) { return this.rejectRequest(id, comment); },
    updateStock: function (id, qty) { return this.receiveStock(id, qty); }
  };

  return apiObj;
})();
