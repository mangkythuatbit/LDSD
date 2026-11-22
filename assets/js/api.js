/**
 * Lớp truy cập dữ liệu dùng chung (thay cho mysqli + include 'connect.php').
 * Yêu cầu nạp assets/js/config.js trước file này.
 */
(function (w) {
  'use strict';
  var CFG = w.BIT_CONFIG || {};

  // Thư mục ảnh trong repo cho từng bảng (ảnh cũ vẫn lưu theo tên file)
  var IMG_FOLDER = { sinhvien: 'sv', btc: 'btc', anhhung: 'heroes' };
  // Ảnh mặc định (placeholder SVG nhúng sẵn) khi bản ghi chưa có ảnh - các file default.* cũ không tồn tại trong repo
  var PLACEHOLDER = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="#ececec"/>' +
    '<circle cx="60" cy="46" r="20" fill="#bdbdbd"/><path d="M20 112c4-26 22-38 40-38s36 12 40 38z" fill="#bdbdbd"/></svg>');


  function isConfigured() {
    return CFG.API_URL && CFG.API_URL.indexOf('PASTE_') === -1;
  }

  function parse(res) {
    return res.json().then(function (j) {
      if (!j.ok) throw new Error(j.error || 'Lỗi không xác định');
      return j.data;
    });
  }

  /** Đọc dữ liệu công khai (GET). */
  function apiGet(params) {
    if (!isConfigured()) return Promise.reject(new Error('Chưa cấu hình API_URL trong assets/js/config.js'));
    var qs = Object.keys(params).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
    }).join('&');
    return fetch(CFG.API_URL + '?' + qs).then(parse);
  }

  /** Ghi dữ liệu (POST). Dùng text/plain để tránh preflight CORS với Apps Script. */
  function apiPost(body) {
    if (!isConfigured()) return Promise.reject(new Error('Chưa cấu hình API_URL trong assets/js/config.js'));
    return fetch(CFG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    }).then(parse);
  }

  /** Danh sách bản ghi của 1 bảng, có cache sessionStorage ngắn hạn. */
  function apiList(table, opts) {
    opts = opts || {};
    var key = 'bit_cache_' + table;
    if (!opts.force) {
      try {
        var c = JSON.parse(sessionStorage.getItem(key) || 'null');
        if (c && Date.now() - c.t < (CFG.CACHE_SECONDS || 60) * 1000) return Promise.resolve(c.d);
      } catch (e) { /* bỏ qua cache hỏng */ }
    }
    return apiGet({ action: 'list', table: table }).then(function (d) {
      try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), d: d })); } catch (e) { /* đầy bộ nhớ */ }
      return d;
    });
  }

  function apiGetOne(table, id) {
    return apiGet({ action: 'get', table: table, id: id });
  }

  function clearCache(table) {
    try { sessionStorage.removeItem('bit_cache_' + table); } catch (e) { /* noop */ }
  }

  /**
   * Chuyển giá trị cột ảnh thành URL dùng được.
   * - Đã là URL (Drive/https) -> giữ nguyên
   * - Là tên file cũ          -> ./assets/img/<thư mục>/<tên file> (tính từ gốc site)
   * `base` cho phép trang ở thư mục con trỏ về gốc, ví dụ '../../'.
   */
  function imgSrc(table, value, base) {
    base = base || './';
    value = (value || '').trim();
    if (!value) return PLACEHOLDER;
    // Link chia sẻ Google Drive (file/d/ID/view, open?id=ID, uc?id=ID) -> link ảnh hiển thị được
    var drive = /drive\.google\.com\/(?:file\/d\/|open\?(?:[^#]*&)?id=|uc\?(?:[^#]*&)?id=|thumbnail\?(?:[^#]*&)?id=)([\w-]{10,})/i.exec(value);
    if (drive) return 'https://drive.google.com/thumbnail?id=' + drive[1] + '&sz=w1600';
    if (/^(https?:)?\/\//i.test(value) || value.indexOf('data:') === 0) return value;
    return base + 'assets/img/' + IMG_FOLDER[table] + '/' + encodeURI(value);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /** dd/mm/yyyy từ yyyy-mm-dd; trả về fallback nếu rỗng / 0000-00-00. */
  function fmtDate(iso, fallback) {
    if (!iso || /^0000/.test(iso)) return fallback || 'chưa rõ';
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    return m ? m[3] + '/' + m[2] + '/' + m[1] : iso;
  }

  /**
   * Nạp 1 mảnh HTML vào phần tử đích và chạy lại các thẻ <script> bên trong
   * (innerHTML không tự chạy script). Thay cho `<?php include ... ?>`.
   */
  function loadFragment(target, url) {
    var el = typeof target === 'string' ? document.querySelector(target) : target;
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('Không tải được ' + url);
      return r.text();
    }).then(function (html) {
      el.innerHTML = html;
      var scripts = Array.prototype.slice.call(el.querySelectorAll('script'));
      return scripts.reduce(function (chain, old) {
        return chain.then(function () {
          return new Promise(function (resolve) {
            var s = document.createElement('script');
            Array.prototype.slice.call(old.attributes).forEach(function (a) { s.setAttribute(a.name, a.value); });
            if (old.src) { s.onload = s.onerror = resolve; } else { s.textContent = old.textContent; }
            old.parentNode.replaceChild(s, old);
            if (!old.src) resolve();
          });
        });
      }, Promise.resolve());
    });
  }

  w.BIT = {
    isConfigured: isConfigured, apiGet: apiGet, apiPost: apiPost, apiList: apiList,
    apiGetOne: apiGetOne, clearCache: clearCache, imgSrc: imgSrc, esc: esc,
    fmtDate: fmtDate, loadFragment: loadFragment
  };
})(window);
