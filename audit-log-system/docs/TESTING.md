# HỆ THỐNG GIÁM SÁT AUDIT LOG - BÁO CÁO THỬ NGHIỆM VÀ ĐO HIỆU NĂNG (TESTING & BENCHMARK)
## CƠ SỞ DỮ LIỆU: APACHE CASSANDRA 4.1 WIDE-COLUMN STORE

---

## 1. TỔNG QUAN CHIẾN LƯỢC KIỂM THỬ

Hệ thống được kiểm thử tự động toàn diện qua 2 bộ công cụ kiểm thử:
1. **Automated Integration & Contract Test Suite** (`backend/tests/runTests.ts`): Kiểm tra tính đúng đắn của logic nghiệp vụ, xác thực dữ liệu nhạy cảm, cơ chế ghi đồng thời 3 bảng, và không sử dụng `ALLOW FILTERING`.
2. **Performance Benchmark Suite** (`backend/scripts/performanceTest.ts`): Đo lường độ trễ (latency), thông lượng (throughput) và tính ổn định của Cassandra từ PT-01 đến PT-06.

---

## 2. KẾT QUẢ KIỂM THỬ TỰ ĐỘNG (INTEGRATION TESTS)

**Câu lệnh thực thi:**
```powershell
cd d:\NoSQL10\audit-log-system
npm run test
```

### Danh mục các ca kiểm thử tích hợp (13 Test Cases):

| STT | Bài Kiểm Thử | Chi Tiết Thực Hiện | Mục Tiêu & Tiêu Chí Đánh Giá | Kết Quả |
| :---: | :--- | :--- | :--- | :---: |
| **01** | **Database Connectivity** | Kết nối trực tiếp vào cụm Cassandra (Port 9042) | Xác nhận Keyspace `audit_log_system` tồn tại và sẵn sàng | **PASS** |
| **02** | **Valid Audit Log Insert** | Ghi log `service_name='Auth'`, `level='INFO'` | Kiểm tra UUID sinh hợp lệ, ghi đồng thời vào các bảng query-first | **PASS** |
| **03** | **Invalid Level Rejection** | Gửi log với `level='DEBUG'`, `'HIGH'`, `'LOW'` | Zod validation chặn và trả về lỗi schema, bảo vệ tính toàn vẹn | **PASS** |
| **04** | **Missing Fields Validation** | Gửi payload thiếu trường `service_name` hoặc `action` | Bị từ chối ngay ở tầng validator, không ghi rác vào Cassandra | **PASS** |
| **05** | **Sensitive Data Masking** | Gửi payload chứa số thẻ tín dụng 16 số, mật khẩu, CVV | Tự động phát hiện và thay thế bằng `***MASKED***` trước khi ghi | **PASS** |
| **06** | **Query Service + Date** | Truy vấn bảng `audit_logs` với `((service_name, log_date))` | Đọc đúng Partition duy nhất, không dùng `ALLOW FILTERING` | **PASS** |
| **07** | **Query Service + Level + Date**| Truy vấn `audit_logs_by_service_level` | Lọc chính xác log theo level trực tiếp từ phân vùng chuyên biệt | **PASS** |
| **08** | **Time Range Validation** | Truy vấn với `from > to` (ví dụ `18:00` đến `08:00`) | Bị chặn bởi Zod superRefine, trả về HTTP 400 Bad Request | **PASS** |
| **09** | **CRUD Service Management** | Tạo, Đọc, Cập nhật và Xóa vi dịch vụ trong bảng `services` | Thao tác CRUD chuẩn xác trên Wide-Column table | **PASS** |
| **10** | **Inactive Service Rejection** | Chuyển service sang `status: false` rồi gửi log vào | Backend từ chối nhận log của service đã bị vô hiệu hóa | **PASS** |
| **11** | **Idempotency & Deduplication**| Gửi 2 bản ghi cùng nội dung trong cửa sổ 10 giây | Hệ thống nhận diện sự kiện trùng lặp, trả về kết quả an toàn | **PASS** |
| **12** | **Cassandra Native TTL Demo** | Ghi bản ghi với `ttl: 30`, gọi `getTtlStatus(log_id)` | Hàm `TTL(message)` của Cassandra trả về số giây đếm ngược chuẩn | **PASS** |
| **13** | **Scatter-Gather Multi-Day** | Truy vấn log trải dài qua 2 ngày khác nhau | Tự động phân rã truy vấn song song các partition và merge-sort | **PASS** |

**Kết luận:** 100% các ca kiểm thử tích hợp vượt qua thành công (**PASS**).

---

## 3. KẾT QUẢ ĐO LƯỜNG HIỆU NĂNG THỜI GIAN THỰC (PERFORMANCE BENCHMARK)

**Câu lệnh thực thi:**
```powershell
npm run test:perf
```

### Các kịch bản đo lường:
- **PT-01: Insert 100 logs** (Đo độ trễ cơ bản của Triple-Write).
- **PT-02: Insert 300 logs** (Đo độ ổn định khi tăng tải gấp 3 lần).
- **PT-03: Insert 500 logs** (Đo thông lượng chịu tải liên tục).
- **PT-04: Query Service + Date** (50 lần truy vấn bảng `audit_logs`).
- **PT-05: Query Service + Level + Date** (50 lần truy vấn bảng `audit_logs_by_service_level`).
- **PT-06: Query Time Range** (50 lần truy vấn lát cắt thời gian theo Clustering Key).

### Báo cáo và Lưu trữ số liệu:
- Toàn bộ kết quả benchmark thời gian thực từ runtime được tự động lưu vào 2 file:
  - [`docs/performance-results.json`](file:///d:/NoSQL10/audit-log-system/docs/performance-results.json)
  - [`docs/PERFORMANCE.md`](file:///d:/NoSQL10/audit-log-system/docs/PERFORMANCE.md)
- **Quy tắc bảo vệ đồ án:** Nếu node Cassandra chưa khởi động, script sẽ báo cáo trạng thái `CASSANDRA_OFFLINE` kèm hướng dẫn bật Docker; **tuyệt đối không bao giờ tạo số liệu giả lập**.

---

## 4. HƯỚNG DẪN TỰ ĐỘNG CHẠY KIỂM THỬ TRÊN WINDOWS POWERSHELL

```powershell
# Chạy toàn bộ kiểm thử tích hợp (Integration Tests)
npm run test

# Chạy bài đo lường hiệu năng thời gian thực (Performance Tests)
npm run test:perf

# Chạy demo tự động kiểm tra tính năng TTL 30 giây
npm run demo:ttl
```
