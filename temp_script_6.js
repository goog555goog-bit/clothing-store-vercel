
    var scriptUrl = 'index.html'; // Mock scriptUrl for compat
    function navigateTo(url) {
      if (url.includes('?page=login')) url = 'login.html';
      else if (url.includes('?page=manager')) url = 'manager.html';
      else if (url.includes('?page=admin')) url = 'admin.html';
      else if (url.includes('?page=scanner')) url = 'scanner.html';
      window.top.location.href = url;
    }
    // Admin Safety placeholders
    function refreshIcons() { if (typeof lucide !== 'undefined') lucide.createIcons(); }

    function escapeHTML(str) {
      if (!str) return "";
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }
    function adminLogout() {
      if (!confirm('ยืนยันการออกจากระบบแอดมิน?')) return;
      localStorage.removeItem('_user');
      localStorage.removeItem('_tok');
      localStorage.removeItem('_sessionLastActive');
      navigateTo('login.html');
    }
  
