# Hệ Thống Chấm Công Nhân Viên Kỹ Thuật Hiện Trường - Backend

Dự án này là backend của hệ thống chấm công nhân viên kỹ thuật hiện trường sử dụng PWA, viết bằng Node.js, Express.js và PostgreSQL.

---

## 🛠️ Công Nghệ Sử Dụng
- **Runtime:** Node.js (JavaScript)
- **Framework:** Express.js
- **Database driver:** `pg` (PostgreSQL connection pooling)
- **Bảo mật:** `helmet`, `cors`, `bcrypt` (băm mật khẩu), `jsonwebtoken` (xác thực Access Token)
- **Cơ chế Refresh Token:** Sinh chuỗi ngẫu nhiên bảo mật (crypto-random) và lưu vết dưới dạng băm HMAC-SHA256.
- **Quản lý phiên:** Ràng buộc một tài khoản chỉ có tối đa một phiên hoạt động (`ACTIVE`) tại cùng thời điểm. Đăng nhập mới tự động vô hiệu hóa phiên cũ (`REPLACED`).
- **Kiểm soát thiết bị:** Yêu cầu header `X-Device-Fingerprint` và đối sánh với vân tay thiết bị đã lưu trong phiên.

---

## 📂 Cấu Trúc Thư Mục Backend
```text
src/
├── config/         # Cấu hình hệ thống (Database, etc.)
├── constants/      # Khai báo hằng số (Role, SessionStatus, ErrorCodes)
├── controllers/    # Xử lý logic request/response
├── middlewares/    # Middleware (authenticate, authorize, validate-request, error)
├── repositories/   # Truy vấn SQL trực tiếp database (hỗ trợ client transaction)
├── routes/         # Khai báo các endpoints
├── services/       # Xử lý logic nghiệp vụ chính & Quản trị transactions
├── validators/     # Định nghĩa các bộ kiểm tra đầu vào (express-validator)
├── utils/          # Hàm tiện ích chung (jwt, password, token, hash, pagination)
├── errors/         # Lớp lỗi tùy chỉnh (AppError, BadRequestError...)
├── database/       # Script seed dữ liệu kiểm thử
├── uploads/        # Thư mục chứa hình ảnh upload
├── app.js          # Khởi tạo và thiết lập Express
└── server.js       # Điểm chạy máy chủ
```

---

## ⚙️ Hướng Dẫn Cài Đặt & Chạy Dự Án

### 1. Cài đặt thư viện
Trong thư mục gốc của dự án (`chamcong`), chạy lệnh sau để cài đặt các package:
```bash
npm install
```

### 2. Thiết lập cơ sở dữ liệu (PostgreSQL)
1. Tạo một cơ sở dữ liệu trống trên PostgreSQL (Ví dụ tên database: `chamcong`).
2. Chạy file SQL cấu trúc database nằm tại thư mục gốc để dựng bảng và cài đặt trigger:
   ```bash
   psql -U postgres -d chamcong -f Cham_Cong_Main_Database_Khong_Phan_Ca_Final.sql
   ```
   *(Hoặc import file thông qua pgAdmin/DBeaver)*

### 3. Cấu hình biến môi trường
1. Nhân bản file `.env.example` thành `.env`:
   ```bash
   cp .env.example .env
   ```
2. Cập nhật thông số kết nối DB và các tham số bảo mật của bạn.

#### Các biến cấu hình Authentication trong `.env`:
- `JWT_ACCESS_SECRET`: Chuỗi khóa bảo mật ký Access Token.
- `JWT_ACCESS_EXPIRES_IN`: Thời gian sống của Access Token (Ví dụ: `15m` - 15 phút).
- `REFRESH_TOKEN_EXPIRES_DAYS`: Thời hạn sống của Refresh Token (Ví dụ: `30` - 30 ngày).
- `REFRESH_TOKEN_HASH_SECRET`: Khóa dùng để băm Refresh Token trước khi lưu database.
- `BCRYPT_SALT_ROUNDS`: Số vòng lặp băm mật khẩu bằng bcrypt (Mặc định khuyên dùng: `12`).

### 4. Chạy Seeding dữ liệu kiểm thử
> [!WARNING]
> Lệnh seed chỉ sử dụng trong môi trường **Development / Testing**. Tuyệt đối **KHÔNG** chạy lệnh này trong môi trường sản xuất (Production) vì sẽ chèn các tài khoản mặc định có mật khẩu dễ đoán.

