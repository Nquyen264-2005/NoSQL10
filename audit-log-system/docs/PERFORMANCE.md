# BÁO CÁO ĐO LƯỜNG HIỆU NĂNG HỆ THỐNG (PERFORMANCE TEST)
## HỆ THỐNG AUDIT LOG - APACHE CASSANDRA WIDE-COLUMN STORE

---

> [!WARNING]
> **TRẠNG THÁI: CASSANDRA OFFLINE (Chưa kết nối được Node)**  
> **Thời điểm kiểm tra:** `2026-10-14T13:03:02.858Z`  
> **Lý do:** Docker Desktop hoặc container `cassandra_audit_node` chưa được khởi động trên máy trạm (`Cassandra client returned false on connection attempt.`).  
> **Cam kết:** Tuân thủ tuyệt đối quy định đồ án: **Không tự ý bịa/fake số liệu khi chưa chạy thực tế.**

---

### HƯỚNG DẪN KHỞI ĐỘNG VÀ CHẠY BENCHMARK THẬT

Để thực hiện đo lường trực tiếp trên node Apache Cassandra và xuất số liệu runtime tự động:

```powershell
# Bước 1: Khởi động container Cassandra (Port 9042)
docker compose up -d

# Bước 2: Chờ node chuyển sang trạng thái UN (Up/Normal)
docker exec -it cassandra_audit_node nodetool status

# Bước 3: Chạy script Benchmark tự động
npm run test:perf
```

---

### DANH MỤC CÁC BÀI TEST CHUẨN BỊ THỰC HIỆN

| Mã Test | Tên Bài Test | Đối tượng / Bảng Cassandra | Mục tiêu đo lường |
| :--- | :--- | :--- | :--- |
| **PT-01** | Insert 100 logs | `audit_logs`, `audit_logs_by_service_level`, `audit_logs_by_id` | Độ trễ ghi đồng thời 3 bảng Wide-Column |
| **PT-02** | Insert 300 logs | `audit_logs`, `audit_logs_by_service_level`, `audit_logs_by_id` | Khả năng duy trì throughput khi tải tăng 3x |
| **PT-03** | Insert 500 logs | `audit_logs`, `audit_logs_by_service_level`, `audit_logs_by_id` | Kiểm tra tính ổn định của Memtable & CommitLog |
| **PT-04** | Query Service + Date | `audit_logs` (Partition Key: `((service_name, log_date))`) | Tốc độ đọc trực tiếp 1 Partition |
| **PT-05** | Query Service + Level + Date | `audit_logs_by_service_level` (Partition Key: `((service_name, level, log_date))`) | Đọc chính xác Partition cấp 2 không FILTERING |
| **PT-06** | Query Time Range | `audit_logs` (Clustering Key slice: `log_time >= ? AND log_time <= ?`) | Tốc độ duyệt dải nhãn thời gian liên tục |

---

### CÁC CHỈ SỐ ĐO LƯỜNG (METRICS)
Mỗi bài test sẽ đo đạc chính xác 7 chỉ số thời gian thực từ runtime:
1. `total_records`: Tổng số bản ghi được xử lý / truy xuất.
2. `success_count`: Số thao tác thành công.
3. `failed_count`: Số thao tác thất bại.
4. `total_duration_ms`: Tổng thời gian thực thi (milliseconds).
5. `average_ms`: Thời gian trung bình mỗi thao tác (ms).
6. `min_ms`: Thời gian phản hồi nhanh nhất (ms).
7. `max_ms`: Thời gian phản hồi chậm nhất (ms).
