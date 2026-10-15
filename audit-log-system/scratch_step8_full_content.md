# BẢNG ĐỐI CHIẾU IMPLEMENTATION THỰC TẾ VỚI TÀI LIỆU SRS
**Tài liệu tham chiếu:** [`SRS_Nhom7_28_NguyenThiQuyen_2001230745_RaSoat_BoSungCuoi.docx`](file:///d:/NoSQL10/SRS_Nhom7_28_NguyenThiQuyen_2001230745_RaSoat_BoSungCuoi.docx)  
**Mã nguồn tham chiếu:** `audit-log-system` (Cassandra 4.1, Node.js Express Backend, React Frontend)  
**Trạng thái kiểm thử:** **40/40 Tests PASS (100% Green)**  
**Nguyên tắc thực hiện:** **KHÔNG sửa code** vì implementation hiện tại đang hoạt động chính xác, an toàn và đồng nhất. Toàn bộ các điểm chưa đồng bộ sẽ được điều chỉnh ở phía **Tài liệu SRS** để phản ánh đúng hiện trạng phần mềm hoàn thiện.

---

## 1. BẢNG ĐỐI CHIẾU CHI TIẾT (SRS vs. IMPLEMENTATION THẬT)

| STT | Phân hệ / Tiêu chí | Nội dung trong tài liệu SRS hiện tại | Implementation thật trong Source Code | Đánh giá Khớp / Không khớp | Đề xuất xử lý (Tài liệu / Code) |
| :---: | :--- | :--- | :--- | :---: | :--- |
| **1** | **Authentication (Kiến trúc xác thực)** | **Mục 14.5 (L1776-1778):** Đã có yêu cầu Admin đăng nhập (FR-01, UC-01) nhưng chưa cố định cơ chế xác thực ("session hoặc token"), giao cho nhóm tự quyết định theo code thực tế. | Sử dụng **Stateless JWT** (Bearer token trong Header `Authorization: Bearer <token>`). Middleware [auth.ts](file:///d:/NoSQL10/audit-log-system/backend/src/middleware/auth.ts) xác thực chữ ký và kiểm tra trạng thái tài khoản. | **Khớp về nghiệp vụ, nhưng SRS còn bỏ ngỏ cơ chế cụ thể** | **Code:** Giữ nguyên.<br>**SRS:** Cập nhật Mục 14.5 chốt cơ chế chính thức là **JWT Bearer Token** (thuật toán HS256, thời hạn 24h). |
| **2** | **Register (Đăng ký tài khoản)** | Chưa có Use Case hoặc API riêng cho việc tự đăng ký tài khoản (chỉ có Admin đăng nhập FR-01). | Endpoint `POST /api/auth/register` (Public). Validate username >= 3 ký tự, password >= 8 ký tự, regex email. **Bảo mật:** Backend cưỡng chế vai trò đăng ký luôn là **`VIEWER`**, chặn đứng nguy cơ leo thang đặc quyền. Sinh log `REGISTER_USER`. Trả về `409 Conflict` nếu trùng username. | **Không khớp (Code đã hoàn thiện nâng cao hơn SRS)** | **Code:** Giữ nguyên.<br>**SRS:** Bổ sung API `POST /api/auth/register` vào Bảng 6.1 và thêm Use Case UC-12 vào Chương 4. |
| **3** | **Login (Đăng nhập)** | **Bảng 3.1 (FR-01) & Bảng 4.1 (UC-01):** Admin nhập thông tin hợp lệ &rarr; xác thực &rarr; vào Dashboard; sai thông tin báo lỗi, không tạo phiên. | Endpoint `POST /api/auth/login`. Nhập username + password. Chuẩn hóa `.trim().toLowerCase()`. So khớp hash bằng **Bcrypt**. Tài khoản `INACTIVE` bị chặn (401). Trả về thông báo chung `"Invalid username or password"` (401). Tự sinh Audit Log `LOGIN_SUCCESS` (INFO) hoặc `LOGIN_FAILED` (WARN). Cấp JWT 24h. | **Khớp hoàn toàn luồng nghiệp vụ (Code chi tiết hóa bảo mật cao hơn)** | **Code:** Giữ nguyên.<br>**SRS:** Bổ sung vào Bảng 4.1 và Bảng 6.1 đặc tả việc so khớp bằng Bcrypt, cấp JWT và ghi nhận Audit Log tự động. |
| **4** | **Logout (Đăng xuất)** | Bảng 3.3 liệt kê Action `LOGOUT` thuộc service `Auth`, nhưng chưa có đặc tả API endpoint riêng. | Endpoint `POST /api/auth/logout` (Authenticated). Server ghi nhận Audit Log `LOGOUT` (INFO) vào Cassandra. Frontend xóa token khỏi `localStorage`. Bản chất JWT stateless nên server ghi log giám sát và client tiêu hủy phiên. | **Khớp về Action log, SRS thiếu đặc tả API** | **Code:** Giữ nguyên.<br>**SRS:** Bổ sung API `POST /api/auth/logout` vào Bảng 6.1 và làm rõ bản chất Stateless Logout. |
| **5** | **Change Password (Đổi mật khẩu)** | Bảng 3.3 có Action `RESET_PASSWORD` cho Auth service, nhưng chưa có API cho người dùng tự đổi mật khẩu. | Endpoint `PUT /api/auth/change-password` (Authenticated). Yêu cầu nhập mật khẩu cũ + mật khẩu mới (>= 8 ký tự). Kiểm tra mật khẩu cũ bằng bcrypt, băm mật khẩu mới bằng bcrypt cost 10, sinh log `CHANGE_PASSWORD` (INFO) không chứa mật khẩu. | **Không khớp (Code đã mở rộng hoàn thiện tính năng)** | **Code:** Giữ nguyên.<br>**SRS:** Bổ sung API `PUT /api/auth/change-password` vào Bảng 6.1 và thêm Use Case vào Chương 4. |
| **6** | **User Management (Quản trị người dùng)** | **Mục 12.3 (L1310):** Xếp tính năng "RBAC và audit riêng cho thao tác quản trị" vào mục **Hướng phát triển**. Chưa có bảng users trong Cassandra. | Đã hoàn thiện toàn diện: Bảng Cassandra [06_users_rbac.cql](file:///d:/NoSQL10/audit-log-system/database/06_users_rbac.cql) `users` (`PRIMARY KEY (username)`). Đầy đủ bộ API CRUD (Admin only): `GET /api/users`, `POST /api/users`, `PUT /api/users/:id`, `PATCH /api/users/:id/role`, `PATCH /api/users/:id/status`, `DELETE /api/users/:id`. Ghi nhận log đầy đủ: `CHANGE_USER_ROLE`, `DISABLE_USER`, `DELETE_USER`. | **Không khớp (Code đã triển khai hoàn thiện thay vì để ở Hướng phát triển)** | **Code:** Giữ nguyên.<br>**SRS:** Chuyển Module Quản trị người dùng từ Chương 12 (Hướng phát triển) lên Chương 2 (M06), Chương 3 (FR-25 đến FR-30), Chương 5 (Bảng 5.4 `users`) và Chương 6 (APIs). |
| **7** | **Vai trò ADMIN, OPERATOR, VIEWER** | **Bảng 2.3 (L214-216):** Chỉ định nghĩa duy nhất 1 Actor người dùng: `ACT-01 Admin` (Toàn quyền). Mục 12.1 ghi: Phân quyền có thể giới hạn ở Admin trong MVP. | Triển khai đầy đủ **RBAC 3 vai trò**: <br>- `ADMIN`: Toàn quyền User, Service, Cluster, TTL.<br>- `OPERATOR`: Xem Logs, xem Service, chạy Demo Operations.<br>- `VIEWER`: Chỉ xem Dashboard và Logs.<br>Backend kiểm tra qua middleware `authorize()`. UI tự ẩn hiện menu theo role. | **Không khớp (Code triển khai 3 vai trò hoàn chỉnh thay vì chỉ 1 Admin)** | **Code:** Giữ nguyên.<br>**SRS:** Cập nhật Bảng 2.3 thay thế `ACT-01 Admin` bằng bảng ma trận 3 tác nhân: `Admin`, `Operator`, `Viewer` (khớp với [docs/AUTHORIZATION.md](file:///d:/NoSQL10/audit-log-system/docs/AUTHORIZATION.md)). |
| **8** | **Mã lỗi HTTP 401 & 403** | **Mục 14.5 (L1781) & Mục 15.4 (L2228):** Quy định rõ: Lỗi xác thực trả `401`; Không đủ quyền quản trị trả `403`. Test Case TC-27 yêu cầu trả `401` khi chưa đăng nhập. | Tách biệt tuyệt đối:<br>- **401 Unauthorized:** Thiếu token, token sai, token hết hạn, sai thông tin đăng nhập, hoặc tài khoản `INACTIVE`.<br>- **403 Forbidden:** Đã đăng nhập nhưng không đủ quyền thực hiện hành động (VD: VIEWER gọi Service API, OPERATOR gọi User API). | **Khớp 100%** | **Code:** Không cần sửa.<br>**SRS:** Đã đúng quy định, giữ nguyên. |
| **9** | **Cơ chế Token JWT** | **Mục 14.5:** Để ngỏ lựa chọn session hoặc token. | Triển khai thư viện chuẩn `jsonwebtoken`. Payload chỉ chứa `{ user_id, username, role }`. Thời hạn `24h`. Secret cấu hình qua biến môi trường `JWT_SECRET` (fail-fast khi thiếu trên production). | **Khớp với định hướng mở của SRS** | **Code:** Giữ nguyên.<br>**SRS:** Bổ sung thông số kỹ thuật của JWT vào Mục 14.5 (thuật toán, cấu trúc payload, thời hạn). |
| **10** | **Mật khẩu & Bcrypt** | **Mục 14.5:** Bắt buộc bảo vệ mật khẩu, không lưu mật khẩu dạng plain text, nhưng chưa ghi rõ thuật toán băm cụ thể. | Áp dụng thuật toán **`bcrypt`** với salt rounds cost factor 10 (`bcryptjs`). Định nghĩa kiểu `SafeUser` triệt để không bao giờ trả về `password_hash` qua API. Mật khẩu tối thiểu 8 ký tự. | **Khớp về nguyên tắc, SRS thiếu tên thuật toán** | **Code:** Giữ nguyên.<br>**SRS:** Bổ sung thuật toán Bcrypt (cost 10) và trường `password_hash` vào tài liệu. |
| **11** | **Admin Safety (Bảo vệ Admin)** | SRS chưa đề cập trường hợp admin tự xóa hoặc hệ thống không còn admin nào. | Triển khai 3 tầng bảo vệ an toàn Admin:<br>1. Admin không thể tự xóa tài khoản của mình.<br>2. Admin không thể tự khóa tài khoản của mình.<br>3. Admin không thể tự giáng quyền mình.<br>4. Hàm `countActiveAdmins()` ngăn chặn xóa/khóa/demote tài khoản Admin đang hoạt động **cuối cùng** trong hệ thống. | **Không khớp (Code hoàn thiện cơ chế an toàn nâng cao)** | **Code:** Giữ nguyên.<br>**SRS:** Bổ sung Quy tắc nghiệp vụ (BR) về an toàn tài khoản quản trị vào Bảng 8.2. |
| **12** | **Bảo mật Audit Log (Data Masking)** | **Mục 6.1 (L738) & Mục 14.5 (L1779-1780):** Nghiêm cấm lưu mật khẩu, token bí mật hoặc dữ liệu thẻ trong Audit Log; thông tin nhạy cảm phải được loại bỏ hoặc mask trước khi ghi. | Triển khai [sensitiveDataFilter.ts](file:///d:/NoSQL10/audit-log-system/backend/src/utils/sensitiveDataFilter.ts) quét và mask tự động mật khẩu (`***REDACTED***`), thẻ tín dụng (`****-****-****-1234`), mã CVV. Zod validator chặn ghi log chứa mật khẩu. Các log Auth/User quản trị tuyệt đối không ghi nhận mật khẩu cũ/mới vào message/details. | **Khớp 100%** | **Code:** Không cần sửa.<br>**SRS:** Đã đúng quy định, giữ nguyên. |

---

## 2. NGUYÊN NHÂN KHÁC BIỆT & ĐỀ XUẤT NỘI DUNG SRS CHÍNH XÁC

### Tại sao có sự khác biệt giữa SRS và Implementation?
1. Bản tài liệu SRS (`SRS_Nhom7_28_NguyenThiQuyen_2001230745_RaSoat_BoSungCuoi.docx`) được soạn thảo ở giai đoạn thiết kế ban đầu (MVP), trong đó tính năng Quản lý người dùng và Phân quyền đa vai trò (RBAC) được xếp vào mục **Chương 12: Hướng phát triển** nhằm giảm độ phức tạp lúc khởi tạo.
2. Trong quá trình phát triển hoàn thiện phiên bản Release Candidate `v1.0.0-RC`, hệ thống đã được triển khai **vượt mức tối thiểu của SRS ban đầu**:
   - Xây dựng bảng `audit_log_system.users` chuẩn Query-First NoSQL.
   - Nâng cấp mô hình 1 Admin thành **RBAC 3 vai trò (ADMIN, OPERATOR, VIEWER)** với cơ chế bảo vệ phân quyền chặt chẽ.
   - Bổ sung luồng tự đăng ký (Register), đổi mật khẩu (Change Password) và giám sát chuỗi Audit Trail cho từng thao tác của người dùng.
3. Vì code hiện tại đã đạt chất lượng cao, chạy ổn định, an toàn bảo mật và **vượt qua 40/40 ca kiểm thử tự động**, việc sửa code theo hướng thụt lùi (hạ cấp bỏ RBAC) là **hoàn toàn không hợp lý**. Giải pháp chuẩn kỹ thuật phần mềm là **cập nhật nội dung tài liệu SRS cho khớp với sản phẩm thực tế**.

---

## 3. CÁC NỘI DUNG CỤ THỂ CẦN ĐIỀU CHỈNH TRONG FILE SRS (.DOCX)

Khi cập nhật lại báo cáo đồ án Word (`SRS_Nhom7_28_NguyenThiQuyen_2001230745_RaSoat_BoSungCuoi.docx`), chỉ cần thực hiện 5 điểm cập nhật sau:

### 1. Cập nhật Bảng 2.3 (Tác nhân và phân quyền):
Thay thế nội dung chỉ có 1 `ACT-01 Admin` thành:
- **`ACT-01 Admin`:** Toàn quyền quản trị hệ thống, quản lý người dùng (CRUD User, đổi vai trò, khóa tài khoản), quản lý danh mục vi dịch vụ (CRUD Service), theo dõi sức khỏe cụm Cassandra (`/api/system/status`) và thực thi demo TTL 30 giây.
- **`ACT-02 Operator`:** Vận hành viên hệ thống, được quyền xem danh sách và chi tiết Audit Log, xem danh mục vi dịch vụ đang hoạt động, thực thi 12 tác vụ nghiệp vụ giả lập tự sinh log tại trang Demo Operations.
- **`ACT-03 Viewer`:** Người xem / Kiểm toán viên (vai trò mặc định khi tự đăng ký), có quyền chỉ đọc (Read-only) Dashboard thống kê và tra cứu lịch sử Audit Log. Bị từ chối (HTTP 403) đối với các thao tác quản trị hoặc ghi dữ liệu.

### 2. Cập nhật Bảng 5.4 (Cấu trúc bảng dữ liệu trong Cassandra):
Bổ sung **Bảng 5.4: Cấu trúc bảng `users`** vào Chương 5:
- **Tên bảng:** `audit_log_system.users`
- **Mục đích:** Lưu trữ thông tin tài khoản người dùng, vai trò phân quyền và mật khẩu băm một chiều.
- **Partition Key:** `username text` (Point lookup $O(1)$ token Murmur3, không dùng `ALLOW FILTERING`).
- **Các trường dữ liệu:** `user_id uuid`, `username text`, `password_hash text`, `full_name text`, `email text`, `role text`, `status text`, `created_at timestamp`, `updated_at timestamp`.
- **Secondary Index:** `CREATE INDEX idx_users_id ON audit_log_system.users (user_id);`

### 3. Cập nhật Bảng 6.1 (Danh sách REST API của hệ thống):
Bổ sung nhóm API Xác thực & Quản trị người dùng vào bảng API:
- `POST /api/auth/register` (Public - Đăng ký tài khoản người dùng mới với vai trò VIEWER).
- `POST /api/auth/login` (Public - Đăng nhập bằng Bcrypt + cấp JWT token 24h).
- `POST /api/auth/logout` (Auth - Đăng xuất và ghi nhận Audit Log `LOGOUT`).
- `GET /api/auth/me` (Auth - Lấy thông tin phiên làm việc của người dùng hiện tại).
- `PUT /api/auth/change-password` (Auth - Người dùng tự đổi mật khẩu cá nhân).
- `GET /api/users` (Admin - Liệt kê danh sách tài khoản người dùng).
- `POST /api/users` (Admin - Tạo tài khoản người dùng mới với vai trò chỉ định).
- `PUT /api/users/:id` (Admin - Cập nhật họ tên, email của người dùng).
- `PATCH /api/users/:id/role` (Admin - Phân lại vai trò ADMIN / OPERATOR / VIEWER).
- `PATCH /api/users/:id/status` (Admin - Khóa hoặc kích hoạt tài khoản ACTIVE / INACTIVE).
- `DELETE /api/users/:id` (Admin - Xóa vĩnh viễn tài khoản người dùng).

### 4. Cập nhật Mục 14.5 (Xác thực Admin và kiểm soát truy cập):
- Khẳng định cơ chế xác thực chính thức là **JSON Web Token (JWT)**, truyền qua HTTP Header `Authorization: Bearer <token>`.
- Khẳng định thuật toán băm mật khẩu là **Bcrypt (cost factor 10)**.
- Ghi chú về bản chất **Stateless Logout**: Server ghi nhận sự kiện `LOGOUT` vào Cassandra Audit Log và client xóa token khỏi `localStorage`.
- Ghi chú về an toàn **Token Storage**: `localStorage` sử dụng cho môi trường demo học thuật; môi trường production khuyến nghị dùng **HttpOnly + Secure Cookie** để phòng chống XSS.

### 5. Cập nhật Bảng 8.2 (Quy tắc nghiệp vụ - Business Rules):
Bổ sung các quy tắc nghiệp vụ quản trị:
- **BR-10:** Mật khẩu người dùng phải có độ dài tối thiểu 8 ký tự.
- **BR-11:** Tên người dùng (username) không phân biệt hoa thường và không được phép trùng lặp (trả về mã 409 Conflict).
- **BR-12:** Người dùng tự đăng ký công khai luôn được hệ thống cưỡng chế vai trò `VIEWER`.
- **BR-13:** Quản trị viên không được phép tự xóa, tự khóa hoặc tự giáng quyền của chính mình.
- **BR-14:** Hệ thống không cho phép xóa, khóa hoặc giáng quyền tài khoản Quản trị viên (`ADMIN`) đang hoạt động cuối cùng.

---

## 4. KẾT LUẬN

1. **Về phía Source Code:** Không phát hiện bất kỳ sai lệch nào gây lỗi hoặc làm suy giảm chất lượng hệ thống. Toàn bộ 40 ca kiểm thử tự động, build frontend/backend, giao diện và API đều hoạt động hoàn hảo. **Giữ nguyên 100% source code hiện tại**.
2. **Về phía Tài liệu:** Toàn bộ đặc tả kỹ thuật chi tiết đã được đồng bộ chuẩn xác trong kho tài liệu Markdown của dự án:
   - [docs/AUTHORIZATION.md](file:///d:/NoSQL10/audit-log-system/docs/AUTHORIZATION.md) (Kiến trúc phân quyền và bảo mật chi tiết)
   - [docs/API.md](file:///d:/NoSQL10/audit-log-system/docs/API.md) (Đặc tả 100% REST endpoints)
   - [docs/DEMO.md](file:///d:/NoSQL10/audit-log-system/docs/DEMO.md) (Kịch bản bảo vệ chi tiết và demo 3 phút)
   - [RELEASE_CHECKLIST.md](file:///d:/NoSQL10/audit-log-system/RELEASE_CHECKLIST.md) (Kiểm toán 20/20 hạng mục)
   - [FINAL_RELEASE_SUMMARY.md](file:///d:/NoSQL10/audit-log-system/FINAL_RELEASE_SUMMARY.md) (Tổng kết đóng băng phiên bản)
3. Bạn có thể sử dụng trực tiếp các mục đề xuất ở Phần 3 để cập nhật vào file Word báo cáo đồ án (`SRS_Nhom7_28_NguyenThiQuyen_2001230745_RaSoat_BoSungCuoi.docx`) mà không cần thay đổi bất kỳ dòng code nào.