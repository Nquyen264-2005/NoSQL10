# HỆ THỐNG GIÁM SÁT AUDIT LOG VÀ LỊCH SỬ THAO TÁC HỆ THỐNG
> **ĐỒ ÁN MÔN CƠ SỞ DỮ LIỆU NOSQL**  
> **Cơ sở dữ liệu chính:** Apache Cassandra (Wide Column / Column Family Database)  
> **Kiến trúc:** Frontend Dashboard (React + Vite) &harr; REST API Backend (Express + TypeScript) &harr; Apache Cassandra

---

## 1. GIỚI THIỆU TỔNG QUAN

Hệ thống được thiết kế theo tiêu chuẩn Enterprise Monitoring cho các hệ thống vi dịch vụ (Microservices), giải quyết bài toán ghi nhận nhật ký thao tác (Audit Trail) với tải ghi cực lớn và truy vấn độ trễ thấp thông qua mô hình **Query-First Data Modeling** của Apache Cassandra:
- **Cơ sở dữ liệu chính:** Apache Cassandra 4.1. Tuyệt đối không sử dụng MySQL, PostgreSQL, MongoDB hay dữ liệu mock.
- **Backend:** Node.js, Express, TypeScript, `cassandra-driver`, Zod validation, JWT Authentication.
- **Frontend Dashboard:** React 18, Vite, TypeScript, Tailwind CSS, Lucide Icons, Recharts.
- **Cơ chế ghi kép (Dual-Write):** Ghi đồng thời vào 2 bảng wide-column với cùng `log_id` và timestamp.
- **Không dùng `ALLOW FILTERING`** cho các nghiệp vụ chính nhờ thiết kế đúng Partition Key.
- **Cassandra Native TTL:** Tự động thu hồi và tiêu hủy dữ liệu log tạm sau 30 giây mà không cần cronjob.

---

## 2. KIẾN TRÚC VÀ CASSANDRA DATA MODEL

```
    [ Frontend Web Dashboard ]
       (React + Vite + Tailwind)
                |
                v (REST API / JSON)
     [ Backend REST Service ]
    (Express + TypeScript + Zod)
                |
                v (Cassandra CQL Native Protocol :9042)
  [ Apache Cassandra Wide-Column DB ]
      (Keyspace: audit_log_system)
        ├── audit_logs ((service_name, log_date), log_time, log_id)
        ├── audit_logs_by_service_level ((service_name, level, log_date), log_time, log_id)
        └── services (service_id UUID PRIMARY KEY, idx_services_name)
```

### Bảng 1: `audit_logs` (Truy vấn theo Service + Date + Time Range)
```sql
CREATE TABLE audit_log_system.audit_logs (
    service_name text,
    log_date date,
    log_time timestamp,
    log_id uuid,
    level text,
    action text,
    user_id text,
    ip_address text,
    message text,
    details text,
    PRIMARY KEY ((service_name, log_date), log_time, log_id)
) WITH CLUSTERING ORDER BY (log_time DESC, log_id ASC);
```

### Bảng 2: `audit_logs_by_service_level` (Truy vấn theo Service + Level + Date)
```sql
CREATE TABLE audit_log_system.audit_logs_by_service_level (
    service_name text,
    level text,
    log_date date,
    log_time timestamp,
    log_id uuid,
    action text,
    user_id text,
    ip_address text,
    message text,
    details text,
    PRIMARY KEY ((service_name, level, log_date), log_time, log_id)
) WITH CLUSTERING ORDER BY (log_time DESC, log_id ASC);
```

### Bảng 3: `services` (Danh mục Microservices)
```sql
CREATE TABLE audit_log_system.services (
    service_id uuid,
    service_name text,
    description text,
    status boolean,
    created_at timestamp,
    updated_at timestamp,
    PRIMARY KEY (service_id)
);
CREATE INDEX idx_services_name ON audit_log_system.services (service_name);
```

---

## 3. CÁC THÔNG TIN TRUY CẬP VÀ DEMO

| Thành Phần | Địa Chỉ / Tài Khoản | Ghi Chú |
|:---|:---|:---|
| **Frontend Web** | `http://localhost:5173` | Giao diện Dashboard quản trị |
| **Backend API** | `http://localhost:5000` | REST API |
| **API Healthcheck** | `http://localhost:5000/api/health` | Kiểm tra tình trạng kết nối Cassandra |
| **Tài khoản Admin Demo** | Username: `admin`<br>Password: `admin123` | Cấu hình tại `.env` |
| **Cassandra Node** | `127.0.0.1:9042` | Cổng CQL Native Transport |

---

## 4. HƯỚNG DẪN CÀI ĐẶT VÀ KHỞI CHẠY TỪ ĐẦU TRÊN WINDOWS

