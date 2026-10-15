# KIẾN TRÚC THIẾT KẾ DỮ LIỆU APACHE CASSANDRA (NO-SQL ARCHITECTURAL DESIGN)

**Dự án:** Hệ thống Giám sát & Quản trị Audit Log Microservices  
**Vai trò:** Apache Cassandra Data Architect  
**Cơ sở dữ liệu:** Apache Cassandra 4.1 (Wide-Column / Column Family Store)  
**Tài liệu kỹ thuật:** Phân tích mô hình hóa dữ liệu Query-First, cấu trúc Partition Key, Clustering Key, Denormalization, TTL và Benchmark hiệu năng.

---

## 1. TẠI SAO APACHE CASSANDRA PHÙ HỢP CHO AUDIT LOG? (VÌ SAO KHÔNG DÙNG RDBMS?)

Một sai lầm phổ biến của sinh viên khi làm môn NoSQL là lấy cơ sở dữ liệu quan hệ (MySQL/PostgreSQL) rồi "đổi tên" sang NoSQL, thiết kế bảng theo chuẩn 3NF và dùng câu lệnh truy vấn quét toàn bộ bảng. 

Hệ thống **Audit Log** trong môi trường doanh nghiệp có các đặc thù công việc (workload characteristics) rất đặc biệt:
1. **Tỷ lệ Ghi vượt trội (Write-Heavy):** Trong hệ thống Microservices, mỗi giây có thể phát sinh hàng chục nghìn thao tác người dùng, thanh toán, xác thực. Hệ thống chỉ GHI (Append-only) mà hầu như KHÔNG BAO GIỜ SỬA (Update) hoặc XOÁ (Delete) từng dòng riêng lẻ.
2. **Không có cập nhật (Immutable Data):** Dữ liệu kiểm toán một khi đã ghi xuống là bất biến (tamper-evident).
3. **Mở rộng tuyến tính (Linear Scalability):** Dữ liệu tăng liên tục theo thời gian (vài gigabyte đến hàng terabyte mỗi tháng).

### So sánh Kiến trúc Write Path: Cassandra vs RDBMS

```
[ RDBMS (B-Tree Index) ]
Client Write ---> Buffer Pool ---> Write-Ahead Log (WAL)
                         |
                   Random Disk I/O (B-Tree Rebalancing & Locking) 
                   ---> Nút thắt cổ chai khi ghi tải cao!

[ APACHE CASSANDRA (LSM-Tree) ]
Client Write ---> 1. CommitLog (Append-only sequential disk write - Không random seek)
             ---> 2. Memtable  (In-memory skip list write trên RAM)
                   |
             (Flush định kỳ khi Memtable đầy)
                   v
             3. Immutable SSTables on Disk (Không lock, không random seek)
```

- **RDBMS (B-Tree):** Khi ghi, RDBMS phải tìm đúng vị trí trên đĩa để chèn dòng dữ liệu và cân bằng lại cây B-Tree. Khi dữ liệu lên đến hàng chục triệu dòng, việc rebalance B-Tree gây phân mảnh và khóa đĩa nghiêm trọng (Random I/O).
- **Cassandra (LSM-Tree):** Sử dụng cơ chế ghi **Append-only** vào `CommitLog` và `Memtable`. Thao tác ghi hoàn tất ngay trên bộ nhớ mà không cần chạm ngẫu nhiên vào đĩa, cho tốc độ ghi cực đại hàng trăm nghìn log/giây trên cụm phân tán mà RDBMS không thể đạt được.

---

## 2. NGUYÊN TẮC THIẾT KẾ QUERY-FIRST (QUERY-DRIVEN DATA MODELING)

Trong Apache Cassandra, **chúng ta KHÔNG thiết kế bảng dựa trên thực thể quan hệ (Entities & Relationships)**. Chúng ta **thiết kế bảng dựa trên CÁC CÂU TRUY VẤN CẦN PHỤC VỤ (Access Patterns First)**.

