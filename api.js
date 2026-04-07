// ============================================================
//  api.js — Frontend REST Adapter for Google Apps Script Web App
// ============================================================

// 🔴 TODO: Replace with your actual Google Apps Script Web App ID/URL after Deployment
const GAS_URL = "https://script.google.com/macros/s/AKfycbxnRTEb5Q09UkPPiKgx2nzee7ZTogtomaeUzQoj8FJ_0AlfOvJxNt0lPQwhYHLz-OEweg/exec";

var API = (function () {
  var apiObj = {
    _call: function (action, data) {
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

      return new Promise(function (resolve, reject) {
        fetch(GAS_URL, {
          method: "POST",
          headers: {
            "Content-Type": "text/plain;charset=utf-8",
          },
          body: JSON.stringify(payload)
        })
          .then(function (res) {
            if (!res.ok) throw new Error("Network Error: " + res.status);
            return res.json(); // GAS should return JSON string via ContentService.createTextOutput
          })
          .then(function (res) {
            if (res && res.success) resolve(res);
            else reject(res ? res.message : 'Unknown error');
          })
          .catch(function (err) {
            console.error('API Error [' + action + ']:', err);
            reject(err.message || 'Failed to contact database.');
          });
      });
    },

    login: function (employeeId) { return this._call('login', { employeeId: employeeId }); },
    getProducts: function (filter) { return this._call('getProducts', { filter: filter }); },
    getCategories: function () { return this._call('getCategories', {}); },
    getStorefrontData: function () { return this._call('getStorefrontData', {}); },
    createRequest: function (items) { return this._call('createRequest', { items: items }); },
    getMyRequests: function () { return this._call('getMyRequests', {}); },
    getEmployees: function () { return this._call('getEmployees', {}); },
    updateEmployeeRole: function (targetEmployeeId, newRole) { return this._call('updateEmployeeRole', { targetEmployeeId: targetEmployeeId, newRole: newRole }); },
    getAllOrders: function () { return this._call('getAllOrders', {}); },
    signForReceipt: function (requestId, signature) { return this._call('signForReceipt', { requestId: requestId, signature: signature }); },
    manageCategory: function (op, data) { return this._call('manageCategory', { op: op, data: data }); },
    uploadToDrive: function (base64, fileName) { return this._call('uploadToDrive', { base64: base64, fileName: fileName }); },
    getOrderItems: function (orderId) { return this._call('getOrderItems', { orderId: orderId }); },
    getPendingApprovals: function () { return this._call('getPendingApprovals', {}); },
    approveOrder: function (orderId, employeeId, comment) { return this._call('approveOrder', { orderId: orderId, employeeId: employeeId, comment: comment }); },
    rejectOrder: function (orderId, employeeId, comment) { return this._call('rejectOrder', { orderId: orderId, employeeId: employeeId, comment: comment }); },
    getDashboardStats: function () { return this._call('getDashboardStats', {}); },
    getAdvancedDashboardData: function (filters) { return this._call('getAdvancedDashboardData', { filters: filters }); },
    approveRequest: function (requestId, comment) { return this._call('approveRequest', { requestId: requestId, comment: comment }); },
    rejectRequest: function (requestId, comment) { return this._call('rejectRequest', { requestId: requestId, comment: comment }); },
    dispatchRequest: function (requestId) { return this._call('dispatchRequest', { requestId: requestId }); },
    quickDeductStock: function (d) { return this._call('quickDeductStock', d); },
    exportToCSV: function (sheetName) { return this._call('exportToCSV', { sheetName: sheetName }); },
    getMonthlyTrends: function () { return this._call('getMonthlyTrends', {}); },
    getReportData: function (type) { return this._call('getReportData', { type: type }); },
    getTopRequestedItems: function (month) { return this._call('getTopRequestedItems', { month: month }); },
    getDepartmentSpending: function (month) { return this._call('getDepartmentSpending', { month: month }); },
    getSubStock: function (data) { return this._call('getSubStock', data || {}); },
    addEmployee: function (employee) { return this._call('addEmployee', { employee: employee }); },
    deleteEmployee: function (targetEmployeeId) { return this._call('deleteEmployee', { targetEmployeeId: targetEmployeeId }); },
    getFilteredOrders: function (filters) { return this._call('getFilteredOrders', { filters: filters }); },
    updateStock: function (productId, qty, adminId) { return this._call('updateStock', { productId: productId, qty: qty, adminId: adminId }); },
    receiveStock: function (data) { return this._call('receiveStock', data); },
    receiveSubStock: function (data) { return this._call('receiveSubStock', data); },
    deductSubStock: function (productId, qty) { return this._call('deductSubStock', { productId: productId, qty: qty }); },
    transferSubStock: function (data) { return this._call('transferSubStock', data); },
    returnToMainStock: function (data) { return this._call('returnToMainStock', data); },
    manageProduct: function (op, data) { return this._call('manageProduct', { op: op, data: data }); }
  };
  window.API = apiObj;
  console.log('✅ API Module mapped for Vercel/REST');
  return apiObj;
})();
