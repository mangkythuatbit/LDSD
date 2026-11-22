/**
 * Quản trị CRUD dùng chung cho 3 bảng (anhhung / btc / sinhvien) trên Google Sheets.
 * Thay thế admin_solve/*.php + jQuery AJAX. Mỗi trang khai báo window.ADMIN_CONFIG.
 * Xác thực: mật khẩu admin (Script property ADMIN_PASSWORD) lưu trong sessionStorage của tab.
 */
(function () {
  'use strict';
  var C = window.ADMIN_CONFIG;
  var PW_KEY = 'bit_admin_pw';
  var rows = [];
  var editingId = null;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = BIT.esc;

  /* ---------------- tiện ích ---------------- */
  function getPw() { return sessionStorage.getItem(PW_KEY) || ''; }
  function notify(msg, type) {
    var box = document.createElement('div');
    box.className = 'alert alert-' + (type || 'success') + ' alert-dismissible admin-alert';
    box.setAttribute('role', 'alert');
    box.innerHTML = esc(msg) + '<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>';
    var holder = $('#alert-holder');
    holder.innerHTML = '';
    holder.appendChild(box);
    setTimeout(function () { if (box.parentNode) box.remove(); }, 5000);
  }
  function setBusy(btn, busy, text) {
    btn.disabled = busy;
    if (busy) { btn.dataset.old = btn.textContent; btn.textContent = text || 'Đang xử lý…'; }
    else if (btn.dataset.old) { btn.textContent = btn.dataset.old; }
  }

  /** Gọi API có mật khẩu; nếu sai mật khẩu thì yêu cầu đăng nhập lại. */
  function secured(payload) {
    return BIT.apiPost(Object.assign({ password: getPw(), table: C.table }, payload)).catch(function (e) {
      if (/mật khẩu|ADMIN_PASSWORD/i.test(e.message)) { sessionStorage.removeItem(PW_KEY); showLogin(e.message); }
      throw e;
    });
  }

  /* ---------------- đăng nhập ---------------- */
  var loginModal;
  function showLogin(msg) {
    $('#login-error').textContent = msg || '';
    loginModal.show();
    setTimeout(function () { $('#admin-pw').focus(); }, 300);
  }
  function initLogin() {
    loginModal = new bootstrap.Modal($('#loginModal'), { backdrop: 'static', keyboard: false });
    $('#login-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = $('#login-btn'), pw = $('#admin-pw').value;
      setBusy(btn, true, 'Đang kiểm tra…');
      BIT.apiPost({ action: 'login', password: pw }).then(function () {
        sessionStorage.setItem(PW_KEY, pw);
        $('#admin-pw').value = '';
        loginModal.hide();
        loadRows();
      }).catch(function (err) { $('#login-error').textContent = err.message; })
        .then(function () { setBusy(btn, false); });
    });
    var out = $('#logout-link');
    if (out) out.addEventListener('click', function (e) {
      e.preventDefault(); sessionStorage.removeItem(PW_KEY); location.reload();
    });
    if (!getPw()) showLogin(); else loadRows();
  }

  /* ---------------- bảng dữ liệu ---------------- */
  function cell(col, r) {
    if (col.type === 'img') {
      var src = BIT.imgSrc(C.table, r[C.imgField], '../../');
      return '<td><img class="admin-thumb" src="' + esc(src) + '" alt="" loading="lazy" title="' + esc(r[C.imgField] || 'Chưa có ảnh') + '"></td>';
    }
    var v = r[col.key] || '';
    if (col.type === 'date') v = BIT.fmtDate(v, '');
    return '<td class="' + (col.long ? 'cell-long' : '') + '" title="' + esc(v) + '">' + esc(v) + '</td>';
  }

  function render() {
    var q = ($('#admin-search').value || '').trim().toLocaleLowerCase('vi-VN');
    var list = !q ? rows : rows.filter(function (r) {
      return Object.keys(r).some(function (k) { return String(r[k]).toLocaleLowerCase('vi-VN').indexOf(q) > -1; });
    });
    var body = $('#admin-tbody');
    if (!list.length) {
      body.innerHTML = '<tr><td colspan="' + (C.columns.length + 2) + '" class="text-center py-4">' + (rows.length ? 'Không có kết quả phù hợp' : 'Không có dữ liệu') + '</td></tr>';
      return;
    }
    body.innerHTML = list.map(function (r) {
      return '<tr data-id="' + esc(r[C.pk]) + '"><td>' + esc(r[C.pk]) + '</td>' +
        C.columns.map(function (c) { return cell(c, r); }).join('') +
        '<td class="action-buttons">' +
          '<a href="#" class="edit-btn" title="Sửa"><i class="fas fa-pen-to-square"></i></a>' +
          '<a href="#" class="delete-btn" title="Xóa"><i class="fas fa-trash"></i></a>' +
        '</td></tr>';
    }).join('');
  }

  function loadRows() {
    $('#admin-tbody').innerHTML = '<tr><td colspan="' + (C.columns.length + 2) + '" class="text-center py-4">Đang tải dữ liệu…</td></tr>';
    BIT.apiList(C.table, { force: true }).then(function (d) { rows = d; render(); })
      .catch(function (e) {
        $('#admin-tbody').innerHTML = '<tr><td colspan="' + (C.columns.length + 2) + '" class="text-center py-4 text-danger">Không tải được dữ liệu: ' + esc(e.message) + '</td></tr>';
      });
  }

  /* ---------------- form thêm / sửa ---------------- */
  var formModal;
  function buildForm() {
    var html = C.fields.map(function (f) {
      var id = 'f_' + f.key, req = f.required ? ' required' : '';
      var input = f.type === 'textarea'
        ? '<textarea id="' + id + '" class="form-control" rows="4" placeholder="' + esc(f.label) + '"' + req + '></textarea>'
        : '<input id="' + id + '" type="' + (f.type || 'text') + '" class="form-control" placeholder="' + esc(f.label) + '"' + req + '>';
      return '<div class="form-group mb-3"><label for="' + id + '" class="form-label">' + esc(f.label) + (f.required ? ' <span class="text-danger">*</span>' : '') + '</label>' + input + '</div>';
    }).join('');
    $('#form-fields').innerHTML =
      '<div class="form-group mb-3"><label for="f_file" class="form-label">Ảnh</label>' +
      '<input id="f_file" type="file" accept="image/*" class="form-control">' +
      '<div id="img-hint" class="form-text"></div>' +
      '<img id="img-preview" class="admin-preview" alt="" hidden></div>' + html;
    $('#f_file').addEventListener('change', function () {
      var f = this.files[0], pv = $('#img-preview');
      if (f) { pv.src = URL.createObjectURL(f); pv.hidden = false; }
    });
  }

  function openForm(id) {
    editingId = id || null;
    var rec = id ? rows.filter(function (r) { return String(r[C.pk]) === String(id); })[0] : null;
    $('#form-title').innerHTML = rec ? 'Chỉnh sửa thông tin <span style="color:#679eff">#' + esc(id) + '</span>' : 'Thêm mới thông tin';
    $('#record-form').reset();
    C.fields.forEach(function (f) { $('#f_' + f.key).value = rec ? (rec[f.key] || '') : ''; });
    var pv = $('#img-preview');
    if (rec && rec[C.imgField]) { pv.src = BIT.imgSrc(C.table, rec[C.imgField], '../../'); pv.hidden = false; $('#img-hint').textContent = 'Để trống nếu muốn giữ ảnh hiện tại.'; }
    else { pv.hidden = true; pv.removeAttribute('src'); $('#img-hint').textContent = ''; }
    formModal.show();
  }

  /** Thu nhỏ ảnh về tối đa 1280px, xuất JPEG (GIF giữ nguyên) để upload nhanh và nhẹ. */
  function prepareImage(file) {
    return new Promise(function (resolve, reject) {
      if (file.size > 20 * 1024 * 1024) return reject(new Error('Ảnh quá lớn (tối đa 20MB)'));
      function raw() {
        var fr = new FileReader();
        fr.onload = function () { resolve({ base64: String(fr.result).split(',')[1], mimeType: file.type, filename: file.name }); };
        fr.onerror = function () { reject(new Error('Không đọc được file ảnh')); };
        fr.readAsDataURL(file);
      }
      if (file.type === 'image/gif') return raw();
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var s = Math.min(1, 1280 / Math.max(img.width, img.height));
        var cv = document.createElement('canvas');
        cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
        var ctx = cv.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        resolve({ base64: cv.toDataURL('image/jpeg', 0.85).split(',')[1], mimeType: 'image/jpeg', filename: file.name.replace(/\.\w+$/, '') + '.jpg' });
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('File không phải ảnh hợp lệ')); };
      img.src = url;
    });
  }

  function submitForm(e) {
    e.preventDefault();
    var btn = $('#save-btn'), data = {}, file = $('#f_file').files[0];
    C.fields.forEach(function (f) { data[f.key] = $('#f_' + f.key).value; });
    setBusy(btn, true, file ? 'Đang tải ảnh…' : 'Đang lưu…');

    var step = file
      ? prepareImage(file).then(function (img) { return secured({ action: 'upload', filename: img.filename, mimeType: img.mimeType, base64: img.base64 }); })
          .then(function (up) { data[C.imgField] = up.url; })
      : Promise.resolve();

    step.then(function () {
      btn.textContent = 'Đang lưu…';
      return editingId ? secured({ action: 'update', id: editingId, data: data }) : secured({ action: 'create', data: data });
    }).then(function () {
      BIT.clearCache(C.table);
      formModal.hide();
      notify(editingId ? 'Chỉnh sửa thành công' : 'Thêm mới thành công');
      loadRows();
    }).catch(function (err) {
      notify((editingId ? 'Chỉnh sửa thất bại: ' : 'Thêm mới thất bại: ') + err.message, 'danger');
    }).then(function () { setBusy(btn, false); });
  }

  /* ---------------- khởi tạo ---------------- */
  document.addEventListener('DOMContentLoaded', function () {
    formModal = new bootstrap.Modal($('#formModal'), { backdrop: 'static', keyboard: false });
    buildForm();
    $('#add-btn').addEventListener('click', function () { openForm(null); });
    $('#record-form').addEventListener('submit', submitForm);
    $('#admin-search').addEventListener('input', render);

    $('#admin-tbody').addEventListener('click', function (e) {
      var a = e.target.closest('a'); if (!a) return;
      e.preventDefault();
      var tr = a.closest('tr'), id = tr.dataset.id;
      if (a.classList.contains('edit-btn')) return openForm(id);
      if (a.classList.contains('delete-btn')) {
        if (!confirm('Bạn có chắc chắn muốn xóa mục này không?')) return;
        secured({ action: 'delete', id: id }).then(function () {
          BIT.clearCache(C.table); notify('Xóa thành công'); loadRows();
        }).catch(function (err) { notify('Xóa thất bại: ' + err.message, 'danger'); });
      }
    });
    initLogin();
  });
})();
