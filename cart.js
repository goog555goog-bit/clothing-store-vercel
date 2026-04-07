
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

  add: function(product) {
    var items = this.getItems();
    var existing = null;
    for (var i = 0; i < items.length; i++) {
      if (items[i].productId === product.productId) { existing = items[i]; break; }
    }

    // Re-verify stock with global products cache if available
    var currentStoreStock = Number(product.stock);
    if (typeof allProducts !== 'undefined' && allProducts) {
      var freshP = allProducts.filter(function(p) { return String(p.productId) === String(product.productId); })[0];
      if (freshP) currentStoreStock = Number(freshP.stock);
    }
    
    if (existing) {
      existing.maxStock = currentStoreStock; // update maxStock reference
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
        qty: 1
      });
    }

    this.save(items);
    this.render();
    showToast('เพิ่ม "' + product.name + '" ลงตะกร้าแล้ว', 'success');
  },

  updateQty: function(productId, delta) {
    var items = this.getItems();
    for (var i = 0; i < items.length; i++) {
      if (items[i].productId === productId) {
        items[i].qty += delta;
        if (items[i].qty <= 0) {
          items.splice(i, 1);
        } else if (items[i].qty > items[i].maxStock) {
          items[i].qty = items[i].maxStock;
          showToast('จำนวนเกินสต๊อก', 'warning');
        }
        break;
      }
    }
    this.save(items);
    this.render();
  },

  remove: function(productId) {
    var items = this.getItems().filter(function(i) { return i.productId !== productId; });
    this.save(items);
    this.render();
  },

  clear: function() {
    this.save([]);
    this.render();
  },

  getTotal: function() {
    return this.getItems().reduce(function(sum, i) { return sum + i.price * i.qty; }, 0);
  },

  getTotalQty: function() {
    return this.getItems().reduce(function(sum, i) { return sum + i.qty; }, 0);
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

    if (totalEl) totalEl.textContent = '฿' + this.getTotal().toLocaleString();
    if (checkBtn) checkBtn.disabled = items.length === 0;

    if (items.length === 0) {
      container.innerHTML = '<div class="empty-state"><i data-lucide="shopping-cart" style="width:32px;height:32px;opacity:0.2;margin-bottom:1rem"></i><p>ตะกร้าว่างเปล่า</p></div>';
      refreshIcons();
      return;
    }

    container.innerHTML = items.map(function(item) {
      return '<div class="cart-item">'
        + '<img src="' + (item.img || '') + '" class="cart-item-img" onerror="this.style.display=\'none\'">'
        + '<div style="flex:1">'
        +   '<div class="flex justify-between"><div>'
        +     '<div style="font-weight:600;font-size:0.9rem">' + item.name + '</div>'
        +     '<div style="color:var(--accent);font-size:0.85rem">฿' + item.price.toLocaleString() + '</div>'
        +   '</div>'
        +   '<button class="btn btn-ghost btn-xs" style="color:var(--danger);padding:0.25rem" onclick="Cart.remove(\'' + item.productId + '\')"><i data-lucide="trash-2" style="width:14px;height:14px"></i></button></div>'
        +   '<div class="flex items-center justify-between" style="margin-top:0.5rem">'
        +     '<div class="qty-ctrl">'
        +       '<button class="qty-btn" onclick="Cart.updateQty(\'' + item.productId + '\', -1)"><i data-lucide="minus" style="width:12px;height:12px"></i></button>'
        +       '<div class="qty-val">' + item.qty + '</div>'
        +       '<button class="qty-btn" onclick="Cart.updateQty(\'' + item.productId + '\', 1)"><i data-lucide="plus" style="width:12px;height:12px"></i></button>'
        +     '</div>'
        +     '<div style="font-weight:700">฿' + (item.price * item.qty).toLocaleString() + '</div>'
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
