# KỊCH BẢN THUYẾT TRÌNH BẢO VỆ ĐỒ ÁN (ORAL DEFENSE SCRIPT)
## HỆ THỐNG AUDIT LOG VÀ GIÁM SÁT LỊCH SỬ THAO TÁC HỆ THỐNG
**Cơ sở dữ liệu chính:** Apache Cassandra 4.1 (Wide-Column / Column Family NoSQL Store)

---

## MỤC TIÊU CỐT LÕI CẦN ĐẠT ĐƯỢC TRƯỚC HỘI ĐỒNG
1. **Dữ liệu thực tế 100%:** Toàn bộ hệ thống giao tiếp qua REST API Backend thật và lưu trữ trực tiếp vào các bảng Wide-Column của cụm Apache Cassandra (Port 9042). Không sử dụng dữ liệu giả (fake/mock) hay cơ sở dữ liệu quan hệ (RDBMS).
2. **Triết lý Query-First Data Modeling:** Thiết kế Partition Key và Clustering Key chuẩn xác, giải thích tại sao không dùng `ALLOW FILTERING` cho các nghiệp vụ chính.
3. **Cơ chế Auto Audit Log:** Mọi hành vi nghiệp vụ của người dùng đều tự động kích hoạt tiến trình ghi log bất đồng bộ vào Cassandra.
4. **Cơ chế Cassandra Native TTL (Time-To-Live):** Chứng minh tính năng tự động tiêu hủy log sau 30 giây trực tiếp trên cả giao diện Web, Terminal CLI và câu lệnh CQL.
5. **Kiểm tra trạng thái cụm:** Lệnh `nodetool status` trả về trạng thái **UN (Up / Normal)**.

---

## THỜI GIAN BIỂU BẢO VỆ ĐỒ ÁN (TỔNG THỜI GIAN: 10 - 15 PHÚT)

```
[Phút 00 - 02] Khởi động hệ thống & Kiểm tra trạng thái cụm Cassandra (nodetool status)
[Phút 02 - 05] Màn hình Demo Operations (/demo): Kích hoạt Auto Audit Log thời gian thực
[Phút 05 - 08] Màn hình Audit Logs (/logs): Chứng minh Query-First & Phân trang Cursor
[Phút 08 - 11] Màn hình TTL Demo (/ttl-demo): Chứng minh dữ liệu tự hủy sau 30 giây
[Phút 11 - 13] Màn hình Services & System Status: Kiểm tra tính sẵn sàng cao
[Phút 13 - 15] Trả lời câu hỏi phản biện của Thầy Cô
```

---

## BƯỚC 0: CHUẨN BỊ 3 PHÚT TRƯỚC KHI VÀO PHÒNG BẢO VỆ

Mở **Windows PowerShell**, di chuyển đến thư mục dự án và thực hiện tuần tự:

```powershell
cd d:\NoSQL10\audit-log-system

# 1. Khởi động container Apache Cassandra
docker compose up -d

# 2. Kiểm tra container đã ở trạng thái UN (Up/Normal)
docker exec -it cassandra_audit_node nodetool status

# 3. Nạp 400 dummy logs phân bố chuẩn (Auth: 100, User: 100, Order: 100, Payment: 100)
npm run seed:dummy

# 4. Khởi động Backend (Port 5000)
# Mở tab PowerShell 1:
npm run backend:dev

# 5. Khởi động Frontend (Port 5173)
# Mở tab PowerShell 2:
npm run frontend:dev
```

Mở trình duyệt Google Chrome tại: `http://localhost:5173/login`  
Tài khoản Demo có sẵn (1-click fill trên giao diện đăng nhập):
- **ADMIN:** `admin` / `admin123`
- **OPERATOR:** `operator` / `operator123`
- **VIEWER:** `viewer` / `viewer123`

---

## KỊCH BẢN DEMO AUTHENTICATION & RBAC TRONG 3 PHÚT (CHUYÊN ĐỀ PHÂN QUYỀN)

