# ⚙️ SYSTEM BACKEND API & AI ENGINE
> **Dịch vụ Máy chủ Backend & Xử lý Trí tuệ Nhân tạo (AI)** cho Hệ thống Chấm công Nhân viên Kỹ thuật Hiện trường.

---

## 📌 1. Tổng Quan Về Backend

Backend là trung tâm xử lý dữ liệu và logic nghiệp vụ của toàn bộ hệ thống chấm công hiện trường. Được xây dựng trên nền tảng **Node.js, Express.js và PostgreSQL**, tích hợp **Mô hình AI TensorFlow.js** trực tiếp trên server để xác thực khuôn mặt và liveness.

### 🌟 Các Nhiệm Vụ Chính Của Backend:
1. **Quản lý Xác thực & Bảo mật**: Cấp phát JWT Access Token (15m) & Refresh Token (30 ngày), mã hóa mật khẩu bằng `bcrypt` (12 salt rounds), kiểm soát vân tay thiết bị (`X-Device-Fingerprint`).
2. **Tính Toán Vị Trí & Geofencing (Công thức Haversine)**: Tính khoảng cách địa lý chính xác (mét) giữa tọa độ GPS của nhân viên và địa điểm làm việc được phân công.
3. **Engine Nhận Diện Khuôn Mặt AI (Face Recognition)**: Trích xuất vector đặc trưng 128D (Face Embedding) và tính toán khoảng cách Euclidean/Cosine Similarity để so khớp danh tính.
4. **Đồng Bộ Ngoại Tuyến (Offline Sync Handler)**: Tiếp nhận và xử lý các bản ghi chấm công được lưu tạm từ máy nhân viên khi mất mạng.
5. **Đánh Giá Rủi Ro Vị Trí (Location Risk & Trust Score)**: Tính điểm tin cậy (0-100) dựa trên khoảng cách, sai số GPS, môi trường PWA, và phân loại rủi ro (`LOW`, `MEDIUM`, `HIGH`, `NO_GPS`).
6. **Hàng Đợi Kiểm Duyệt Admin (Review Queue Service)**: Tự động phát hiện các lượt chấm công ngoài bán kính (>100m) hoặc mất GPS để đưa vào danh sách chờ Admin phê duyệt.

---

## 🛠️ 2. Công Nghệ & Thư Viện Sử Dụng

- **Runtime Environment:** Node.js v20+
- **Web Framework:** Express.js
- **Database Management System:** PostgreSQL 18 + Connection Pooling (`pg`)
- **Trí Tuệ Nhân Tạo (AI Engine):** TensorFlow.js (`@tensorflow/tfjs-node`), MediaPipe Vision, Face-API.js (SSD MobileNetV1 & 68-Landmark Net)
- **Bảo mật & Mã hóa:** `bcrypt`, `jsonwebtoken`, `crypto` (băm SHA256 cho Refresh Token), `helmet`, `cors`
- **Tải lên tệp tin:** `multer` (xử lý ảnh đính kèm Check-in/Check-out dạng multipart/form-data)

---

## 📂 3. Cấu Trúc Thư Mục Backend (`/backend/src`)

```text
src/
├── config/             # Cấu hình Database PostgreSQL, JWT, AI threshold, Multer
├── constants/          # Định nghĩa hằng số hệ thống (Role, Status, RiskLevel, ErrorCodes)
├── controllers/        # Tiếp nhận HTTP Requests & Trả lời Response
├── database/           # Script seed dữ liệu khởi tạo & Migration SQL
├── errors/             # Định nghĩa các lớp lỗi chuẩn (AppError, UnauthorizedError...)
├── middlewares/        # Kiểm tra token, phân quyền, validate tham số, xử lý lỗi
├── repositories/       # Thực thi truy vấn SQL trực tiếp CSDL (hỗ trợ DB Transaction)
├── routes/             # Định nghĩa các tuyến đường Endpoints RESTful API
├── services/           # Xử lý Logic Nghiệp vụ chính (Attendance, Assignment, AI, Auth)
├── utils/              # Hàm tiện ích (Haversine distance, Location risk, Date/Timezone)
├── validators/         # Kiểm tra tính hợp lệ của dữ liệu đầu vào (express-validator)
├── app.js              # Khởi tạo Express App, Middleware & Router
└── server.js           # Điểm khởi chạy Máy chủ Node.js
```

---

## 🚀 4. Hướng Dẫn Cài Đặt & Chạy Server Backend

### 1. Cài đặt thư viện dependencies
```bash
cd backend
npm install
```

### 2. Thiết lập cơ sở dữ liệu PostgreSQL
1. Tạo CSDL tên `CHAM_CONG` trong PostgreSQL.
2. Chạy file SQL tạo bảng và trigger:
   ```bash
   psql -U postgres -d CHAM_CONG -f Cham_Cong_Main_Database_Khong_Phan_Ca_Final.sql
   ```

### 3. Cấu hình biến môi trường (`.env`)
Nhân bản file `.env.example` thành `.env` và cập nhật thông số:
```env
PORT=3000
NODE_ENV=development
APP_TIMEZONE=Asia/Ho_Chi_Minh

# PostgreSQL Config
DB_HOST=localhost
DB_PORT=5432
DB_NAME=CHAM_CONG
DB_USER=postgres
DB_PASSWORD=your_password

# Authentication Config
JWT_ACCESS_SECRET=your_jwt_access_secret_key
JWT_ACCESS_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_DAYS=30
REFRESH_TOKEN_HASH_SECRET=your_refresh_token_hash_secret
BCRYPT_SALT_ROUNDS=12

# Geofence & Location Config
MAX_GPS_ACCURACY_METERS=100
```

