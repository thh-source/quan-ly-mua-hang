-- Chạy một lần nếu bản thử nghiệm cũ đã từng lưu dữ liệu giả lập vào D1.
-- Không chạy lại sau khi hệ thống đã có dữ liệu thật.
DELETE FROM app_state WHERE id = 'procurement';
DELETE FROM audit_logs;