### Phút 01: Đăng nhập & Ma trận phân quyền động (Role-Adaptive UI)
1. **Đăng nhập bằng tài khoản `admin`:**
   - Đăng nhập thành công, góc trên Header hiển thị huy hiệu tím `ADMIN` và tên người dùng.
   - Sidebar hiển thị đầy đủ 6 phân hệ: Dashboard, Audit Logs, Demo Operations, Microservices, Cassandra Cluster Status, User Management (RBAC).
2. **Đăng xuất & Đăng nhập bằng `operator`:**
   - Header chuyển sang huy hiệu xanh dương `OPERATOR`.
   - Sidebar tự động ẩn mục **User Management** và mục **Cluster Status**.
   - Vào `/demo`: Có quyền kích hoạt thao tác ghi log tự động.
3. **Đăng xuất & Đăng nhập bằng `viewer`:**
   - Header chuyển sang huy hiệu xanh lục `VIEWER`.
   - Sidebar chỉ còn 2 mục duy nhất: **Dashboard** và **Audit Logs**.
   - Mọi chức năng quản trị, ghi dữ liệu, demo đều bị ẩn.

### Phút 02: Kiểm chứng bảo vệ Backend & HTTP 403 Forbidden (RBAC Guard)
1. **Cố tình truy cập trái phép bằng URL trực tiếp:**
   - Trong phiên làm việc của `viewer`, gõ URL trình duyệt: `http://localhost:5173/users` hoặc `http://localhost:5173/demo`.
   - Hệ thống chặn ngay lập tức và hiển thị giao diện **HTTP 403 FORBIDDEN - Access Denied**.
   - Giao diện thể hiện rõ: *Your Role: VIEWER | Required Role: ADMIN*.
2. **Chứng minh Backend Authorization:**
   - Bật DevTools (F12) tab Network: Gửi request `GET /api/users` bằng token của `viewer`.
   - Backend phản hồi `403 Forbidden` (`{"success":false,"message":"Forbidden","error":"Access denied. Role 'VIEWER' lacks required permissions..."}`).
   - Chứng minh bảo vệ 2 lớp: Không chỉ dựa vào ẩn nút Frontend mà Backend kiểm tra chặt chẽ quyền hạn qua middleware `authorize()`.

### Phút 03: Bảo mật Mật khẩu Bcrypt & An toàn Quản trị (Admin Safety)
1. **Kiểm tra User Management (`/users`) bằng tài khoản `admin`:**
   - Bấm sửa user, đổi Role từ `VIEWER` sang `OPERATOR`.
   - Thử bấm **Delete** hoặc **Disable** chính tài khoản `admin` đang đăng nhập &rarr; Bị vô hiệu hóa với thông báo *"Cannot delete / disable your own administrator account"*.
   - Tạo user mới với password ngắn (< 8 ký tự) hoặc trùng tên &rarr; Backend từ chối với lỗi rõ ràng và mã `409 Conflict`.
2. **Mở trang Audit Logs (`/logs`):**
   - Chỉ cho Hội đồng thấy chuỗi Audit Trail hoàn chỉnh: `LOGIN_SUCCESS`, `LOGOUT`, `CHANGE_USER_ROLE`.
   - Xem chi tiết JSON của log: Không bao giờ xuất hiện mật khẩu dạng plain text hay `password_hash`. Mật khẩu được băm một chiều bằng bcrypt cost 10 theo tiêu chuẩn an toàn.

---

## PHẦN 1: MỞ ĐẦU & KIỂM TRA TRẠNG THÁI CỤM CASSANDRA (Phút 00 - 02)

### Lời thoại trình bày:
> *"Kính thưa Thầy Cô trong Hội đồng, đồ án của nhóm chúng em xây dựng Hệ thống Giám sát Audit Log chuyên biệt cho kiến trúc vi dịch vụ bằng Apache Cassandra. Điểm khác biệt lớn nhất so với các hệ thống CRUD thông thường là chúng em áp dụng nguyên lý Query-First Modeling, ghi đồng thời vào các bảng tối ưu và khai thác sức mạnh ghi cực nhanh của kiến trúc LSM-Tree."*