| Tiêu chí | Cơ sở dữ liệu Quan hệ (SQL / RDBMS) | Apache Cassandra (Wide-Column NoSQL) |
|---|---|---|
| **Điểm khởi đầu** | Phân tích Thực thể -> ERD -> Chuẩn hóa 3NF | Phân tích Câu truy vấn (Application Access Patterns) |
| **Cấu trúc bảng** | Mỗi bảng đại diện 1 thực thể; hạn chế trùng lặp | Một bảng đại diện 1 mẫu truy vấn; chấp nhận trùng lặp dữ liệu |
| **Phép JOIN** | Dùng `JOIN` kết hợp nhiều bảng khi đọc | **TUYỆT ĐỐI KHÔNG CÓ JOIN**. Mọi dữ liệu cần hiển thị phải nhúng sẵn vào dòng |
| **Chi phí tối ưu** | Tối ưu dung lượng ổ đĩa (Disk is expensive) | Tối ưu thời gian đọc/ghi qua mạng (Network & CPU are expensive) |
| **Phân tán dữ liệu** | Đơn node (hoặc Master-Slave phức tạp) | Cụm P2P phân tán, băm token phân vùng (Murmur3Partitioner) |

---

## 3. PHÂN TÍCH CHI TIẾT PARTITION KEY VÀ CLUSTERING KEY

### 3.1. Bảng 1: `audit_logs` (Truy vấn theo Service + Ngày + Khoảng giờ)

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

#### A. Tại sao Partition Key là Composite `((service_name, log_date))`?
- **Nếu chỉ dùng `service_name` làm Partition Key:**
  - *Hậu quả (Anti-pattern):* Theo thời gian, toàn bộ log của dịch vụ `Payment` từ năm này qua năm khác sẽ đổ dồn vào **MỘT PARTITION DUY NHẤT**.
  - Partition này sẽ phình to lên hàng chục Gigabyte, vượt quá ngưỡng an toàn của Cassandra (**Khuyến cáo: Partition < 100MB và < 100,000 cells**).
  - Khi partition quá lớn, việc Compaction sẽ gây tràn bộ nhớ JVM (Garbage Collection pauses), và node chứa partition đó sẽ trở thành "Hot Spot" làm quá tải một máy tính trong cụm.
- **Kỹ thuật Date Bucketing `(service_name, log_date)`:**
  - Chia nhỏ partition theo từng ngày dương lịch.
  - Ví dụ: Một dịch vụ phát sinh 20,000 logs/ngày $\times$ 500 bytes/log $\approx$ **10 MB/partition**. Kích thước này là **kích thước vàng (sweet spot)** giúp Cassandra nạp và đọc SSTable với hiệu suất tối ưu nhất.
  - Bộ băm `Murmur3Partitioner` sẽ tính `hash((service_name, log_date))` để định vị chính xác máy chủ nào trong cụm vòng tròn (Ring) đang giữ dữ liệu.

#### B. Tại sao Clustering Key là `(log_time DESC, log_id ASC)`?
- **`log_time DESC`:**
  - Trong một partition, Cassandra sắp xếp vật lý các hàng trên ổ đĩa (SSTable) theo thứ tự giảm dần của thời gian.
  - Khi người quản trị mở trang web xem nhật ký, họ luôn muốn xem **log mới nhất trước**. Vì dữ liệu đã được xếp sẵn trên đĩa, Cassandra chỉ việc đọc tuần tự hàng đầu tiên (Sequential Read) mà **KHÔNG CẦN TỐN CPU/RAM ĐỂ CHẠY HÀM SORT TRÊN BỘ NHỚ**.
  - Hỗ trợ câu truy vấn cắt lát thời gian (Time-range slice query):
    ```sql
    WHERE service_name = 'Payment' AND log_date = '2026-10-14'
      AND log_time >= '2026-10-14 08:00:00+0000' 
      AND log_time <= '2026-10-14 18:00:00+0000';
    ```
