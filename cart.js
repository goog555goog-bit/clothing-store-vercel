
// ============================================================
//  cart.js.html — ระบบตะกร้าสินค้า (localStorage)
// ============================================================

var Cart = {
  KEY: 'invCart',

  getItems: function() {
    try { return JSON.parse(localStorage.getItem(this.KEY)) || []; }
    catch(e) { return []; }
  },

  save: function(items) {
    localStorage.setItem(this.KEY, JSON.stringify(items));
    this.renderBadge();
  },

  add: function(product, productSize) {
    var items = this.getItems();
    var existing = null;
    var size = (productSize || '').trim();

    for (var i = 0; i < items.length; i++) {
      if (String(items[i].productId) === String(product.productId) && (items[i].size || '') === size) { 
        existing = items[i]; 
        break; 
      }
    }

    // Re-verify stock with global products cache if available
    var currentStoreStock = Number(product.stock);
    if (typeof allProducts !== 'undefined' && allProducts) {
      var freshP = allProducts.find(function(p) { return String(p.productId) === String(product.productId); });
      if (freshP) currentStoreStock = Number(freshP.stock);
    }
    
    if (existing) {
      existing.maxStock = currentStoreStock; 
      if (existing.qty >= currentStoreStock) {
        showToast('หยิบถึงขีดจำกัดสต๊อกแล้ว (' + currentStoreStock + ')', 'warning');
        return;
      }
      existing.qty += 1;
    } else {
      if (currentStoreStock <= 0) {
        showToast('สินค้านี้หมดสต๊อกแล้ว', 'warning');
        return;
      }
      items.push({
        productId: product.productId,
        name: product.name,
        price: Number(product.price),
        img: product.imageUrl || '',
        maxStock: currentStoreStock,
        size: size,
        qty: 1
      });
    }

    this.save(items);
    this.render();
    showToast('เพิ่ม "' + product.name + (size ? ' ('+size+')' : '') + '" ลงตะกร้าแล้ว', 'success');
  },

  updateQty: function(productId, delta, size) {
    var items = this.getItems();
    var currentItem = null;
    var currentStock = null;
    var targetSize = size || '';
    if (typeof allProducts !== 'undefined' && allProducts) {
      var p = allProducts.find(function(x) { return String(x.productId) === String(productId); });
      if (p) currentStock = Number(p.stock);
    }

    for (var i = 0; i < items.length; i++) {
      if (String(items[i].productId) === String(productId) && (items[i].size || '') === targetSize) {
        if (currentStock !== null) items[i].maxStock = currentStock;

        var nextQty = items[i].qty + delta;
        if (nextQty <= 0) {
          items.splice(i, 1);
          this.save(items);
          this.render(); 
          return;
        } else if (nextQty > items[i].maxStock) {
          items[i].qty = items[i].maxStock;
          showToast('ขออภัย พัสดุในคลังมีเพียง ' + items[i].maxStock + ' ชิ้น', 'warning');
        } else {
          items[i].qty = nextQty;
        }
        currentItem = items[i];
        break;
      }
    }
    this.save(items);

    // Try targeted update to prevent flickering - fixed ID selection
    var safeSize = targetSize || '';
    var qtyValEl = document.getElementById('qty-val-' + productId + '-' + safeSize);
    var itemTotalEl = document.getElementById('item-total-' + productId + '-' + safeSize);
    
    if (qtyValEl && itemTotalEl && currentItem) {
      qtyValEl.textContent = currentItem.qty;
      var canViewPrice = (typeof hasPermission === 'function') ? hasPermission('view_prices') : true;
      itemTotalEl.textContent = !canViewPrice ? '***' : '฿' + (currentItem.price * currentItem.qty).toLocaleString();
      
      var totalEl = document.getElementById('cartTotal');
      if (totalEl) totalEl.textContent = !canViewPrice ? '***' : '฿' + this.getTotal().toLocaleString();
      this.renderBadge();
    } else {
      this.render();
    }
  },

  remove: function(productId, size) {
    var targetSize = size || '';
    var items = this.getItems().filter(function(i) { 
      return !(String(i.productId) === String(productId) && (i.size || '') === targetSize); 
    });
    this.save(items);
    this.render();
  },

  clear: function() {
    this.save([]);
    this.render();
  },

  getTotal: function() {
    var total = this.getItems().reduce(function(sum, i) { 
      return sum + (Number(i.price) * Number(i.qty)); 
    }, 0);
    // Round to 2 decimal places to avoid floating point issues
    return Math.round(total * 100) / 100;
  },

  getTotalQty: function() {
    return this.getItems().reduce(function(sum, i) { return sum + Number(i.qty); }, 0);
  },

  renderBadge: function() {
    var badge = document.getElementById('cartBadge');
    var badgeMobile = document.getElementById('cartCountMobile');
    var qty = this.getTotalQty();
    
    if (badge) {
      badge.textContent = qty;
      badge.style.display = qty > 0 ? 'flex' : 'none';
    }
    if (badgeMobile) {
      badgeMobile.textContent = qty;
      badgeMobile.style.display = qty > 0 ? 'flex' : 'none';
    }
  },

  render: function() {
    var container = document.getElementById('cartItems');
    var totalEl = document.getElementById('cartTotal');
    var checkBtn = document.getElementById('checkoutBtn');
    if (!container) return;

    var items = this.getItems();
    this.renderBadge();

    if (totalEl) totalEl.textContent = (typeof hasPermission === 'function' && !hasPermission('view_prices')) ? '***' : '฿' + this.getTotal().toLocaleString();
    if (checkBtn) checkBtn.disabled = items.length === 0;

    if (items.length === 0) {
      container.innerHTML = '<div class="empty-state"><i data-lucide="shopping-cart" style="width:32px;height:32px;opacity:0.2;margin-bottom:1rem"></i><p>ตะกร้าว่างเปล่า</p></div>';
      refreshIcons();
      return;
    }

    container.innerHTML = items.map(function(item) {
      var sizeInfo = item.size ? ' <span class="badge badge-pending" style="font-size:0.7rem; padding:0.1rem 0.4rem; vertical-align:middle; margin-left:0.25rem">' + item.size + '</span>' : '';
      return '<div class="cart-item">'
        + '<img src="' + (item.img || '') + '" class="cart-item-img" onerror="this.style.display=\'none\'">'
        + '<div style="flex:1">'
        +   '<div class="flex flex-wrap justify-between gap-2"><div>'
        +     '<div style="font-weight:600;font-size:0.9rem">' + item.name + sizeInfo + '</div>'
        +     '<div style="color:var(--accent);font-size:0.85rem">' + (typeof hasPermission === 'function' && !hasPermission('view_prices') ? '***' : '฿' + item.price.toLocaleString()) + '</div>'
        +   '</div>'
        +   '<button class="btn btn-ghost btn-xs" style="color:var(--danger);padding:0.25rem" onclick="Cart.remove(\'' + item.productId + '\', \'' + (item.size || '') + '\')"><i data-lucide="trash-2" style="width:14px;height:14px"></i></button></div>'
        +   '<div class="flex flex-wrap items-center justify-between gap-2" style="margin-top:0.5rem">'
        +     '<div class="qty-ctrl">'
        +       '<button class="qty-btn" onclick="Cart.updateQty(\'' + item.productId + '\', -1, \'' + (item.size || '') + '\')" aria-label="ลดจำนวน"><i data-lucide="minus" style="width:12px;height:12px"></i></button>'
        +       '<div class="qty-val" id="qty-val-' + item.productId + '-' + (item.size || '') + '">' + item.qty + '</div>'
        +       '<button class="qty-btn" onclick="Cart.updateQty(\'' + item.productId + '\', 1, \'' + (item.size || '') + '\')" aria-label="เพิ่มจำนวน"><i data-lucide="plus" style="width:12px;height:12px"></i></button>'
        +     '</div>'
        +     '<div style="font-weight:700" id="item-total-' + item.productId + '-' + (item.size || '') + '">' + (typeof hasPermission === 'function' && !hasPermission('view_prices') ? '***' : '฿' + (item.price * item.qty).toLocaleString()) + '</div>'
        +   '</div>'
        + '</div>'
        + '</div>';
    }).join('');
    refreshIcons();
  },

  checkout: function(user) {
    if (!user) {
      if (typeof showCheckoutModal === 'function') showCheckoutModal();
      else showToast('กรุณาเข้าสู่ระบบก่อน', 'warning');
      return;
    }
    if (typeof showCheckoutModal === 'function') {
      showCheckoutModal();
    }
  }
};