### Thao tác minh họa:
1. Mở cửa sổ PowerShell chạy lệnh kiểm tra node Cassandra:
   ```powershell
   docker exec -it cassandra_audit_node nodetool status
   ```
2. **Chỉ vào màn hình giải thích cho Hội đồng:**
   - Ký tự **`U` (Up):** Node đang hoạt động, tiến trình Java Cassandra mở port 9042 bình thường.
   - Ký tự **`N` (Normal):** Node đang ở trạng thái vận hành ổn định trong vòng băm Token Ring.
   - Cột **`Owns: 100.0%`**: Node sở hữu toàn bộ dải phân vùng Murmur3Partitioner.
3. Chuyển sang màn hình Web vào mục **"System Status"** (`/system`) để Hội đồng thấy thông số Uptime, Cluster Name (`AuditLogCluster`), Release Version (`4.1.x`) và Data Center (`datacenter1`).

---

## PHẦN 2: DEMO OPERATIONS - AUTO AUDIT LOG THỜI GIAN THỰC (Phút 02 - 05)

### Lời thoại trình bày:
> *"Để chứng minh hệ thống hoạt động thực tế và Backend tự động ghi log khi có nghiệp vụ phát sinh, em xin phép thao tác trực tiếp trên màn hình Demo Operations."*

### Thao tác minh họa:
1. Trên Sidebar, bấm vào menu **"Demo Operations"** (`/demo`).
2. Màn hình hiển thị 4 nhóm nghiệp vụ rõ ràng:
   - **AUTH:** Login Success, Login Failed, Logout
   - **USER:** Create User, Update User, Delete User
   - **ORDER:** Create Order, Update Order, Cancel Order
   - **PAYMENT:** Payment Success, Payment Failed, Refund
3. **Thao tác 1:** Nhấn nút **`[ Create Order ]`** trong nhóm ORDER.
   - Quan sát Banner kết quả xuất hiện ngay lập tức:
     - Action: `CREATE_ORDER`
     - Service: `Order`
     - Level: `INFO`
     - Log ID: Mã UUID duy nhất sinh ra từ Cassandra (ví dụ: `8c454e60-...`)
     - Status: `HTTP 201 Created`
4. **Thao tác 2:** Nhấn nút **`[ View generated log ]`** ngay trên Banner kết quả.
   - Modal chi tiết hiển thị toàn bộ trường dữ liệu của bản ghi vừa sinh trong Cassandra (User ID, IP Address, Order Payload JSON, Timestamp).
5. **Thao tác 3 (Chứng minh lưu thật trong database):**
   - Mở cửa sổ PowerShell cqlsh:
     ```powershell
     docker exec -it cassandra_audit_node cqlsh -e "SELECT service_name, log_date, log_time, log_id, level, action, message FROM audit_log_system.audit_logs WHERE service_name = 'Order' AND log_date = toDate(now()) LIMIT 3;"
     ```
   - Chỉ cho Thầy Cô thấy dòng log vừa sinh xuất hiện ở vị trí đầu tiên với đúng UUID và nội dung hiển thị trên giao diện.
6. **Thao tác 4:** Nhấn nút **`[ Refresh Dashboard ]`** để quay về Dashboard, chỉ cho Thầy Cô thấy biểu đồ Recharts và thẻ tổng số log tăng lên tương ứng.

---

## PHẦN 3: AUDIT LOGS - CHỨNG MINH QUERY-FIRST & ZERO ALLOW FILTERING (Phút 05 - 08)

### Lời thoại trình bày:
> *"Tiếp theo, em xin chứng minh cách hệ thống truy vấn dữ liệu mà không bao giờ gặp lỗi quá tải hay phải quét toàn bộ bảng (Full-Table Scan)."*