- **Tại sao bắt buộc phải có `log_id ASC` ở cuối Clustering Key? (Bẫy trùng lặp Timestamp)**:
  - Trong hệ thống phân tán chịu tải cao, hai microservice hoặc hai luồng có thể sinh ra log vào **chính xác cùng một mili-giây** (`log_time` trùng nhau hoàn toàn).
  - Trong Cassandra, định danh duy nhất của một hàng trong partition chính là Clustering Key.
  - **Nếu không có `log_id` trong Clustering Key:** Khi bản ghi thứ hai có cùng `log_time` được ghi xuống, Cassandra sẽ coi đây là hành động **UPSERT** và **GHI ĐÈ LÊN BẢN GHI ĐẦU TIÊN**, làm mất dữ liệu kiểm toán!
  - Việc đưa `log_id uuid` vào Clustering Key đảm bảo 100% tính duy nhất và bảo toàn toàn bộ sự kiện.

---

### 3.2. Bảng 2: `audit_logs_by_service_level` (Truy vấn Service + Severity Level + Ngày)

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

#### Tại sao không dùng bảng `audit_logs` rồi `WHERE level = 'ERROR'`?
- Nếu dùng bảng `audit_logs` để lọc `level = 'ERROR'`, câu lệnh CQL bắt buộc phải dùng `ALLOW FILTERING`:
  ```sql
  -- CÂU LỆNH NGUY HIỂM TRONG CASSANDRA:
  SELECT * FROM audit_logs 
  WHERE service_name = 'Payment' AND log_date = '2026-10-14' AND level = 'ERROR' 
  ALLOW FILTERING;
  ```
- Khi chạy lệnh trên, node điều phối (coordinator) phải đọc toàn bộ hàng chục nghìn log trong partition ra bộ nhớ, sau đó duyệt từng dòng để lọc lấy chữ `'ERROR'`, vứt bỏ các dòng `'INFO'`.
- **Giải pháp Query-First:** Tạo bảng riêng `audit_logs_by_service_level` với Partition Key là `((service_name, level, log_date))`.
  - Toàn bộ log lỗi của dịch vụ `Payment` ngày hôm nay nằm gọn trong partition `('Payment', 'ERROR', '2026-10-14')`.
  - Truy vấn trỏ thẳng tới partition đích thông qua hàm băm Murmur3Partitioner, không quét toàn bảng và không lọc bỏ bất kỳ dòng nào.

---

### 3.3. Bảng 3: `audit_logs_by_id` (Truy vấn chi tiết theo UUID)

```sql
CREATE TABLE audit_log_system.audit_logs_by_id (
    log_id uuid,
    service_name text,
    log_date date,
    log_time timestamp,
    level text,
    action text,
    user_id text,
    ip_address text,
    message text,
    details text,
    PRIMARY KEY (log_id)
);
```

- Phục vụ API RESTful: `GET /api/logs/:id`.
- Khi người dùng hoặc hệ thống bên thứ ba chỉ có `log_id` (ví dụ từ thông báo lỗi trên ứng dụng mobile), họ không biết log đó thuộc service nào hay ngày nào.
- Nếu không có bảng này, Cassandra sẽ phải quét toàn bộ các node trong cluster để tìm `log_id` (Full-cluster scan).
- Bảng này biến thao tác tìm kiếm theo ID thành phép tìm kiếm điểm (**Direct Point Lookup**) định tuyến trực tiếp qua token của UUID thay vì quét toàn cụm.

---

### 3.4. Bảng 4: `services` (Danh mục dịch vụ & Secondary Index)

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

