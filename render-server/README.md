# Máy dựng video YOHU (FFmpeg)

Làm đúng một việc: nhận video + voice + kịch bản + nhạc, trả về **1 file MP4 1080p hoàn chỉnh**
(ghép cảnh, cắt theo voice, phụ đề, nhạc nền tự hạ khi có voice). Miễn phí, không gọi API trả phí.

## Chạy trên máy cá nhân
1. Cài Node.js bản LTS (https://nodejs.org) nếu chưa có.
2. Windows: bấm đúp `start-engine.bat`. Mac/Linux: `./start-engine.sh`.
   Lần đầu tự cài (vài phút). Khi thấy "MÁY DỰNG VIDEO YOHU ĐANG CHẠY" là xong.
3. Giữ cửa sổ đó mở, vào web, mục DỰNG VIDEO TỰ ĐỘNG sẽ hiện **⚡ Máy dựng: sẵn sàng**.
   Dùng Chrome hoặc Edge; nếu trình duyệt hỏi quyền truy cập thiết bị cục bộ thì chọn Cho phép.

Không bật máy dựng thì web vẫn dựng được bằng trình duyệt (chậm hơn, phải giữ tab mở).

## Chuyển lên VPS sau này
Chép cả thư mục `render-server/` và thư mục `shared/` (cùng cấp) lên VPS, rồi:
```
cd render-server && npm install --omit=dev
HOST=0.0.0.0 PORT=5055 RENDER_TOKEN=<mã-bí-mật> ALLOWED_ORIGINS=https://ten-mien-cua-ban.com npm start
```
Đặt sau HTTPS (Caddy/nginx). Trên web, trỏ tới máy dựng bằng biến `VITE_RENDER_SERVER_URL`
(hoặc `localStorage.yohu_render_server_url`). Lưu ý: biến `VITE_*` nằm trong mã web nên ai cũng đọc được;
`RENDER_TOKEN` chỉ chặn người lạ ngẫu nhiên, muốn bán dịch vụ thì cần xác thực theo tài khoản.

## Biến môi trường (tùy chọn)
`PORT` (5055) · `HOST` (127.0.0.1) · `RENDER_TOKEN` · `ALLOWED_ORIGINS` (phân tách bằng dấu phẩy)
· `RENDER_WORK_DIR` · `RENDER_PRESET` (veryfast; đổi `medium` để nhỏ file hơn, chậm hơn) · `RENDER_CRF` (20)
· `RENDER_CONCURRENCY` (1) · `RENDER_KEEP_MINUTES` (120) · `FFMPEG_PATH` / `FFPROBE_PATH`.

## Kiểm thử
`npm test` (trong thư mục này) dựng phim thật từ video mẫu và đo: độ phân giải, số khung hình,
MP4 faststart, nhạc giảm khi có voice, file hỏng, hủy tác vụ, và chạy code giao diện với máy dựng thật.

## Tính năng bổ sung
- **Cảnh làm từ ảnh** (jpg/png/webp): ảnh tự được đặt vừa khung và zoom nhẹ; dài theo voice, không có voice thì 4 giây.
- **Nhạc nền tự tạo** (nhẹ nhàng / ấm áp / điện ảnh / sôi động): máy dựng tự tổng hợp bằng FFmpeg, không bản quyền,
  không cần tải gì. Lần đầu mỗi phong cách mất vài giây, sau đó dùng lại từ bộ nhớ đệm (`RENDER_CACHE_DIR`).
  Nếu người dùng tải nhạc riêng thì dùng nhạc riêng.