### Thao tác minh họa:
1. Mở trang **"Audit Logs"** (`/logs`).
2. **Kịch bản truy vấn 1: Tìm tất cả lỗi thanh toán (Payment ERROR)**
   - Chọn **Service:** `Payment`
   - Chọn **Level:** `ERROR`
   - Bấm **[Search Logs]**.
   - **Giải thích kỹ thuật cho Hội đồng:**
     - Thay vì query bảng chính rồi dùng `ALLOW FILTERING` (điều tối kỵ trong Cassandra), Backend tự động chuyển hướng đọc sang bảng **`audit_logs_by_service_level`**.
     - Partition Key là: `((service_name, level, log_date)) = (('Payment', 'ERROR', '2026-10-14'))`.
     - Cassandra chỉ đọc đúng 1 phân vùng duy nhất, thời gian phản hồi dưới 5ms.
3. **Kịch bản truy vấn 2: Lọc khoảng thời gian (Time Range)**
   - Nhập thời gian từ `08:00` đến `18:00`.
   - **Giải thích:** Nhờ Clustering Key `log_time DESC` được sắp xếp vật lý sẵn trên đĩa, Cassandra thực hiện slice nhị phân $O(\log N + K)$ mà không cần sắp xếp lại trong RAM.
4. **Kịch bản kiểm tra bảo mật (Sensitive Data Masking):**
   - Mở Modal chi tiết một bản ghi thanh toán.
   - Chỉ cho Hội đồng thấy số thẻ ngân hàng, mật khẩu, mã CVV đều được tự động chuyển thành chuỗi `***MASKED***` trước khi lưu vào Cassandra, đảm bảo chuẩn bảo mật PCI-DSS.

---

## PHẦN 4: DEMO CASSANDRA NATIVE TTL TRONG 30 GIÂY (Phút 08 - 11)

### Lời thoại trình bày:
> *"Một trong những tính năng mạnh nhất của NoSQL Cassandra là Native Time-To-Live (TTL). Hệ thống không cần bất kỳ tiến trình chạy nền hay câu lệnh DELETE nào mà dữ liệu tự động biến mất đúng thời hạn. Sau đây em xin demo trực quan trong vòng 30 giây."*

### Thao tác minh họa:
1. Mở trang **"TTL Demo (30s)"** (`/ttl-demo`) từ Sidebar hoặc từ nút tắt trên trang Demo Operations.
2. **Bước 1:** Để mặc định `30s` -> Nhấn nút **`[ Insert TTL Log (30s Lifespan) ]`**.
   - Backend gọi API `POST /api/logs/ttl-demo` ghi bản ghi có mệnh đề `USING TTL 30;`.
3. **Bước 2 & 3 (Đếm ngược thời gian thực & Đọc TTL từ Cassandra):**
   - Đồng hồ đếm ngược số to bắt đầu chạy: `30s -> 29s -> 28s...`.
   - Hệ thống tự động truy vấn node Cassandra mỗi 2 giây bằng hàm `TTL(message)`.
   - Dòng trạng thái hiển thị rõ: `Cassandra TTL(message) Node Read: 26s`, `24s`, `22s`...
   - Nhấn nút **`[ ⚡ Check Cassandra Now ]`** để chứng minh số giây do node Cassandra trả về thật chứ không phải frontend tự đếm.
4. **Bước 4 & 5 (Sau 30 giây - Cassandra tự động tiêu hủy):**
   - Khi hết 30 giây, backend query lại Cassandra `SELECT * FROM audit_logs_by_id WHERE log_id = ?;`.
   - Cassandra trả về: **0 rows returned!**
   - Giao diện ngay lập tức đổi sang banner màu đỏ/rose: **`EXPIRED & PURGED (0 ROWS RETURNED)`**.
   - Bấm nút **`[ Check Audit Logs Table ]`** chuyển sang bảng Audit Logs chứng minh bản ghi đã hoàn toàn biến mất khỏi cơ sở dữ liệu.

---