### 4. Khởi tạo dữ liệu mẫu (Seed Data)
```bash
# Thêm các phòng ban, vai trò, địa điểm mẫu và tài khoản Admin / Employee kiểm thử
npm run seed
```

**Tài khoản kiểm thử sau khi Seed:**
- **Tài khoản Admin:** `admin` / `Admin@123`
- **Tài khoản Employee:** `employee01` / `Employee@123`

### 5. Khởi chạy Server
- **Chế độ phát triển (Development mode - Auto Reload):**
  ```bash
  npm run dev
  ```
- **Chế độ sản xuất (Production mode):**
  ```bash
  npm start
  ```

---

## 📡 5. Danh Sách Endpoints API Chính

Mọi API được bảo vệ (Protected) yêu cầu gửi kèm các Headers:
- `Authorization: Bearer <Access_Token>`
- `X-Device-Fingerprint: <Device_Fingerprint_Hash>`

### 🔑 5.1. Authentication APIs (`/api/auth`)
| Method | Endpoint | Quyền hạn | Mô tả |
| :--- | :--- | :--- | :--- |
| **POST** | `/api/auth/login` | Public | Đăng nhập tài khoản, tự tạo phiên và vân tay thiết bị |
| **POST** | `/api/auth/refresh-token` | Public | Đổi Refresh Token lấy Access Token mới |
| **POST** | `/api/auth/logout` | Token | Đăng xuất và vô hiệu hóa phiên làm việc |
| **GET** | `/api/auth/me` | Token | Lấy thông tin tài khoản và thông tin nhân viên |

### ⏱️ 5.2. Attendance APIs (`/api/attendance`)
| Method | Endpoint | Quyền hạn | Mô tả |
| :--- | :--- | :--- | :--- |
| **POST** | `/api/attendance/check-in` | `EMPLOYEE` | Check-in (Gửi ảnh khuôn mặt + vị trí GPS + minh chứng) |
| **POST** | `/api/attendance/check-out` | `EMPLOYEE` | Check-out (Gửi ảnh khuôn mặt + vị trí GPS + minh chứng) |
| **GET** | `/api/attendance/today` | `EMPLOYEE` | Trạng thái ca làm việc và lượt chấm công hôm nay |
| **GET** | `/api/attendance/history` | `EMPLOYEE` | Xem lịch sử chấm công cá nhân (Phân trang + Lọc) |

### 📸 5.3. Face AI APIs (`/api/v1/face`)
| Method | Endpoint | Quyền hạn | Mô tả |
| :--- | :--- | :--- | :--- |
| **POST** | `/api/v1/face/register` | `EMPLOYEE` | Đăng ký khuôn mặt gốc (Lưu vector 128D Embedding) |
| **GET** | `/api/v1/face/status` | `EMPLOYEE` | Kiểm tra trạng thái đã đăng ký khuôn mặt hay chưa |
| **POST** | `/api/v1/face/verify` | `EMPLOYEE` | Thử nghiệm so khớp khuôn mặt với ảnh đính kèm |

### 📋 5.4. Review Queue & Admin APIs (`/api/admin`)
| Method | Endpoint | Quyền hạn | Mô tả |
| :--- | :--- | :--- | :--- |
| **GET** | `/api/admin/review-queue` | `ADMIN`, `MANAGER` | Lấy danh sách lượt chấm công chờ Admin phê duyệt |
| **POST** | `/api/admin/review-queue/review` | `ADMIN`, `MANAGER` | Phê duyệt (APPROVED) hoặc Từ chối (REJECTED) lượt chấm |
| **GET** | `/api/admin/attendance` | `ADMIN`, `MANAGER` | Xem danh sách chấm công toàn hệ thống |
| **GET** | `/api/admin/reports/summary` | `ADMIN`, `MANAGER` | Thống kê số giờ công, đúng giờ, trễ/sớm toàn công ty |

---

## ⚙️ 6. Quy Tắc Duyệt Tự Động & Hàng Đợi Admin Review

Hệ thống chấm công vận hành theo quy tắc phân loại thông minh:

```text
                             [LƯỢT CHẤM CÔNG]
                                     │
                 ┌───────────────────┴───────────────────┐
                 ▼                                       ▼
    [Quét mặt KHÔNG KHIẾP                 [Quét mặt THÀNH CÔNG
   HOẶC sai quá 2 lần]                     VÀ Vị trí GPS chuẩn]
                 │                                       │
                 ▼                                       ▼
     ⚠️ Bắt buộc gửi Admin                    ┌──────────┴──────────┐
    (REVIEW_REQUIRED / PENDING)               ▼                     ▼
                                     [Khoảng cách <= 100m]  [Vượt bán kính > 100m
                                              │              OR Không có GPS]
                                              ▼                     │
                                     ✅ TỰ ĐỘNG CHẤM CÔNG           ▼
                                     (IN_PROGRESS / COMPLETED)  ⚠️ Bắt buộc gửi Admin
                                                                (REVIEW_REQUIRED)
```

---

## 🧪 7. Kiểm Thử Tự Động (Automated Testing)

Chạy các bộ unit/integration test suite bằng Jest:

```bash
# Test công thức tính khoảng cách GPS Haversine
npx jest src/tests/haversine.test.js

# Test bộ 20 kịch bản Đăng nhập / Token / Fingerprint
npx jest src/tests/auth.test.js

# Test quy trình Check-in, Check-out & Review Queue
npx jest src/tests/attendance.test.js

# Test 37 kịch bản Nhận diện khuôn mặt AI Pipeline
node scratch/run-phase6-tests.js
```

---

## 🛡️ License & Copyright
Dự án được bảo hộ quyền sở hữu trí tuệ cho hệ thống quản trị nhân sự hiện trường.
