# BANKYTHUAT-WEB — Lửa dệt Sử đỏ (bản Google Apps Script + Google Sheets)

Website tĩnh chạy trên **GitHub Pages**, dữ liệu nằm trong **Google Sheets**, backend là **Google Apps Script**.
Đã thay toàn bộ PHP + MySQL (`Config/*.php`, `admin_solve/*.php`, `vendor/`) bằng:

| Cũ (PHP/MySQL) | Mới |
|---|---|
| `Config/connect.php`, `createtable.php`, `inputdata.php` | `apps-script/Code.gs` (`setup()`, `seedSample()`) |
| `admin/admin_solve/*.php` (thêm/sửa/xóa/upload) | API `POST` trong `Code.gs` + `admin/admin_js/admin-crud.js` |
| `admin/admin_view/*.php` | `admin/admin_view/*.html` (cùng giao diện Bootstrap) |
| `<?php while(...) ?>` trong các trang | JS dựng thẻ từ API: `assets/js/api.js` |
| `*.php` (trang công khai) | `*.html` cùng tên |
| `Trang_tin_tuc.php` (PhpWord) | `Trang_tin_tuc.html` (mammoth.js, chạy trên trình duyệt) |
| Ảnh upload vào `assets/img/...` | Ảnh upload lên Google Drive (ảnh cũ trong repo vẫn dùng bình thường) |

## Cài đặt Apps Script (làm 1 lần)

1. Tạo Google Sheet mới → **Tiện ích mở rộng › Apps Script**.
2. Dán nội dung `apps-script/Code.gs` vào `Code.gs`. (Tuỳ chọn: bật *Project Settings › Show appsscript.json* và dán `apps-script/appsscript.json`.)
3. Chọn hàm **`setup`** → Run → cấp quyền. Hàm tạo 3 sheet `sinhvien`, `btc`, `anhhung` với đúng tên cột như bảng MySQL cũ. (Có thể chạy thêm `seedSample` để có dữ liệu mẫu.)
4. **Project Settings › Script properties** → thêm `ADMIN_PASSWORD` = mật khẩu quản trị (đặt dài, khó đoán).
5. **Deploy › New deployment › Web app**: *Execute as: Me*, *Who has access: Anyone* → copy URL `.../exec`.
6. Dán URL vào `assets/js/config.js` (`API_URL`), commit & push.
7. Mở `/admin/admin.html` → vào từng mục, đăng nhập bằng `ADMIN_PASSWORD`.

> Mỗi lần sửa `Code.gs`, phải **Deploy › Manage deployments › Edit › New version** thì thay đổi mới có hiệu lực.

## Chuyển dữ liệu MySQL cũ sang Sheets

Xuất từng bảng ra CSV (phpMyAdmin › Export) rồi dán vào sheet cùng tên (giữ hàng tiêu đề). Lưu ý:
- Cột `*_date` dùng dạng `yyyy-mm-dd`; `0000-00-00` hiển thị là "chưa rõ".
- Cột ảnh có thể giữ nguyên **tên file** (ảnh trong `assets/img/sv|btc|heroes/`) hoặc là URL.
- Các cột `mssv`, `btc_phone` đã được định dạng văn bản để không mất số 0 đầu.

## Cách hoạt động

- `GET  ?action=list&table=anhhung|btc|sinhvien` và `?action=get&table=…&id=…` — công khai, cache 2 phút.
- `POST` (`text/plain`, JSON) với `password` — `login | create | update | delete | upload`. Mật khẩu kiểm tra phía server, khoá tạm sau 10 lần sai/10 phút.
- Dữ liệu cell luôn là văn bản thuần (không công thức) và mọi nội dung hiển thị đều được escape → tránh chèn HTML/công thức.

## ⚠️ Bảo mật — cần làm ngay

- `Config/connect.php` cũ **đã lộ mật khẩu MySQL trong repo công khai** (và còn trong lịch sử git). Hãy **đổi mật khẩu/ thu hồi user DB** đó; nếu muốn xoá khỏi lịch sử dùng `git filter-repo`.
- Bản PHP cũ không có đăng nhập cho `admin/` và dễ bị SQL injection; bản mới yêu cầu mật khẩu và không còn SQL.
- Email/SĐT của BTC vẫn hiển thị công khai trên web như trước (API trả cùng dữ liệu). Nếu không muốn, bỏ cột đó khỏi hàm `list` trong `Code.gs`.

## Ghi chú / giới hạn

- Lần gọi đầu có thể chậm 1–2 giây (Apps Script khởi động); đã cache ở server và `sessionStorage`.
- `js/activities.json` được nhiều trang gọi nhưng **không có trong repo từ trước** (lỗi có sẵn, không ảnh hưởng dữ liệu Sheets).
- Mục "Quỹ Momo" trong admin trỏ tới `admin_data.php` vốn không tồn tại nên đã gỡ khỏi menu.
