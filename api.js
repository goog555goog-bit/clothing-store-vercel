// ============================================================
//  api.js — Frontend REST Adapter (Refactored & Optimized)
// ============================================================

const GAS_URL = "https://script.google.com/macros/s/AKfycbxnRTEb5Q09UkPPiKgx2nzee7ZTogtomaeUzQoj8FJ_0AlfOvJxNt0lPQwhYHLz-OEweg/exec";

var API = (function () {
  var _cache = {};
  var _cacheTTL = 60000; // 60 seconds

  var apiObj = {
    isPending: false,
    
    _call: function (action, data, useCache = false) {
      var self = this;
      
      // 1. Check Cache
      if (useCache && _cache[action] && (Date.now() - _cache[action].time < _cacheTTL)) {
        console.log('⚡ API Cache Hit [' + action + ']');
        return Promise.resolve(_cache[action].data);
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
        // Implementation of timeout
        var controller = new AbortController();
        var timeoutId = setTimeout(function() {
          controller.abort();
          self.isPending = false;
          reject('Request timeout (server not responding)');
        }, 10000); // 10 second timeout

        fetch(GAS_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(payload),
          signal: controller.signal
        })
        .then(function (res) {
          clearTimeout(timeoutId);
          if (!res.ok) throw new Error("Network Error: " + res.status);
          return res.json();
        })
        .then(function (res) {
          self.isPending = false;
          if (res && res.success) {
            // 2. Save to Cache if needed
            if (useCache) {
              _cache[action] = { data: res, time: Date.now() };
            }
            resolve(res);
          } else {
            reject(res ? res.message : 'Unknown error');
          }
        })
        .catch(function (err) {
          clearTimeout(timeoutId);
          self.isPending = false;
          console.error('API Error [' + action + ']:', err);
          reject(err.name === 'AbortError' ? 'Server is too slow, please try again.' : (err.message || 'Connection failed.'));
        });
      });
    },

    invalidateCache: function(action) {
      if (action) delete _cache[action];
      else _cache = {};
    },

    // ─── AUTH & CORE ──────────────────────────────────────────
    login: function (employeeId) { return this._call('login', { employeeId: employeeId }); },
    
    // ─── READ (Cached) ────────────────────────────────────────
    getProducts: function (filter) { return this._call('getProducts', { filter: filter }, true); },
    getCategories: function () { return this._call('getCategories', {}, true); },
    getStorefrontData: function () { return this._call('getStorefrontData', {}, true); },
    getEmployees: function () { return this._call('getEmployees', {}, true); },
    getReportData: function (type) { return this._call('getReportData', { type: type }, true); },
    getMonthlyTrends: function () { return this._call('getMonthlyTrends', {}, true); },
    getTopRequestedItems: function (month) { return this._call('getTopRequestedItems', { month: month }, true); },
    getDepartmentSpending: function (month) { return this._call('getDepartmentSpending', { month: month }, true); },
    getDashboardStats: function () { return this._call('getDashboardStats', {}, true); },

    // ─── WRITE / ACTION ───────────────────────────────────────
    createRequest: function (items) { 
      this.invalidateCache('getStorefrontData');
      return this._call('createRequest', { items: items }); 
    },
    
    // Unified Approval/Rejection
    approveRequest: function (requestId, comment) { 
      this.invalidateCache('getReportData');
      return this._call('approveRequest', { requestId: requestId, comment: comment }); 
    },
    rejectRequest: function (requestId, comment) { 
      this.invalidateCache('getReportData');
      return this._call('rejectRequest', { requestId: requestId, comment: comment }); 
    },
    
    // Re-mapped for compatibility with older code if any
    approveOrder: function(id, _, comment) { return this.approveRequest(id, comment); },
    rejectOrder: function(id, _, comment) { return this.rejectRequest(id, comment); },

    signForReceipt: function (requestId, signature) { return this._call('signForReceipt', { requestId: requestId, signature: signature }); },
    dispatchRequest: function (requestId) { return this._call('dispatchRequest', { requestId: requestId }); },
    
    // ─── OTHERS ───────────────────────────────────────────────
    getMyRequests: function () { return this._call('getMyRequests', {}); },
    getOrderItems: function (orderId) { return this._call('getOrderItems', { orderId: orderId }); },
    getPendingApprovals: function () { return this._call('getPendingApprovals', {}); },
    updateEmployeeRole: function (targetEmployeeId, newRole) { return this._call('updateEmployeeRole', { targetEmployeeId: targetEmployeeId, newRole: newRole }); },
    uploadToDrive: function (base64, fileName) { return this._call('uploadToDrive', { base64: base64, fileName: fileName }); },
    updateStock: function (productId, qty, adminId) { 
      this.invalidateCache('getProducts');
      return this._call('updateStock', { productId: productId, qty: qty, adminId: adminId }); 
    },
    manageProduct: function (op, data) { 
      this.invalidateCache('getProducts');
      return this._call('manageProduct', { op: op, data: data }); 
    },
    manageCategory: function (op, data) { 
      this.invalidateCache('getCategories');
      return this._call('manageCategory', { op: op, data: data }); 
    },
    
    // Legacy / Specialized
    quickDeductStock: function (d) { return this._call('quickDeductStock', d); },
    exportToCSV: function (sheetName) { return this._call('exportToCSV', { sheetName: sheetName }); },
    getAllOrders: function () { return this._call('getAllOrders', {}, true); },
    getAdvancedDashboardData: function (filters) { return this._call('getAdvancedDashboardData', { filters: filters }, true); },

    getSubStock: function (data) { return this._call('getSubStock', data || {}); },
    addEmployee: function (employee) { return this._call('addEmployee', { employee: employee }); },
    deleteEmployee: function (targetEmployeeId) { return this._call('deleteEmployee', { targetEmployeeId: targetEmployeeId }); },
    getFilteredOrders: function (filters) { return this._call('getFilteredOrders', { filters: filters }); },
    receiveStock: function (data) { return this._call('receiveStock', data); },
    receiveSubStock: function (data) { return this._call('receiveSubStock', data); },
    deductSubStock: function (productId, qty) { return this._call('deductSubStock', { productId: productId, qty: qty }); },
    transferSubStock: function (data) { return this._call('transferSubStock', data); },
    returnToMainStock: function (data) { return this._call('returnToMainStock', data); }
  };
  
  window.API = apiObj;
  return apiObj;
})();
