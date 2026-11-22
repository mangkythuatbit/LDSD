/**
 * Cấu hình kết nối tới Google Apps Script (thay cho Config/connect.php).
 * Sau khi Deploy > New deployment > Web app, dán URL dạng
 *   https://script.google.com/macros/s/AKfy.../exec
 * vào API_URL bên dưới. URL này KHÔNG chứa bí mật (mật khẩu admin nằm trong Script properties).
 */
window.BIT_CONFIG = {
  API_URL: 'PASTE_WEB_APP_URL_HERE',
  CACHE_SECONDS: 60            // cache phía trình duyệt cho dữ liệu đọc công khai
};
