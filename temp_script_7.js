
    function toggleAdminMoreMenu() {
      var menu = document.getElementById('adminMoreMenu');
      var btn = document.getElementById('adminMoreBtn');
      if (!menu) return;

      var isOpen = menu.style.display !== 'none';
      menu.style.display = isOpen ? 'none' : 'block';

      // เปลี่ยนสีปุ่ม "เพิ่มเติม" เมื่อเปิด
      if (btn) {
        btn.style.color = isOpen ? '' : 'var(--primary)';
      }

      refreshIcons();
    }

    // ปิด More Menu เมื่อกดที่อื่น
    document.addEventListener('click', function (e) {
      var menu = document.getElementById('adminMoreMenu');
      var btn = document.getElementById('adminMoreBtn');
      if (menu && menu.style.display !== 'none') {
        if (!menu.contains(e.target) && btn && !btn.contains(e.target)) {
          menu.style.display = 'none';
          if (btn) btn.style.color = '';
        }
      }

      var scanMenu = document.getElementById('scanModeDropdown');
      if (scanMenu && scanMenu.style.display !== 'none') {
        if (!scanMenu.contains(e.target)) {
          scanMenu.style.display = 'none';
        }
      }
    });
  