Chạy lệnh sau để thêm Department, 3 Role mặc định, 1 tài khoản ADMIN và 1 tài khoản EMPLOYEE kiểm thử:
```bash
npm run seed

**Chạy lệnh reset database**
docker exec chamcong-app-dev node scratch/reset-db.js


```


**Tài khoản kiểm thử tạo ra:**
- **Tài khoản Admin:**
  - Username: `admin`
  - Password: `Admin@123`
- **Tài khoản Employee:**
  - Username: `employee01`
  - Password: `Employee@123`

### 5. Chạy ứng dụng
- **Chế độ phát triển (Development):** Tự động reload khi sửa code bằng `nodemon`
  ```bash
  npm run dev
  ```
- **Chế độ sản xuất (Production):**
  ```bash
  npm start
  ```

---

## 📡 Ma Trận Quyền & Các Endpoint APIs

Mọi API được bảo vệ (Protected Routes) yêu cầu các thông tin sau:
1. **Token xác thực:** Gửi qua header `Authorization` dưới dạng `Bearer <Access_Token>`.
2. **Nhận diện thiết bị:** Gửi qua header `X-Device-Fingerprint` với giá trị vân tay thiết bị (trùng với vân tay lúc đăng nhập).

### 1. APIs Xác Thực (Authentication)
| Method | Endpoint | Bảo Vệ | Quyền Hạn | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| **POST** | `/api/auth/login` | Không | Tất cả | Đăng nhập và tự động tạo vân tay thiết bị |
| **POST** | `/api/auth/refresh-token` | Không | Tất cả | Làm mới Access Token bằng Refresh Token |
| **POST** | `/api/auth/logout` | Có | Tất cả | Đăng xuất, vô hiệu hóa phiên làm việc |
| **GET** | `/api/auth/me` | Có | Tất cả | Lấy thông tin cá nhân hiện tại |
| **GET** | `/api/auth/admin-only` | Có | `ADMIN` | Route kiểm thử phân quyền admin |

### 2. APIs Quản Lý Phòng Ban (Departments)
| Method | Endpoint | Bảo Vệ | Quyền Hạn | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| **GET** | `/api/admin/departments` | Có | `ADMIN`, `MANAGER` | Xem danh sách phòng ban (phân trang + lọc) |
| **GET** | `/api/admin/departments/:id` | Có | `ADMIN`, `MANAGER` | Xem chi tiết phòng ban & số nhân viên |
| **POST** | `/api/admin/departments` | Có | `ADMIN` | Tạo mới phòng ban |
| **PUT** | `/api/admin/departments/:id` | Có | `ADMIN` | Cập nhật thông tin phòng ban |
| **PATCH** | `/api/admin/departments/:id/status` | Có | `ADMIN` | Khóa hoặc mở lại phòng ban |

### 3. APIs Quản Lý Nhân Viên (Employees)
| Method | Endpoint | Bảo Vệ | Quyền Hạn | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| **GET** | `/api/admin/employees` | Có | `ADMIN`, `MANAGER` | Danh sách nhân viên (phân trang + tìm kiếm) |
| **GET** | `/api/admin/employees/:id` | Có | `ADMIN`, `MANAGER` | Xem chi tiết thông tin hồ sơ nhân viên & tài khoản |
| **POST** | `/api/admin/employees` | Có | `ADMIN` | Tạo nhân viên mới (chưa có tài khoản) |
| **POST** | `/api/admin/employees/with-account` | Có | `ADMIN` | Tạo nhân viên kèm tài khoản (Transaction) |
| **PUT** | `/api/admin/employees/:id` | Có | `ADMIN` | Cập nhật nhân viên (không sửa `employeeCode`) |
| **PATCH** | `/api/admin/employees/:id/status` | Có | `ADMIN` | Khóa hoặc mở lại nhân viên & tài khoản (Transaction) |
| **POST** | `/api/admin/employees/:employeeId/account` | Có | `ADMIN` | Tạo tài khoản cho nhân viên đã có |

