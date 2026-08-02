# Hướng dẫn triển khai WebApp mua hàng độc lập trên Cloudflare

Tài liệu này ưu tiên cách làm hoàn toàn trên trình duyệt, không cần cài thêm phần mềm vào máy công ty.

## Kết quả sau khi hoàn thành

- Mã nguồn thuộc GitHub của bạn.
- Website chạy trong tài khoản Cloudflare của bạn.
- D1 lưu dữ liệu PR, báo giá, PO, hợp đồng và danh mục.
- R2 lưu Excel, PDF, hóa đơn và hồ sơ.
- Trang quản trị có đăng nhập nội bộ; Master Admin tạo và khóa/mở khóa tài khoản.
- Link `/report/<mã-bảo-mật>` chỉ xem, không sửa dữ liệu.

## Bước 1 — Tạo tài khoản

1. Mở `https://github.com` và tạo tài khoản cá nhân nếu chưa có.
2. Bật xác thực hai bước cho GitHub.
3. Mở `https://dash.cloudflare.com` và tạo tài khoản Cloudflare.
4. Trong Cloudflare, bật xác thực hai bước.
5. Không dùng chung mật khẩu giữa GitHub, Cloudflare và email.

## Bước 2 — Tạo repository GitHub

1. Đăng nhập GitHub.
2. Nhấn dấu `+` góc trên bên phải → **New repository**.
3. Repository name: `quan-ly-mua-hang`.
4. Chọn **Private**.
5. Không chọn tạo README, `.gitignore` hoặc license.
6. Nhấn **Create repository**.
7. Giải nén file `mua-hang-cloudflare.zip` trên máy.
8. Tại trang repository mới, chọn **uploading an existing file**.
9. Kéo toàn bộ nội dung bên trong thư mục `mua-hang-cloudflare` vào trang upload. Không kéo nguyên thư mục cha.
10. Ghi commit message: `Khoi tao WebApp mua hang` → **Commit changes**.

Không đưa lên GitHub các file mật khẩu, token, `.env` hoặc file backup chứa dữ liệu thật.

## Bước 3 — Tạo database D1

1. Đăng nhập Cloudflare Dashboard.
2. Mở **Storage & databases** → **D1 SQL database**.
3. Chọn **Create database**.
4. Database name: `mua-hang-db`.
5. Sau khi tạo, sao chép **Database ID**.
6. Mở GitHub → file `wrangler.jsonc` → biểu tượng bút chì.
7. Thay `THAY_DATABASE_ID_TAI_DAY` bằng Database ID vừa sao chép.
8. Commit thay đổi.
9. Trong trang D1, mở **Console**.
10. Mở file `database/setup.sql` trong GitHub, sao chép toàn bộ SQL và chạy trong D1 Console.
11. Kiểm tra D1 có 6 bảng: `app_state`, `audit_logs`, `files`, `share_links`, `users`, `sessions`.

Nếu database này từng chạy bản thử nghiệm có dữ liệu giả lập, chạy file `database/clear-demo-data.sql` đúng một lần trước khi nhập dữ liệu thật. Không chạy file này trên hệ thống đã có dữ liệu thật.

## Bước 4 — Tạo kho file R2

1. Cloudflare Dashboard → **Storage & databases** → **R2 object storage**.
2. Nếu Cloudflare yêu cầu kích hoạt R2, hoàn thành bước kích hoạt trong tài khoản của bạn.
3. Chọn **Create bucket**.
4. Bucket name: `mua-hang-files`.
5. Giữ bucket ở chế độ riêng tư. Không bật public bucket.
6. Tên bucket phải trùng với `bucket_name` trong `wrangler.jsonc`.

## Bước 5 — Kết nối GitHub và triển khai Worker

1. Cloudflare Dashboard → **Workers & Pages**.
2. Chọn **Create application** hoặc **Import a repository**.
3. Kết nối tài khoản GitHub.
4. Chỉ cấp quyền cho repository `quan-ly-mua-hang` nếu Cloudflare cho phép lựa chọn.
5. Chọn repository vừa tạo.
6. Production branch: `main`.
7. Build command: `npm run build`.
8. Deploy command: `npx wrangler deploy -c dist/server/wrangler.json`.
9. Root directory để trống hoặc `/`.
10. Chọn **Save and Deploy**.
11. Chờ trạng thái thành công và mở URL dạng `https://quan-ly-mua-hang.<ten-cua-ban>.workers.dev`.

Nếu lần build đầu báo không tìm thấy D1, kiểm tra Database ID trong `wrangler.jsonc`. Nếu báo không tìm thấy R2, kiểm tra tên bucket.

## Bước 6 — Cấu hình Master Admin