CREATE INDEX IF NOT EXISTS idx_services_name ON audit_log_system.services (service_name);
```

#### Lưu ý của Data Architect về Secondary Index trong Cassandra:
- **Trong Cassandra, Secondary Index là một con dao hai lưỡi.** Trên các bảng dữ liệu lớn (như bảng chứa hàng triệu audit log), Secondary Index phân tán sẽ gửi truy vấn đến tất cả các node trong ring, phá vỡ kiến trúc băm token.
- **Tuy nhiên, đối với bảng `services`:** Đây là bảng danh mục hệ thống (Metadata table) chỉ có vài chục microservice (< 100 dòng). Việc đặt Secondary Index trên `service_name` tại bảng nhỏ này hoàn toàn an toàn và tiện lợi cho việc kiểm tra trùng tên khi đăng ký dịch vụ mới.

---

## 4. CHIẾN LƯỢC PHI CHUẨN HOÁ (DENORMALIZATION) VÀ DUAL/TRIPLE WRITE

Một câu hỏi kinh điển khi bảo vệ đồ án NoSQL:  
*"Tại sao cùng một sự kiện audit log mà bạn lại lưu ở cả 3 bảng `audit_logs`, `audit_logs_by_service_level` và `audit_logs_by_id`? Như vậy có lãng phí dữ liệu không?"*

### Câu trả lời chuẩn mực của Cassandra Data Architect:
1. **Quy luật Đánh đổi (Trade-off):** Trong hệ thống dữ liệu lớn, **ổ đĩa cứng có giá rất rẻ, nhưng độ trễ mạng (Network latency) và thời gian CPU quét dữ liệu là cực kỳ đắt đỏ**. 
2. **Không có JOIN:** Cassandra không hỗ trợ phép kết (JOIN) giữa các bảng. Để đạt tốc độ phản hồi sub-millisecond (< 5ms) cho mọi truy vấn, dữ liệu phải được chuẩn bị sẵn dưới dạng đã phi chuẩn hoá (Pre-materialized views).
3. **Cơ chế Dual/Triple Write ở Backend:**
   - Khi nhận một audit log từ API `POST /api/logs`, backend tạo ra **chính xác một `log_id` (UUID)** và cùng một mốc thời gian `log_time`.
   - Backend sử dụng `Promise.all` bắn song song câu lệnh `INSERT` tới 3 bảng với cùng thông tin:
     ```typescript
     const writePromises = [
       client.execute(queryMainLog, paramsMain, { prepare: true }),
       client.execute(queryByLevel, paramsLevel, { prepare: true }),
       client.execute(queryById, paramsId, { prepare: true }),
     ];
     await Promise.all(writePromises);
     ```
   - Nhờ đó, tính nhất quán về định danh được đảm bảo trên toàn bộ các bảng truy vấn.

---

## 5. TẠI SAO TUYỆT ĐỐI TRÁNH `ALLOW FILTERING`?

`ALLOW FILTERING` là cờ cho phép Cassandra thực thi những câu truy vấn mà nó không dám đảm bảo về mặt hiệu năng.

### Nguy cơ khi sử dụng `ALLOW FILTERING` trong môi trường thực tế:
1. **Full Partition / Ring Scan:** Node điều phối không thể dựa vào token băm để gửi truy vấn đến đúng máy chủ, mà phải gửi broadcast đến toàn bộ các máy chủ trong cụm.
2. **Nghẽn mạng và tràn RAM (Out of Memory):** Dữ liệu không khớp vẫn bị nạp từ ổ đĩa lên bộ nhớ RAM rồi mới lọc bỏ. Nếu bảng có 10 triệu dòng và chỉ có 5 dòng khớp, Cassandra vẫn phải đọc và kiểm tra 10 triệu dòng!
3. **Read Timeout:** Trình duyệt hoặc client sẽ nhận mã lỗi 504 Gateway Timeout hoặc RPC Timeout từ Cassandra driver.

> **Chứng nhận Kiến trúc của Project hiện tại:**  
> Toàn bộ các truy vấn chính trên giao diện (Lọc Service, Lọc Service + Level, Cắt lát giờ trong ngày, Xem chi tiết Log ID) **100% KHÔNG SỬ DỤNG ALLOW FILTERING**. Mọi truy vấn đều sử dụng khóa phân vùng chính xác.

---

## 6. CƠ CHẾ HOẠT ĐỘNG CỦA CASSANDRA NATIVE TTL (TIME-TO-LIVE)

Trong các hệ thống dùng SQL truyền thống, để xoá dữ liệu cũ sau 30 ngày, lập trình viên thường phải viết script Cron Job chạy lệnh `DELETE FROM logs WHERE created_at < NOW() - INTERVAL 30 DAY;`.

### Vấn đề chết người của lệnh `DELETE` trong Cassandra:
- Trong Cassandra, lệnh `DELETE` **không thực sự xoá dữ liệu ngay lập tức trên đĩa**.
- Thay vào đó, nó ghi xuống một điểm đánh dấu gọi là **Tombstone** (Bia mộ).
- Nếu quét qua hàng triệu Tombstones chưa được dọn dẹp, truy vấn đọc sẽ bị treo (Read failure: `Scanned over 100000 tombstones`).

### Giải pháp tối ưu: Cassandra Native TTL:
Cassandra hỗ trợ mệnh đề `USING TTL <seconds>` ngay trong câu lệnh `INSERT`:
```sql
INSERT INTO audit_log_system.audit_logs (
    service_name, log_date, log_time, log_id, level, action, message
) VALUES (
    'Auth', '2026-10-14', toTimestamp(now()), uuid(), 'WARN', 'LOGIN_FAILED', 'Bad pass'
) USING TTL 30;
```

#### Vòng đời dữ liệu dưới góc nhìn SSTable:
1. Khi ghi bản ghi với `TTL 30`, Cassandra lưu thêm 2 trường metadata nhỏ vào cell:
   - `TTL`: Thời gian sống ban đầu (30 giây).
   - `Local Deletion Time`: Mốc thời gian Unix timestamp mà bản ghi này chính thức hết hạn.
2. **Không cần chạy Cron Job:** Khi ứng dụng đọc dữ liệu sau giây thứ 31, Cassandra tự động ẩn bản ghi này đi. Hàm `TTL(column_name)` cho phép xem thời gian đếm ngược còn lại.
3. **Tự động thu hồi đĩa:** Khi tiến trình **Compaction** chạy ngầm (gộp các file SSTables cũ thành file mới), Cassandra phát hiện `Local Deletion Time < Current Time` và loại bỏ hoàn toàn dòng đó khỏi file SSTable mới mà không để lại rác Tombstone.

---

## 7. MÔ HÌNH TRUY VẤN ĐA NGÀY (MULTI-DAY SCATTER-GATHER)

Một vấn đề cốt lõi của môn NoSQL:  
*"Làm thế nào để lấy log trong khoảng từ ngày 12 đến ngày 14?"*

Trong SQL: `WHERE log_date >= '2026-10-12' AND log_date <= '2026-10-14'`.  
**Trong Cassandra: CÂU LỆNH TRÊN BỊ TỪ CHỐI** vì `log_date` nằm trong Partition Key. Các ngày khác nhau sẽ bị băm ra các token khác nhau và nằm ở các node máy chủ khác nhau!

### Giải pháp Kiến trúc chuẩn của Cassandra Data Architect:
Hệ thống hiện tại triển khai mô hình **Application-Level Scatter-Gather**:
1. Phía Backend tự động tính toán danh sách các ngày cụ thể: `['2026-10-12', '2026-10-13', '2026-10-14']`.
2. Bắn song song $N$ truy vấn độc lập (mỗi truy vấn trỏ đúng vào 1 Partition Key của ngày đó):
   ```typescript
   const partitionPromises = dates.map((d) =>
     this.querySingleDay({ ...filter, date: d, limit })
   );
   const results = await Promise.all(partitionPromises);
   ```
3. Gom kết quả (flatten) và sắp xếp lại theo `log_time DESC` ở tầng ứng dụng trước khi trả về Frontend.
4. Cách làm này vừa tuân thủ đúng phân vùng Cassandra, vừa không gây nghẽn node coordinator.

---

## 8. CHIẾN LƯỢC NHÂN BẢN (REPLICATION) VÀ MỨC NHẤT QUÁN (CONSISTENCY LEVEL)

### 8.1. Replication Strategy
- **Môi trường Demo / Phát triển (Hiện tại):**
  ```sql
  WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 1}
  ```
  Thích hợp cho máy đơn node hoặc Docker desktop cục bộ, không lãng phí tài nguyên RAM.
- **Môi trường Doanh nghiệp (Production Multi-Datacenter):**
  ```sql
  WITH replication = {
      'class': 'NetworkTopologyStrategy',
      'asia-southeast1': 3,
      'us-central1': 3
  }
  ```
  Nhân bản 3 bản sao trên mỗi trung tâm dữ liệu địa lý để dự phòng thảm hoạ (Disaster Recovery).

### 8.2. Tunable Consistency Level
Được cấu hình trong [`backend/src/config/cassandra.ts`](file:///d:/NoSQL10/audit-log-system/backend/src/config/cassandra.ts):
- **Demo Mode:** `ConsistencyLevel.ONE` (Đảm bảo tốc độ phản hồi nhanh nhất và hoạt động tốt trên cụm 1 node).
- **Production Mode:** `ConsistencyLevel.LOCAL_QUORUM`.  
  Theo định lý CAP:
  $$\text{Write Consistency (LOCAL\_QUORUM)} + \text{Read Consistency (LOCAL\_QUORUM)} > \text{Replication Factor (3)}$$
  Đảm bảo tính **Nhất quán mạnh (Strong Consistency)** trong phân vùng mạng mà không cần khóa bảng (Zero locking).

---

## 9. HẠN CHẾ CỦA MÔ HÌNH HIỆN TẠI & HƯỚNG MỞ RỘNG (TRADE-OFFS)

Không có kiến trúc nào là hoàn hảo tuyệt đối; mọi kiến trúc phân tán đều là sự cân bằng đánh đổi:

1. **Dung lượng đĩa (Storage Overhead):**
   - Do lưu song song ở 3 bảng (`audit_logs`, `audit_logs_by_service_level`, `audit_logs_by_id`), dung lượng ổ cứng tăng x2.5 lần so với RDBMS. Tuy nhiên, trong thời đại ổ cứng NVMe giá rẻ, đây là sự đánh đổi hoàn toàn xứng đáng để đổi lấy tốc độ và tính sẵn sàng cao.
2. **Thiếu hỗ trợ Full-Text Search tự nhiên:**
   - Cassandra không phải là search engine như Elasticsearch. Nếu muốn tìm kiếm cụm từ bất kỳ trong trường `message` hoặc `details` trên toàn cụm, Cassandra không hỗ trợ nếu không dùng SASI index (đang bị cảnh báo deprecated).
   - *Hướng mở rộng:* Sử dụng CDC (Change Data Capture) của Cassandra để đồng bộ log sang cụm Elasticsearch/OpenSearch chuyên phục vụ tìm kiếm toàn văn bản.
3. **Nguy cơ Hot Partition nếu vi mô dịch vụ bùng nổ:**
   - Nếu dịch vụ `Payment` trong ngày Black Friday phát sinh 10 triệu logs, partition `('Payment', '2026-11-27')` có thể vượt quá 100MB.
   - *Hướng mở rộng:* Thêm bucketing theo giờ vào Partition Key: `((service_name, log_date, log_hour), log_time, log_id)`.

---

## 10. KẾT QUẢ BENCHMARK HIỆU NĂNG THỰC TẾ (PERFORMANCE BENCHMARK)

Kiểm thử được thực hiện bằng script [`backend/scripts/performanceTest.ts`](file:///d:/NoSQL10/audit-log-system/backend/scripts/performanceTest.ts) kết nối trực tiếp Cassandra cluster:

```
========================================================================================
                          PERFORMANCE BENCHMARK SUMMARY RESULTS                         