### 4. APIs Quản Lý Tài Khoản & Vai Trò (Accounts & Roles)
| Method | Endpoint | Bảo Vệ | Quyền Hạn | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| **PATCH** | `/api/admin/accounts/:accountId/role` | Có | `ADMIN` | Đổi vai trò tài khoản & thu hồi session (Transaction) |
| **PATCH** | `/api/admin/accounts/:accountId/status` | Có | `ADMIN` | Khóa/Mở khóa tài khoản & thu hồi session (Transaction) |
| **PATCH** | `/api/admin/accounts/:accountId/reset-password` | Có | `ADMIN` | Đặt lại mật khẩu tài khoản & thu hồi session (Transaction) |
| **GET** | `/api/admin/roles` | Có | `ADMIN` | Xem danh sách các vai trò để tạo tài khoản |

### 5. APIs Quản Lý Địa Điểm Chấm Công (Work Locations)
| Method | Endpoint | Bảo Vệ | Quyền Hạn | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| **GET** | `/api/admin/work-locations` | Có | `ADMIN`, `MANAGER` | Xem danh sách địa điểm (phân trang + lọc keyword) |
| **GET** | `/api/admin/work-locations/:id` | Có | `ADMIN`, `MANAGER` | Xem chi tiết địa điểm (kèm số lượng phân công) |
| **POST** | `/api/admin/work-locations` | Có | `ADMIN` | Tạo địa điểm mới (Transaction) |
| **PUT** | `/api/admin/work-locations/:id` | Có | `ADMIN` | Cập nhật thông tin địa điểm (Transaction) |
| **PATCH** | `/api/admin/work-locations/:id/status` | Có | `ADMIN` | Khóa hoặc mở lại địa điểm (Transaction) |

### 6. APIs Quản Lý Phân Công Địa Điểm (Assignments)
| Method | Endpoint | Bảo Vệ | Quyền Hạn | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| **GET** | `/api/admin/assignments` | Có | `ADMIN`, `MANAGER` | Xem danh sách phân công (lọc ngày, nv, địa điểm...) |
| **GET** | `/api/admin/assignments/:id` | Có | `ADMIN`, `MANAGER` | Xem chi tiết phân công & thông tin liên đới |
| **POST** | `/api/admin/assignments` | Có | `ADMIN`, `MANAGER` | Tạo phân công mới cho nhân viên theo ngày (Transaction) |
| **PUT** | `/api/admin/assignments/:id` | Có | `ADMIN`, `MANAGER` | Cập nhật phân công khi chưa có chấm công (Transaction) |
| **PATCH** | `/api/admin/assignments/:id/cancel` | Có | `ADMIN`, `MANAGER` | Hủy phân công, cập nhật trạng thái CANCELLED (Transaction) |
| **GET** | `/api/employee/assignments/today` | Có | `EMPLOYEE` | Xem phân công hôm nay của chính mình |
| **GET** | `/api/employee/assignments` | Có | `EMPLOYEE` | Xem lịch sử phân công cá nhân (phân trang) |
| **GET** | `/api/employee/assignments/:id` | Có | `EMPLOYEE` | Xem chi tiết phân công cá nhân |

---

## 📖 Hướng Dẫn Nghiệp Vụ Đặc Thù

### 1. Phân Trang & Tìm Kiếm Bộ Lọc
Khi gọi danh sách phòng ban hoặc nhân viên, hỗ trợ các query parameters sau:
- `page`: Số trang muốn xem (Mặc định: `1`).
- `limit`: Số bản ghi mỗi trang (Mặc định: `10`, tối đa: `100`).
- `keyword`: Tìm kiếm gần đúng (Phòng ban: theo tên; Nhân viên: theo mã, tên, email, điện thoại).
- `status`: Lọc trạng thái hoạt động (`1`: Đang hoạt động, `0`: Bị khóa).
- `sortBy` / `sortOrder`: Whitelist các cột được phép sắp xếp cùng thứ tự `ASC` hoặc `DESC`.

**Phân trang được thực hiện hoàn toàn ở tầng SQL bằng `LIMIT $1 OFFSET $2` để tối ưu hiệu năng.**

### 2. Tạo Nhân Viên Kèm Tài Khoản (Transaction)
Sử dụng endpoint `POST /api/admin/employees/with-account`. Nếu quá trình tạo tài khoản lỗi (ví dụ trùng username), hệ thống tự động rollback và không tạo nhân viên để tránh rác dữ liệu.
- **Yêu cầu độ mạnh mật khẩu:** Mật khẩu phải dài tối thiểu 8 ký tự, bao gồm ít nhất 1 chữ hoa, 1 chữ thường, 1 chữ số, và 1 ký tự đặc biệt.
- **Email & Username:** Tự động chuẩn hóa viết thường (lowercase) trước khi so trùng và lưu trữ.