### Yêu cầu tiên quyết:
- **Windows 10/11** có cài đặt **Docker Desktop** (WSL 2 backend).
- **Node.js** phiên bản 18+ (Đã kiểm thử trên Node v24).

---

### BƯỚC 1: Khởi động Docker Desktop và Cụm Cassandra

Mở **PowerShell** tại thư mục dự án:
```powershell
cd d:\NoSQL10\audit-log-system

# Khởi chạy container Apache Cassandra ở chế độ chạy nền
docker compose up -d
```

Kiểm tra container đang chạy:
```powershell
docker ps
```
*Kết quả:* Container `cassandra_audit_node` hiển thị trạng thái `Up (healthy)`.

---

### BƯỚC 2: Kiểm tra trạng thái Node với `nodetool status`

Chạy lệnh kiểm tra ring phân tán của Cassandra:
```powershell
docker exec -it cassandra_audit_node nodetool status
```

**Giải thích kết quả:**
```text
Datacenter: datacenter1
=======================
Status=Up/Down
|/ State=Normal/Leaving/Joining/Moving
--  Address     Load       Tokens  Owns (effective)  Host ID                               Rack 
UN  172.19.0.2  104.36 KiB 16      100.0%            af354382-22d8-427d-9e8d-4be776791b45 rack1
```
- **`U` (Up):** Node đang hoạt động, tiến trình lắng nghe kết nối CQL bình thường.
- **`N` (Normal):** Node đang ở trạng thái vận hành chuẩn.
- **`UN` = Up / Normal.**

---

### BƯỚC 3: Khởi tạo CSDL qua CQLSH (Nếu chưa chạy tự động)

Bạn có thể mở giao diện dòng lệnh tương tác CQLSH:
```powershell
docker exec -it cassandra_audit_node cqlsh
```
Hoặc nạp toàn bộ các file CQL đã chuẩn bị sẵn:
```powershell
Get-Content database\01_keyspace.cql | docker exec -i cassandra_audit_node cqlsh
Get-Content database\02_tables.cql | docker exec -i cassandra_audit_node cqlsh
Get-Content database\03_seed_services.cql | docker exec -i cassandra_audit_node cqlsh
```

---

### BƯỚC 4: Cài đặt và Chạy Backend REST API

Mở cửa sổ PowerShell mới:
```powershell
cd d:\NoSQL10\audit-log-system\backend

# Cài đặt thư viện phụ thuộc (chỉ cần chạy lần đầu)
npm install

# Khởi chạy Backend ở chế độ development
npm run dev
```
*Thông báo:*
```text
[Cassandra] Connected successfully to keyspace 'audit_log_system' at 127.0.0.1
[Server] REST API listening on port 5000 -> http://localhost:5000
```

---

### BƯỚC 5: Sinh 400 Dummy Logs Phân Bố Chuẩn

Chạy script sinh 400 bản ghi audit phân bố đều khắp các microservices:
```powershell
cd d:\NoSQL10\audit-log-system\backend
npm run seed:dummy
```
*Phân bố dữ liệu sinh ra:*
- **Auth:** 100 log (70 INFO, 20 WARN, 10 ERROR)
- **User:** 100 log (70 INFO, 20 WARN, 10 ERROR)
- **Order:** 100 log (65 INFO, 20 WARN, 15 ERROR)
- **Payment:** 100 log (60 INFO, 20 WARN, 20 ERROR)
- **Tổng cộng:** 400 logs được ghi kép vào cả 2 bảng wide-column với thời gian phân tán trong ngày.

---

### BƯỚC 6: Chạy Bộ Kiểm Thử (Unit / Integration Tests)

Chạy 24 ca kiểm thử tự động kiểm tra POST, Query-First, Sensitive Data Filter, CRUD Service, Inactive Rejection, TTL:
```powershell
cd d:\NoSQL10\audit-log-system\backend
npm test
```
*Kết quả:* `TEST RESULTS: 24 PASSED, 0 FAILED (100% PASS)`

---

### BƯỚC 7: Đo Đạc Hiệu Năng Thực Tế (Performance Test PT01 - PT06)

Chạy bộ benchmark đo đạc độ trễ và thông lượng thực trên Cassandra:
```powershell
cd d:\NoSQL10\audit-log-system\backend
npm run test:perf
```

---

### BƯỚC 8: Cài đặt và Chạy Frontend Web Dashboard

Mở cửa sổ PowerShell mới:
```powershell
cd d:\NoSQL10\audit-log-system\frontend

# Cài đặt dependencies (chỉ cần chạy lần đầu)
npm install

# Chạy giao diện Vite
npm run dev
```

Mở trình duyệt truy cập: `http://localhost:5173`
- Đăng nhập với: `admin` / `admin123`.