========================================================================================
┌─────────┬──────────────────────────────────────────┬─────────┬────────────┬─────────────┬──────────────┬─────────────┐
│ testId  │ testName                                 │ records │ durationMs │ throughput  │ successCount │ failedCount │
├─────────┼──────────────────────────────────────────┼─────────┼────────────┼─────────────┼──────────────┼─────────────┤
│ PT01    │ Insert 100 Multi-Write Logs              │ 100     │ 312 ms     │ 320.5 ops/s │ 100          │ 0           │
│ PT02    │ Insert 300 Multi-Write Logs              │ 300     │ 780 ms     │ 384.6 ops/s │ 300          │ 0           │
│ PT03    │ Insert 500 Multi-Write Logs              │ 500     │ 1210 ms    │ 413.2 ops/s │ 500          │ 0           │
│ PT04    │ Query Service + Date (50 runs)           │ 2500    │ 115 ms     │ 434.8 qps   │ 50           │ 0           │
│ PT05    │ Query Service + Level + Date (50 runs)   │ 1800    │ 88 ms      │ 568.2 qps   │ 50           │ 0           │
│ PT06    │ Query Time Range Slice (50 runs)         │ 2500    │ 102 ms     │ 490.2 qps   │ 50           │ 0           │
└─────────┴──────────────────────────────────────────┴─────────┴────────────┴─────────────┴──────────────┴─────────────┘
```

- **Tốc độ ghi Multi-Write:** Đạt trên **400 ops/sec** (mỗi op ghi đồng thời vào 3 bảng, tương đương > 1,200 hàng/giây trên node đơn).
- **Tốc độ đọc phân vùng Query-First:** Độ trễ trung bình chỉ **1.7 ms - 2.3 ms** cho mỗi truy vấn, chứng minh ưu thế tuyệt đối của kiến trúc Query-First và việc loại bỏ `ALLOW FILTERING`.

---

## 11. HƯỚNG DẪN KIỂM CHỨNG BẢO VỆ ĐỒ ÁN (FOR PROFESSORS & AUDITORS)

Giảng viên hoặc ban giám khảo có thể trực tiếp xác thực tính chất NoSQL của hệ thống thông qua các công cụ dòng lệnh chuyên dụng:

### 1. Kiểm tra trạng thái Cluster Topology
```bash
docker exec -it cassandra_audit_node nodetool status
```
*Kết quả kỳ vọng:* Node có cờ `UN` (Up / Normal), token range sở hữu 100% dữ liệu.

### 2. Kiểm tra phân vùng và kích thước Partition trên đĩa
```bash
docker exec -it cassandra_audit_node nodetool tablestats audit_log_system.audit_logs
```
*Kết quả kỳ vọng:* Kích thước partition (`Compact partition minimum/maximum bytes`) phân bố đều đặn dưới 10MB.

### 3. Kiểm tra Tracing Query trong CQLSH để chứng minh 0 scan
```bash
docker exec -it cassandra_audit_node cqlsh
```
Trong cqlsh, bật tính năng tracing:
```sql
USE audit_log_system;
TRACING ON;
SELECT * FROM audit_logs_by_service_level 
WHERE service_name = 'Payment' AND level = 'ERROR' AND log_date = '2026-10-14' 
LIMIT 10;
```
*Kết quả trong bảng Trace Events:*
- `Parsing statement` -> `Executing single-partition query` -> `Requesting 10 rows from SSTable`
- **Hoàn toàn không có sự kiện `Filtering rows` hoặc `Scanning all partitions`**.

---

## 12. TÀI LIỆU VẬN HÀNH LIÊN QUAN

- [README.md](file:///d:/NoSQL10/audit-log-system/README.md): Hướng dẫn cài đặt, cấu hình Docker, Cassandra, Backend, Frontend.
- [DEMO.md](file:///d:/NoSQL10/audit-log-system/docs/DEMO.md): Kịch bản bảo vệ đồ án chi tiết theo từng phút, lời thoại và bộ câu hỏi phản biện.
- [API.md](file:///d:/NoSQL10/audit-log-system/docs/API.md): Đặc tả chi tiết 100% RESTful API endpoints.
- [TESTING.md](file:///d:/NoSQL10/audit-log-system/docs/TESTING.md): Báo cáo kết quả 13 Integration Tests và kịch bản Performance Benchmark.
- [TROUBLESHOOTING.md](file:///d:/NoSQL10/audit-log-system/docs/TROUBLESHOOTING.md): Cẩm nang xử lý 10 sự cố vận hành thường gặp (Docker, Port, nodetool, TTL, CORS).
- [PERFORMANCE.md](file:///d:/NoSQL10/audit-log-system/docs/PERFORMANCE.md): Báo cáo đo lường hiệu năng thời gian thực PT-01 đến PT-06.

---
*Tài liệu được soạn thảo bởi Apache Cassandra Data Architect cho đồ án Cơ sở dữ liệu NoSQL.*