### 3. Khóa Nhân Viên / Tài Khoản & Thu Hồi Phiên Hoạt Động (Transaction)
- Khi khóa nhân viên (`employees.status = 0`) hoặc khóa tài khoản (`accounts.is_active = 0`), hệ thống sẽ tự động cập nhật toàn bộ session của tài khoản đó trong bảng `user_sessions` về trạng thái `'REVOKED'`, đặt `logout_at = NOW()`, xóa `refresh_token_hash`.
- Người dùng sử dụng token cũ của tài khoản đó sẽ lập tức bị đá ra khỏi hệ thống (trả về lỗi `401 SESSION_NOT_ACTIVE` ở request tiếp theo).

---

## 🔍 Cách Kiểm Tra Session Trực Tiếp Trong Database
Để xem thông tin các phiên đăng nhập đang hoạt động hoặc kiểm tra trạng thái hoạt động của hệ thống, bạn có thể thực hiện các câu lệnh SQL sau trên PostgreSQL:

1. **Xem toàn bộ phiên đang hoạt động (`ACTIVE`):**
   ```sql
   SELECT session_id, account_id, employee_id, device_fingerprint, device_name, login_at, last_activity_at 
   FROM public.user_sessions 
   WHERE session_status = 'ACTIVE';
   ```

2. **Xem phiên đã bị thu hồi (`REVOKED`):**
   ```sql
   SELECT session_id, account_id, session_status, logout_at 
   FROM public.user_sessions 
   WHERE session_status = 'REVOKED';
   ```

3. **Truy vấn nhật ký hệ thống hành động:**
   ```sql
   SELECT log_id, employee_id, action, description, device_fingerprint, status, action_time 
   FROM public.system_logs 
   ORDER BY action_time DESC;
   ```

---

## 🧪 Hướng Dẫn Chạy Test APIs