Mật khẩu Master không nằm trong mã nguồn. Hãy lưu nó bằng biến bí mật được mã hóa của Cloudflare.

1. Cloudflare → **Workers & Pages** → chọn Worker `quan-ly-mua-hang`.
2. Mở **Settings** → **Variables and Secrets**.
3. Kiểm tra biến thường `MASTER_ADMIN_ID` có giá trị `bosmile` (đã khai báo trong `wrangler.jsonc`).
4. Thêm biến `MASTER_ADMIN_PASSWORD`, chọn loại **Secret**, rồi nhập mật khẩu Master bạn đã chọn.
5. Lưu và **Deploy** lại Worker.
6. Mở URL gốc, đăng nhập bằng ID Master và mật khẩu vừa lưu. Lần đăng nhập đúng đầu tiên sẽ tự tạo tài khoản Master trong D1.
7. Vào **Cài đặt** để tạo tài khoản nhân viên gồm ID, tên người dùng, mật khẩu ban đầu và vai trò.
8. Master/Admin có thể khóa hoặc mở khóa tài khoản; không thể khóa tài khoản Master.

Nếu dùng dòng lệnh, có thể đặt secret bằng `npx wrangler secret put MASTER_ADMIN_PASSWORD`. Không ghi mật khẩu vào `wrangler.jsonc`, GitHub hoặc file hướng dẫn.

## Bước 7 — Cho phép link báo cáo chỉ xem

Hai đường dẫn sau được ứng dụng cho phép truy cập công khai bằng mã báo cáo:

- `/report/*`
- `/api/report-state`

Mã báo cáo được tạo từ nút **Tạo link báo cáo** trong trang quản trị, có hạn mặc định 30 ngày. Không chia sẻ URL quản trị cho người ngoài.

## Bước 8 — Kiểm tra bắt buộc

1. Mở cửa sổ trình duyệt ẩn danh và truy cập URL gốc: phải hiện màn hình đăng nhập.
2. Đăng nhập sai ID hoặc mật khẩu: phải bị từ chối.
3. Đăng nhập Master, tạo một tài khoản nhân viên rồi kiểm tra tài khoản đó đăng nhập được.
4. Tạo một PR thử nghiệm, tải lại trang: dữ liệu phải còn.
5. Tải một PDF thử nghiệm: R2 phải xuất hiện object mới.
6. Nhấn **Tạo link báo cáo** và mở bằng trình duyệt ẩn danh: phải xem được đúng 5 tab.
7. Thử thay đổi mã ở cuối link báo cáo: phải hiện “Link báo cáo không hợp lệ”.
8. Trong link báo cáo, thử chỉnh giá hoặc PO: không được phép.

## Bước 9 — Cập nhật WebApp về sau

1. Luôn tạo bản backup D1 trước thay đổi lớn.
2. Cập nhật mã nguồn trên một nhánh GitHub mới.
3. Kiểm tra bản thử nghiệm.
4. Merge vào nhánh `main`.
5. Cloudflare tự build và triển khai phiên bản mới.
6. D1 và R2 giữ nguyên nên dữ liệu không bị mất.

Không xóa D1, R2 hoặc thay binding `DB`/`BUCKET` khi chỉ cập nhật mã nguồn.

## Bước 10 — Sao lưu và phục hồi

### Sao lưu D1 bằng giao diện

Trong D1 Dashboard, sử dụng chức năng export/download nếu tài khoản đang hiển thị chức năng này. Lưu file SQL ở vị trí an toàn, không đưa vào repository.

### Sao lưu bằng dòng lệnh trên máy được phép cài Node.js

```bash
npm install
npx wrangler login
mkdir -p backups
npm run db:backup
```

### Phục hồi

1. Tạo database D1 mới.
2. Import file SQL backup.
3. Thay Database ID trong `wrangler.jsonc`.
4. Triển khai lại Worker.
5. Không ghi đè database production trước khi kiểm tra bản phục hồi.

## Những file quan trọng

- `wrangler.jsonc`: liên kết Worker, D1 và R2.
- `database/setup.sql`: tạo database lần đầu.
- `drizzle/`: lịch sử migration.
- `db/schema.ts`: cấu trúc dữ liệu.
- `app/`: giao diện và API.
- `worker/index.ts`: điểm chạy Cloudflare Worker.

## Quy tắc bảo mật

- GitHub repository phải để **Private**.
- R2 bucket phải để **Private**.
- Không gửi API token qua email hoặc tin nhắn.
- Chỉ tạo tài khoản cho đúng nhân viên cần quyền truy cập.
- Thu hồi tài khoản ngay khi nhân viên nghỉ việc hoặc chuyển bộ phận.
- Tạo backup định kỳ và trước mỗi migration.
