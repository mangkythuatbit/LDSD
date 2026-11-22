/**
 * =====================================================================
 *  BIT – Về nguồn | Backend Google Apps Script + Google Sheets
 *  Thay thế hoàn toàn Config/*.php + admin_solve/*.php (MySQL)
 * =====================================================================
 *
 *  Mỗi bảng MySQL cũ  ->  1 sheet (tab) cùng tên, hàng 1 là tiêu đề cột:
 *    sinhvien : sv_id | mssv | sv_img | sv_name | sv_sharing
 *    btc      : btc_id | mssv | btc_img | btc_name | btc_title | btc_position
 *               | btc_phone | btc_email | btc_sharing | id_event
 *    anhhung  : anhhung_id | anhhung_img | anhhung_name | anhhung_date
 *               | anhhung_home | anhhung_chiencong | anhhung_note
 *
 *  API (Web App):
 *    GET  ?action=list&table=<sinhvien|btc|anhhung>     -> công khai (đọc)
 *    GET  ?action=get&table=<...>&id=<id>               -> công khai (đọc)
 *    POST {action:'login'|'create'|'update'|'delete'|'upload', password, ...}
 *         -> cần mật khẩu admin (Script property ADMIN_PASSWORD)
 *
 *  Cài đặt: xem README.md (mục "Cài đặt Apps Script").
 */

var TABLES = {
  sinhvien: {
    pk: 'sv_id',
    cols: ['sv_id', 'mssv', 'sv_img', 'sv_name', 'sv_sharing'],
    required: ['sv_name', 'sv_sharing']
  },
  btc: {
    pk: 'btc_id',
    cols: ['btc_id', 'mssv', 'btc_img', 'btc_name', 'btc_title', 'btc_position',
           'btc_phone', 'btc_email', 'btc_sharing', 'id_event'],
    required: ['btc_name', 'btc_title', 'btc_position', 'btc_phone', 'btc_email', 'btc_sharing']
  },
  anhhung: {
    pk: 'anhhung_id',
    cols: ['anhhung_id', 'anhhung_img', 'anhhung_name', 'anhhung_date',
           'anhhung_home', 'anhhung_chiencong', 'anhhung_note'],
    required: ['anhhung_name', 'anhhung_date', 'anhhung_home']
  }
};

var CACHE_SECONDS = 120;        // thời gian cache dữ liệu đọc công khai
var MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
var MAX_FAILED_LOGINS = 10;     // tối đa số lần sai mật khẩu / 10 phút

/* ------------------------------------------------------------------ */
/*  ĐIỂM VÀO WEB APP                                                   */
/* ------------------------------------------------------------------ */

