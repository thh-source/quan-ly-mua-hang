# WebApp quản lý mua hàng

WebApp quản lý PR, so sánh báo giá, nhà cung cấp, PO, hợp đồng, hàng hóa, hồ sơ và link báo cáo chỉ xem.

## Bắt đầu

Đọc tài liệu tiếng Việt: [HUONG-DAN-TRIEN-KHAI.md](HUONG-DAN-TRIEN-KHAI.md).

## Công nghệ

- Cloudflare Workers
- Cloudflare D1
- Cloudflare R2
- Vinext / React / TypeScript
- Drizzle migrations

## Nguyên tắc dữ liệu

Mã nguồn có thể triển khai lại nhiều lần mà không xóa D1 hoặc R2. Khi thay đổi cấu trúc database, tạo migration mới và sao lưu trước khi áp dụng production.