### 1. Kiểm thử thủ công bằng REST Client
Để kiểm thử thủ công các trường hợp nghiệp vụ, phân quyền, ràng buộc transaction:
1. **Kiểm thử Giai đoạn 1-3:** Mở file [admin-tests.http](file:///c:/Users/ACER/CHAMCONG/admin-tests.http) trong VS Code.
2. **Kiểm thử Giai đoạn 4 (Phân công & Địa điểm):** Mở file [phase4-tests.http](file:///c:/Users/ACER/CHAMCONG/phase4-tests.http) trong VS Code.
3. Cài đặt extension **REST Client** (của tác giả Huachao Mao).
4. Đảm bảo server đang chạy (`npm run dev` hoặc `npm start`).
5. Click lần lượt vào liên kết **Send Request** trên từng case kiểm thử và kiểm tra mã HTTP status cũng như mã lỗi trả về.

### 2. Kiểm thử tự động bằng Jest (Automated Integration Tests)
Để chạy các bộ kiểm thử tích hợp tự động toàn diện, thực hiện các lệnh sau:

* **Kiểm thử công thức khoảng cách Haversine:**
  ```bash
  npx jest src/tests/haversine.test.js
  ```
* **Kiểm thử 20 kịch bản Xác thực (Authentication):**
  ```bash
  npx jest src/tests/auth.test.js
  ```
* **Kiểm thử Quản lý Dữ liệu (Data Management):**
  ```bash
  npx jest src/tests/data-management.test.js
  ```
* **Kiểm thử Chấm công & Đồng bộ ngoại tuyến (Attendance & Offline Sync):**
  ```bash
  npx jest src/tests/attendance.test.js
  ```
* **Kiểm thử An toàn & Bảo mật (Security & Vulnerabilities):**
  ```bash
  npx jest src/tests/security.test.js
  ```

### 3. Đánh giá Hiệu năng Tải Đồng thời (Concurrency Performance Benchmark)
Giả lập spike tải đồng thời với 50 yêu cầu check-in/out liên tục của nhân viên:
```bash
node src/tests/performance.js
```

---

## 📅 Ràng Buộc & Tiêu Chuẩn Nghiệp Vụ Giai Đoạn 4

### 1. Không Quản Lý Ca Làm Việc (No Shifts)
Hệ thống chấm công được thiết kế tối giản, tập trung vào hiện trường, hoàn toàn **không** quản lý ca làm việc. Hệ thống không sử dụng:
* `shift_id`, `start_time`, `end_time`
* `planned_start_time`, `planned_end_time`
* Không tính đi muộn (`is_late`), về sớm (`is_early_leave`).
* Phân công chỉ chứa thông tin: Nhân viên, Địa điểm, Ngày làm việc, Ghi chú và Trạng thái.

### 2. Ràng Buộc Một Phân Công Mỗi Ngày (One Assignment Per Day)
* Mỗi nhân viên chỉ được phép có tối đa **một phân công** hoạt động trong một ngày.
* Ràng buộc này được thực thi ở tầng cơ sở dữ liệu bằng ràng buộc unique:
  ```sql
  CONSTRAINT uq_assignments_employee_date UNIQUE (employee_id, work_date)
  ```
* Tầng nghiệp vụ xử lý chống Race Condition bằng cách bắt lỗi trùng khóa unique vi phạm (`err.code === '23505'`) và chuyển đổi thành lỗi `ASSIGNMENT_ALREADY_EXISTS` (409).

### 3. Đồng Nhất Timezone Hệ Thống
* Định dạng ngày làm việc luôn tuân thủ chuẩn `YYYY-MM-DD`.
* Hệ thống tuyệt đối không tự động chuyển đổi ngày làm việc (`workDate`) dựa trên múi giờ của trình duyệt hay môi trường của client.
* Mọi xử lý ngày/giờ được đồng nhất ở backend theo múi giờ được cấu hình trong tệp `.env` thông qua biến:
  ```env
  APP_TIMEZONE=Asia/Ho_Chi_Minh
  ```
* Tiện ích `src/utils/date.js` sẽ định dạng ngày tháng tương ứng với cấu hình múi giờ này khi so sánh hoặc hiển thị.

### 4. Ghi Nhật Ký Hệ Thống Cho Mọi Thao Tác (System Audit Logs)
Mọi hành động tạo mới, cập nhật, kích hoạt, khóa địa điểm hoặc phân công đều được lưu vết trong bảng `system_logs` (thông qua Transaction) bao gồm:
* `employee_id` của người thực hiện (nếu có).
* `account_id` của người thực hiện.
* `action` (Tên hành động: `CREATE_WORK_LOCATION`, `UPDATE_WORK_LOCATION`, etc.).
* `description` (Mô tả chi tiết hành động).
* `device_fingerprint` & `ip_address` của client thực hiện.
* `status` (`SUCCESS` hoặc `FAILED`).
* `action_time` (Thời gian thực hiện).

---

## 📅 Ràng Buộc & Tiêu Chuẩn Nghiệp Vụ Giai Đoạn 5

### 1. APIs Chấm Công Online (Check-in / Check-out)
| Method | Endpoint | Bảo Vệ | Quyền Hạn | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| **POST** | `/api/attendance/check-in` | Có | `EMPLOYEE` | Chấm công vào (yêu cầu gửi photo dạng multipart/form-data). Trả về thông tin phân công (`assignedLocation`), vị trí check-in thực tế (`actualCheckInLocation`), và chỉ thị văn phòng công ty (`isCompanyLocation`). |
| **POST** | `/api/attendance/check-out` | Có | `EMPLOYEE` | Chấm công ra (yêu cầu gửi photo dạng multipart/form-data) |
| **GET** | `/api/attendance/today` | Có | `EMPLOYEE` | Lấy trạng thái chấm công và phân công hôm nay |
| **GET** | `/api/attendance/history` | Có | `EMPLOYEE` | Xem lịch sử chấm công của bản thân (phân trang + bộ lọc) |

### 2. Các tham số cấu hình mới trong `.env`
- `MAX_GPS_ACCURACY_METERS`: Ngưỡng độ chính xác GPS cho phép (mặc định: `100` mét).
- `REQUIRE_PWA_STANDALONE`: Cấu hình bắt buộc chạy ở chế độ PWA Standalone (`true`/`false`, mặc định: `false`).
- `UPLOAD_DIR`: Thư mục lưu trữ hình ảnh tải lên (mặc định: `uploads/attendance`).
- `MAX_IMAGE_SIZE_MB`: Dung lượng tối đa ảnh xác thực cho phép (mặc định: `5` MB).

### 3. Nghiệp Vụ Đặc Thù Giai Đoạn 5
- **Công Thức Haversine**: Tính toán khoảng cách địa lý (đơn vị: mét) giữa tọa độ thực tế của nhân viên và tọa độ mục tiêu của văn phòng mà không làm tròn quá sớm.
- **Location Risk & Trust Score**: Đánh giá độ tin cậy của vị trí (Thang điểm 100) và xếp loại rủi ro (`LOW`, `MEDIUM`, `HIGH`) dựa trên độ lệch bán kính, độ chính xác tín hiệu GPS, trạng thái PWA độc lập, và đối sánh thiết bị.
- **Lưu Trữ Ảnh An Toàn**: Ảnh tải lên được xử lý qua Multer, đặt tên ngẫu nhiên dạng UUID tránh đè file hoặc directory traversal, và lưu trữ dạng đường dẫn tương đối trong cơ sở dữ liệu.
- **Đảm Bảo Idempotency**: Sử dụng `clientRequestId` (UUID) để tránh gửi trùng lặp hoặc xử lý lại các giao dịch check-in/check-out thành công.
- **Log Request Bị Từ Chối (Type 2 Errors)**: Khi xác định được nhân viên từ token nhưng kiểm tra nghiệp vụ thất bại (như ngoài bán kính hoặc GPS yếu), hệ thống sẽ rollback nghiệp vụ chấm công, tự động xóa file ảnh tải lên, và mở một transaction độc lập để ghi nhật ký thất bại vào bảng `attendance_location_logs` với `validation_result = 'REJECTED'` nhằm lưu vết và hỗ trợ hậu kiểm.

---
 
## 📅 Ràng Buộc & Tiêu Chuẩn Nghiệp Vụ Giai Đoạn 6
 
### 1. APIs Nhận Diện Khuôn Mặt & Xác Thực Danh Tính
| Method | Endpoint | Bảo Vệ | Quyền Hạn | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| **POST** | `/api/v1/face/register` | Có | `EMPLOYEE` | Đăng ký khuôn mặt lần đầu (yêu cầu gửi photo dạng multipart/form-data) |
| **PUT** | `/api/v1/face` | Có | `EMPLOYEE` | Cập nhật hồ sơ khuôn mặt (yêu cầu gửi photo dạng multipart/form-data) |
| **DELETE** | `/api/v1/face` | Có | `EMPLOYEE` | Xóa (Soft Delete) hồ sơ khuôn mặt (cập nhật status = 0) |
| **GET** | `/api/v1/face` | Có | `EMPLOYEE` | Xem thông tin hồ sơ khuôn mặt (không chứa trường embedding) |
| **GET** | `/api/v1/face/status` | Có | `EMPLOYEE` | Kiểm tra trạng thái đăng ký khuôn mặt (đã đăng ký hay chưa) |
| **POST** | `/api/v1/face/verify` | Có | `EMPLOYEE` | Xác thực khuôn mặt thủ công (không lưu vết chấm công) |
 
### 2. Nghiệp Vụ Đặc Thù Giai Đoạn 6
- **Tích Hợp AI Pipeline**: Sử dụng `MediaPipe` để phát hiện khuôn mặt, landmark khuôn mặt, căn chỉnh xoay và cắt ảnh, và kiểm tra chất lượng ảnh (độ mờ, thiếu sáng, kích thước khuôn mặt). Sử dụng `TensorFlow` để sinh vector embedding 128 chiều và tính toán độ trùng khớp Cosine Similarity.
- **Tích Hợp Vào Giao Dịch Chấm Công**: Tích hợp xác thực khuôn mặt vào giao dịch check-in và check-out. Nếu nhân viên chưa đăng ký khuôn mặt (`FACE_PROFILE_NOT_FOUND`) hoặc độ trùng khớp dưới ngưỡng (`SIMILARITY_TOO_LOW`), toàn bộ giao dịch chấm công sẽ bị rollback, và hệ thống sẽ tự động ghi log lỗi Type 2.
- **Ghi Nhật Ký Kiểm Toán (Audit Logs)**: Tự động ghi nhận log hệ thống cho các hành động đăng ký, cập nhật, xóa, xác thực khuôn mặt thành công/thất bại, và các lỗi hệ thống AI.
- **Kiểm Thử Tích Hợp**: Bộ kiểm thử tích hợp 37 trường hợp chạy tự động qua `node scratch/run-phase6-tests.js`.