function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    var action = p.action || 'list';

    if (action === 'ping') return json_({ ok: true, time: new Date().toISOString() });

    var table = getTable_(p.table);

    if (action === 'list') {
      return json_({ ok: true, data: readAllCached_(p.table) });
    }
    if (action === 'get') {
      var rows = readAllCached_(p.table);
      var found = null;
      for (var i = 0; i < rows.length; i++) {
        if (String(rows[i][table.pk]) === String(p.id)) { found = rows[i]; break; }
      }
      return json_(found ? { ok: true, data: found } : { ok: false, error: 'Không tìm thấy dữ liệu' });
    }
    return json_({ ok: false, error: 'Action không hợp lệ' });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    requireAdmin_(body.password);

    switch (body.action) {
      case 'login':  return json_({ ok: true });
      case 'create': return json_({ ok: true, data: createRow_(body.table, body.data || {}) });
      case 'update': return json_({ ok: true, data: updateRow_(body.table, body.id, body.data || {}) });
      case 'delete': deleteRow_(body.table, body.id); return json_({ ok: true });
      case 'upload': return json_({ ok: true, data: uploadImage_(body) });
      default:       return json_({ ok: false, error: 'Action không hợp lệ' });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ------------------------------------------------------------------ */
/*  BẢO MẬT                                                            */
/* ------------------------------------------------------------------ */

function requireAdmin_(password) {
  var props = PropertiesService.getScriptProperties();
  var real = props.getProperty('ADMIN_PASSWORD');
  if (!real) throw new Error('Chưa cấu hình ADMIN_PASSWORD trong Script properties');

  var cache = CacheService.getScriptCache();
  var failed = Number(cache.get('failed_logins') || 0);
  if (failed >= MAX_FAILED_LOGINS) {
    throw new Error('Quá nhiều lần đăng nhập sai. Vui lòng thử lại sau 10 phút.');
  }
  if (!safeEqual_(String(password || ''), real)) {
    cache.put('failed_logins', String(failed + 1), 600);
    throw new Error('Sai mật khẩu quản trị');
  }
  if (failed) cache.remove('failed_logins');
}

function safeEqual_(a, b) {
  var diff = a.length ^ b.length;
  var len = Math.max(a.length, b.length);
  for (var i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/* ------------------------------------------------------------------ */
/*  TRUY CẬP SHEET                                                     */
/* ------------------------------------------------------------------ */

function getTable_(name) {
  if (!name || !TABLES.hasOwnProperty(name)) throw new Error('Bảng không hợp lệ');
  return TABLES[name];
}

function getSpreadsheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  var active = SpreadsheetApp.getActiveSpreadsheet();   // script gắn trong Sheet
  if (!active) throw new Error('Chưa gắn Google Sheet. Hãy mở Apps Script từ Sheet (Extensions > Apps Script) hoặc đặt SHEET_ID.');
  return active;
}

function getSheet_(name) {
  var sh = getSpreadsheet_().getSheetByName(name);
  if (!sh) throw new Error('Chưa có sheet "' + name + '". Hãy chạy hàm setup() một lần.');
  return sh;
}

function normalize_(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
  }
  return v === null || v === undefined ? '' : String(v);
}

function readAll_(name) {
  var table = getTable_(name);
  var sh = getSheet_(name);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var values = sh.getRange(2, 1, last - 1, table.cols.length).getValues();
  var out = [];
  for (var r = 0; r < values.length; r++) {
    if (values[r][0] === '' || values[r][0] === null) continue;   // bỏ hàng trống
    var obj = {};
    for (var c = 0; c < table.cols.length; c++) obj[table.cols[c]] = normalize_(values[r][c]);
    out.push(obj);
  }
  return out;
}

function readAllCached_(name) {
  var cache = CacheService.getScriptCache();
  var key = 'tbl_' + name;
  var hit = cache.get(key);
  if (hit) { try { return JSON.parse(hit); } catch (e) { /* bỏ qua */ } }
  var rows = readAll_(name);
  try {
    var s = JSON.stringify(rows);
    if (s.length < 90000) cache.put(key, s, CACHE_SECONDS);   // giới hạn 100KB / key
  } catch (e) { /* không cache được thì thôi */ }
  return rows;
}

function clearCache_(name) {
  CacheService.getScriptCache().remove('tbl_' + name);
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/* ------------------------------------------------------------------ */
/*  CRUD                                                               */
/* ------------------------------------------------------------------ */

function cleanData_(table, data, forUpdate) {
  var clean = {};
  for (var i = 0; i < table.cols.length; i++) {
    var col = table.cols[i];
    if (col === table.pk) continue;
    if (data.hasOwnProperty(col)) {
      var v = normalize_(data[col]).trim();
      if (v.length > 5000) throw new Error('Nội dung quá dài ở trường ' + col);
      clean[col] = v;
    }
  }
  if (!forUpdate) {
    for (var j = 0; j < table.required.length; j++) {
      if (!clean[table.required[j]]) throw new Error('Thiếu thông tin bắt buộc: ' + table.required[j]);
    }
  }
  return clean;
}

function findRow_(sh, table, id) {
  var last = sh.getLastRow();
  if (last < 2) return -1;
  var ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

function createRow_(name, data) {
  var table = getTable_(name);
  var clean = cleanData_(table, data, false);
  return withLock_(function () {
    var sh = getSheet_(name);
    var last = sh.getLastRow();
    var maxId = 0;
    if (last >= 2) {
      var ids = sh.getRange(2, 1, last - 1, 1).getValues();
      for (var i = 0; i < ids.length; i++) maxId = Math.max(maxId, Number(ids[i][0]) || 0);
    }
    var row = {};
    row[table.pk] = String(maxId + 1);
    for (var c = 1; c < table.cols.length; c++) row[table.cols[c]] = clean[table.cols[c]] || '';
    sh.appendRow(table.cols.map(function (col) { return row[col]; }));
    clearCache_(name);
    return row;
  });
}

function updateRow_(name, id, data) {
  var table = getTable_(name);
  var clean = cleanData_(table, data, true);
  return withLock_(function () {
    var sh = getSheet_(name);
    var rowNum = findRow_(sh, table, id);
    if (rowNum < 0) throw new Error('Không tìm thấy bản ghi #' + id);

    var current = sh.getRange(rowNum, 1, 1, table.cols.length).getValues()[0];
    var oldRow = {};
    table.cols.forEach(function (col, i) { oldRow[col] = normalize_(current[i]); });

    var merged = {};
    table.cols.forEach(function (col) {
      merged[col] = (col !== table.pk && clean.hasOwnProperty(col)) ? clean[col] : oldRow[col];
    });
    for (var j = 0; j < table.required.length; j++) {
      if (!merged[table.required[j]]) throw new Error('Thiếu thông tin bắt buộc: ' + table.required[j]);
    }
    sh.getRange(rowNum, 1, 1, table.cols.length)
      .setValues([table.cols.map(function (col) { return merged[col]; })]);

    // Ảnh cũ trên Drive không còn dùng -> bỏ vào thùng rác
    var imgCol = imgColumn_(table);
    if (imgCol && oldRow[imgCol] && oldRow[imgCol] !== merged[imgCol]) trashDriveImage_(oldRow[imgCol]);

    clearCache_(name);
    return merged;
  });
}

function deleteRow_(name, id) {
  var table = getTable_(name);
  withLock_(function () {
    var sh = getSheet_(name);
    var rowNum = findRow_(sh, table, id);
    if (rowNum < 0) throw new Error('Không tìm thấy bản ghi #' + id);
    var imgCol = imgColumn_(table);
    if (imgCol) {
      var idx = table.cols.indexOf(imgCol);
      trashDriveImage_(normalize_(sh.getRange(rowNum, idx + 1).getValue()));
    }
    sh.deleteRow(rowNum);
    clearCache_(name);
  });
}

function imgColumn_(table) {
  for (var i = 0; i < table.cols.length; i++) {
    if (/_img$/.test(table.cols[i])) return table.cols[i];
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  UPLOAD ẢNH -> GOOGLE DRIVE                                         */
/* ------------------------------------------------------------------ */

function getUploadFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('DRIVE_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* tạo mới bên dưới */ } }
  var folder = DriveApp.createFolder('BIT_VeNguon_Uploads');
  props.setProperty('DRIVE_FOLDER_ID', folder.getId());
  return folder;
}

function uploadImage_(body) {
  getTable_(body.table);
  var mime = String(body.mimeType || '');
  if (!/^image\/(jpeg|png|webp|gif)$/.test(mime)) throw new Error('Chỉ hỗ trợ ảnh JPG, PNG, WEBP, GIF');
  var bytes = Utilities.base64Decode(String(body.base64 || ''));
  if (bytes.length > MAX_UPLOAD_BYTES) throw new Error('Ảnh vượt quá 8MB');

  var safeName = String(body.filename || 'image').replace(/[^\w.\-]+/g, '_').slice(0, 80);
  var blob = Utilities.newBlob(bytes, mime, body.table + '_' + Date.now() + '_' + safeName);
  var file = getUploadFolder_().createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { id: file.getId(), url: driveImageUrl_(file.getId()) };
}

function driveImageUrl_(id) {
  return 'https://drive.google.com/thumbnail?id=' + id + '&sz=w1600';
}

function trashDriveImage_(value) {
  var m = /[?&]id=([\w-]+)/.exec(String(value || ''));
  if (!m) return;                       // ảnh cũ nằm trong repo GitHub -> không xóa
  try { DriveApp.getFileById(m[1]).setTrashed(true); } catch (e) { /* bỏ qua */ }
}

/* ------------------------------------------------------------------ */
/*  CÀI ĐẶT BAN ĐẦU – chạy 1 lần từ trình soạn thảo Apps Script       */
/* ------------------------------------------------------------------ */

/** Tạo 3 sheet + tiêu đề cột (tương đương Config/createtable.php). */
function setup() {
  var ss = getSpreadsheet_();
  Object.keys(TABLES).forEach(function (name) {
    var table = TABLES[name];
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    sh.getRange(1, 1, 1, table.cols.length).setValues([table.cols]).setFontWeight('bold')
      .setBackground('#8b0000').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    // Định dạng văn bản thuần cho toàn bộ cột: giữ số 0 đầu của SĐT/MSSV, không biến chuỗi thành công thức/ngày
    sh.getRange(1, 1, sh.getMaxRows(), table.cols.length).setNumberFormat('@');
  });
  Logger.log('Đã tạo xong sheet: ' + Object.keys(TABLES).join(', '));
  Logger.log('Tiếp theo: vào Project Settings > Script properties, thêm ADMIN_PASSWORD.');
}

/** (Tuỳ chọn) Thêm dữ liệu mẫu – tương đương Config/inputdata.php. */
function seedSample() {
  var ss = getSpreadsheet_();
  var sample = {
    sinhvien: [
      ['1', '12345678901', 'image1.jpg', 'Nguyen Van A', 'Chia sẻ về cuộc sống sinh viên và học tập'],
      ['2', '12345678902', 'image2.jpg', 'Tran Thi B', 'Chia sẻ về các hoạt động ngoại khóa và kinh nghiệm làm việc'],
      ['3', '12345678903', 'image3.jpg', 'Le Minh C', 'Chia sẻ về các dự án nghiên cứu và sáng tạo trong học tập']
    ],
    btc: [
      ['1', '12345678901', 'btc_image1.jpg', 'Nguyen Thi D', 'Chủ tịch', 'Trưởng ban tổ chức', '0123456789', 'nguyen.d@example.com', 'Chia sẻ về các chương trình tình nguyện và phát triển cộng đồng', 'EVT001'],
      ['2', '12345678902', 'btc_image2.jpg', 'Tran Thi E', 'Phó chủ tịch', 'Trưởng ban tài chính', '0123456790', 'tran.e@example.com', 'Chia sẻ về các kế hoạch tài chính và quản lý quỹ', 'EVT002']
    ],
    anhhung: [
      ['1', 'anhhung_image1.jpg', 'Nguyen Thi G', '2025-04-10', 'Hà Nội', 'Giải nhất cuộc thi khoa học', 'Công trình nghiên cứu về sinh học tế bào'],
      ['2', 'anhhung_image2.jpg', 'Tran Minh H', '2025-04-12', 'TP.HCM', 'Giải nhì cuộc thi viết sáng tạo', 'Dự án về phát triển ứng dụng di động cho sinh viên']
    ]
  };
  Object.keys(sample).forEach(function (name) {
    var sh = getSheet_(name);
    if (sh.getLastRow() >= 2) return;            // đã có dữ liệu thì không ghi đè
    sh.getRange(2, 1, sample[name].length, sample[name][0].length).setValues(sample[name]);
    clearCache_(name);
  });
}