## PHẦN 4.5: DEMO PHÂN QUYỀN VAI TRÒ (RBAC) & BẢO MẬT 401/403 (Phút 10 - 12)

### Lời thoại trình bày:
> *"Tiếp theo, em xin chứng minh hệ thống Authentication & Role-Based Access Control (RBAC). Cơ chế bảo mật được thực thi chặt chẽ ở cả Frontend Route Guard và Backend Authorization Middleware với mã HTTP chuẩn 401 Unauthorized và 403 Forbidden."*

### Thao tác minh họa 3 Vai trò (ADMIN / OPERATOR / VIEWER):

1. **Bước 1: Demo vai trò ADMIN (`admin` / `admin123`)**
   - Đăng xuất và dùng nút 1-click **[ADMIN]** để đăng nhập `admin`.
   - **Menu hiển thị đầy đủ:** Dashboard, Audit Logs, Services, Demo Operations, TTL Demo, System Status, **User Management**.
   - Truy cập trang **User Management** (`/users`): Thêm người dùng mới, đổi vai trò, bật/tắt kích hoạt tài khoản hoặc xóa tài khoản có hộp thoại xác nhận.
   - Thao tác thay đổi sinh Audit Log: `CHANGE_USER_ROLE` (WARN), `REGISTER_USER` (INFO). Mật khẩu được băm bằng **bcrypt (cost factor 10)**, không bao giờ lưu hay ghi log dạng plain text.

2. **Bước 2: Demo vai trò OPERATOR (`operator` / `operator123`)**
   - Đăng xuất và bấm nút 1-click **[OPERATOR]** để đăng nhập `operator`.
   - Quan sát Sidebar: **Tự động ẩn User Management, TTL Demo và System Status**.
   - Được quyền truy cập: Dashboard, Audit Logs, Services (Read-only), và Demo Operations.
   - Khi cố tình xóa một service trong danh mục hoặc mở URL `/users`, Backend trả về mã lỗi **403 Forbidden**.

3. **Bước 3: Demo vai trò VIEWER (`viewer` / `viewer123`)**
   - Đăng xuất và bấm nút 1-click **[VIEWER]** để đăng nhập `viewer`.
   - Quan sát Sidebar: **Chỉ hiển thị Dashboard và Audit Logs**.
   - Toàn bộ menu Services, Demo Operations, TTL Demo, User Management bị ẩn.

4. **Bước 4: Chứng minh kiểm tra quyền tại Backend thật (Bảo mật 403 Forbidden)**
   - Đang ở tài khoản `viewer`, thử gõ trực tiếp URL `/demo` hoặc `/users` trên thanh địa chỉ trình duyệt.
   - Giao diện lập tức chặn lại và hiển thị màn hình **Access Denied (HTTP 403 Forbidden)**, chỉ rõ:
     - Vai trò hiện tại: `VIEWER`
     - Quyền yêu cầu: `ADMIN` hoặc `OPERATOR`
   - Kiểm tra bằng lệnh `curl` gửi token của VIEWER gọi API Admin:
     ```bash
     curl -X POST http://localhost:5000/api/demo/orders -H "Authorization: Bearer <VIEWER_TOKEN>"
     ```
   - Backend phản hồi: `{"success":false,"message":"Forbidden","error":"Access denied. Role 'VIEWER' lacks required permissions"}` với **HTTP Status Code 403**.

5. **Bước 5: Chứng minh mã HTTP 401 Unauthorized**
   - Thử gửi request không có Bearer Token hoặc gửi token giả mạo:
     ```bash
     curl http://localhost:5000/api/logs
     ```
   - Backend phản hồi: `{"success":false,"message":"Unauthorized","error":"Missing or malformed Authorization header."}` với **HTTP Status Code 401**.

---

## PHẦN 5: CHẠY BENCHMARK HIỆU NĂNG & TỔNG KẾT (Phút 12 - 14)

### Thao tác minh họa:
1. Mở cửa sổ PowerShell, chạy bài đo lường hiệu năng thời gian thực:
   ```powershell
   npm run test:perf
   ```