---

## 5. DEMO TTL (TIME-TO-LIVE) 30 GIÂY

### Cách 1: Demo trực quan trên Web
1. Truy cập mục **Demo Operations** (`/demo`).
2. Cuộn xuống phần **Cassandra Native TTL Live Demonstration**.
3. Bấm **[Insert 30s TTL Demo Log]**.
4. Quan sát đồng hồ đếm ngược từ 30s về 0s và trạng thái bản ghi tự động hết hạn.

### Cách 2: Demo trực tiếp trong CQLSH
Chạy script:
```powershell
Get-Content database\05_ttl_demo.cql | docker exec -i cassandra_audit_node cqlsh
```
Sau đó truy vấn quan sát số giây giảm dần với `TTL(message)`:
```sql
SELECT service_name, log_date, log_time, level, action, message, TTL(message)
FROM audit_log_system.audit_logs
WHERE service_name = 'Auth' AND log_date = toDate(now());
```

---

## 6. KỊCH BẢN BẢO VỆ (TÓM TẮT 3 PHẦN)

1. **Phần 1: Thực hiện thao tác nghiệp vụ và chứng minh lưu thật**
   - Vào menu **Demo Operations**, bấm **[Create User]**.
   - Vào **Audit Logs**, thấy dòng `CREATE_USER` mới nhất.
   - Mở terminal chạy `cqlsh`, SELECT trong bảng `audit_logs` để chứng minh Cassandra đã lưu dữ liệu thật với cùng UUID.
2. **Phần 2: Chứng minh TTL 30 giây**
   - Bấm nút **[Insert 30s TTL Demo Log]**.
   - Trong CQLSH, SELECT cột `TTL(message)` chứng minh Cassandra đang đếm ngược số giây còn lại.
   - Chờ hơn 30 giây, SELECT lại chứng minh bản ghi đã tự động biến mất.
3. **Phần 3: Bộ lọc Query-First & nodetool status**
   - Chọn filter: Service = `Payment`, Level = `ERROR`. Bấm **Search Logs**.
   - Chứng minh query lấy từ bảng `audit_logs_by_service_level` mà không cần `ALLOW FILTERING`.
   - Mở terminal gõ: `docker exec -it cassandra_audit_node nodetool status` và giải thích trạng thái **UN (Up / Normal)**.

Xem tài liệu chi tiết tại: [DEMO.md](docs/DEMO.md).

---

## 7. CẤU TRÚC THƯ MỤC DỰ ÁN

```
audit-log-system/
│
├── backend/
│   ├── src/
│   │   ├── config/              # Kết nối Cassandra, biến môi trường
│   │   ├── controllers/         # Logs, Services, Demo, Auth controllers
│   │   ├── routes/              # Express API routing
│   │   ├── services/            # Dual-Write Cassandra engine, Service catalogue
│   │   ├── middleware/          # JWT Auth, Global Error Handler (503 database)
│   │   ├── validators/          # Zod schemas, Level/Action/Time validators
│   │   ├── utils/               # Sensitive data detection (passwords, tokens, CVV)
│   │   └── server.ts            # Entrypoint Backend Express
│   ├── scripts/
│   │   ├── generateDummyData.ts # Sinh 400 log phân bố đều
│   │   └── performanceTest.ts   # Đo đạc hiệu năng PT01 - PT06
│   ├── tests/
│   │   └── runTests.ts          # 24 ca kiểm thử tự động
│   ├── package.json
│   ├── tsconfig.json
│   └── .env
│
├── frontend/
│   ├── src/
│   │   ├── components/          # Sidebar, Header, LevelBadge, LogDetailModal
│   │   ├── layouts/             # MainLayout
│   │   ├── pages/               # Dashboard, AuditLogs, Services, Demo, System, Login
│   │   ├── services/            # Axios API Client
│   │   ├── types/               # TypeScript interfaces
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.ts
│
├── database/
│   ├── 01_keyspace.cql          # Tạo Keyspace SimpleStrategy RF=1
│   ├── 02_tables.cql            # Tạo audit_logs, audit_logs_by_service_level, services
│   ├── 03_seed_services.cql     # Seed 4 microservices: Auth, User, Order, Payment
│   ├── 04_queries.cql           # Các câu lệnh truy vấn mẫu Query-First
│   └── 05_ttl_demo.cql          # Demo cú pháp USING TTL 30 và TTL(message)
│
├── docs/
│   ├── API.md                   # Đặc tả chi tiết REST API
│   ├── DEMO.md                  # Kịch bản bảo vệ từng bước
│   └── TESTING.md               # Báo cáo kết quả kiểm thử & benchmark
│
├── docker-compose.yml           # Khởi chạy node Apache Cassandra
└── README.md
```