2. Màn hình in ra bảng kết quả 6 bài test:
   - **PT-01 (100 logs), PT-02 (300 logs), PT-03 (500 logs):** Tốc độ ghi trung bình dưới 5ms/log.
   - **PT-04, PT-05, PT-06:** Tốc độ truy vấn phân vùng đạt trên 200 queries/giây.
3. Chỉ cho Thầy Cô thấy file báo cáo tự động được cập nhật tại [`docs/PERFORMANCE.md`](file:///d:/NoSQL10/audit-log-system/docs/PERFORMANCE.md) và [`docs/performance-results.json`](file:///d:/NoSQL10/audit-log-system/docs/performance-results.json).

---

## PHẦN 6: BỘ CÂU HỎI PHẢN BIỆN DỰ KIẾN CỦA HỘI ĐỒNG & CÂU TRẢ LỜI CHUẨN

### Câu hỏi 1: Tại sao bài toán Audit Log lại chọn Cassandra mà không dùng MySQL hay MongoDB?
> **Trả lời:**  
> Audit Log là hệ thống có tỉ lệ **Ghi 99% - Đọc 1%**.  
> - Với RDBMS (MySQL/PostgreSQL), mỗi lần ghi phải cập nhật B-Tree index và khóa hàng (row locking), khi hàng triệu log đổ về sẽ gây nghẽn cổ chai (bottleneck) và tràn disk.
> - Cassandra sử dụng kiến trúc **LSM-Tree**: Ghi tuần tự (append-only) vào CommitLog trên đĩa và cập nhật Memtable trong RAM nên tốc độ ghi cực nhanh, không phụ thuộc khóa dòng và mở rộng tuyến tính (Linear Scalability) chỉ bằng cách thêm node.
> - Tính năng **Native TTL** tự động gắn cờ Tombstone khi hết hạn mà không gây áp lực I/O như lệnh `DELETE` của SQL.

### Câu hỏi 2: Tại sao phải chia ra bảng `audit_logs` và `audit_logs_by_service_level`? Tại sao không dùng 1 bảng rồi tạo Secondary Index?
> **Trả lời:**  
> Đây là nguyên lý **Query-First** và **Denormalization** của NoSQL Wide-Column:
> - Trong Cassandra, Secondary Index hoạt động theo cơ chế Scatter-Gather (phải hỏi tất cả các node trong cụm để tìm dữ liệu), gây nghẽn mạng nghiêm trọng khi bảng có hàng triệu dòng.
> - Bằng cách nhân bản dữ liệu có chủ đích (Denormalization) sang bảng `audit_logs_by_service_level` với Partition Key `((service_name, level, log_date))`, truy vấn đọc được định tuyến trực tiếp tới đúng 1 phân vùng duy nhất chứa dữ liệu qua hàm băm Murmur3Partitioner mà hoàn toàn không cần `ALLOW FILTERING` hay quét toàn bộ phân vùng.

### Câu hỏi 3: Nếu ghi vào 3 bảng cùng lúc, làm sao đảm bảo không bị ghi đè khi 2 log xảy ra cùng 1 mili-giây?
> **Trả lời:**  
> Trong định nghĩa PRIMARY KEY của cả 3 bảng:
> `PRIMARY KEY ((service_name, log_date), log_time, log_id)`
> Chúng em đã đưa **`log_id` (UUID v4)** vào thành phần cuối cùng của **Clustering Key**. Do UUID v4 có tính duy nhất tuyệt đối trên toàn cầu, dù hai sự kiện xảy ra ở cùng một mili-giây (`log_time` bằng nhau) thì Cassandra vẫn lưu thành 2 dòng riêng biệt, không bao giờ bị ghi đè (upsert overwrite).

---

## KẾT THÚC BẢO VỆ
Cảm ơn Thầy Cô trong Hội đồng đã lắng nghe phần thuyết trình của nhóm!
