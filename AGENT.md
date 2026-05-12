# AGENT.md — คู่มือสำหรับ AI Agent ผู้พัฒนาโปรเจกนี้

> ⚠️ **อ่านไฟล์นี้ทั้งหมดก่อนเริ่มงานทุกครั้ง**
> เอกสารนี้คือแหล่งอ้างอิงหลักที่ Agent ทุกตัวต้องปฏิบัติตาม เพื่อให้ทำงานร่วมกันได้อย่างลื่นไหลโดยไม่ทำลายระบบเดิม

---

## 📌 ภาพรวมโปรเจก

**ชื่อระบบ:** ระบบเบิกพัสดุภายในองค์กร (EMETIX — Elite Requisition System)
**วัตถุประสงค์:** ระบบจัดการคลังพัสดุ การเบิกของ การอนุมัติ และการติดตามสต๊อกสำหรับองค์กร
**ภาษา:** Thai (UI/UX) + English (Code/Variables)

### Dual-Environment Deployment

โปรเจกนี้มี **2 Environment** ที่ต้องดูแลพร้อมกัน:

| Environment | Path | Stack | หน้าที่ |
|:---|:---|:---|:---|
| **Google Apps Script (GAS)** | `clothing-store/` | GAS + Google Sheets + HTML Service | Production หลัก (Backend Only) |
| **Vercel** | `clothing-store-vercel/` | Static HTML/JS + GAS REST API | Production หลัก (Frontend Only) |

> [!IMPORTANT]
> เมื่อแก้ไขไฟล์ **Backend** (.gs) ให้แก้ที่ `clothing-store/` เท่านั้น
> เมื่อแก้ไข **Frontend** (html, css, js ทั้งหมด) **ต้องแก้ไขที่ `clothing-store-vercel/` เท่านั้น** 
> ห้ามแก้ไขไฟล์ .html ใน `clothing-store/` เนื่องจากถือเป็นไฟล์ Legacy/Deprecated 

---

## 🏗️ สถาปัตยกรรมระบบ (Architecture)

```
┌──────────────────────────────────────────────────────┐
│                    FRONTENDS                         │
│                                                      │
│  ┌─────────────────┐     ┌─────────────────────┐     │
│  │  GAS HTML       │     │  Vercel Static       │    │
│  │  (index.html)   │     │  (index.html)        │    │
│  │  Uses:          │     │  Uses:               │    │
│  │  google.script  │     │  fetch() → REST API  │    │
│  │  .run()         │     │  (webapp.gs/doPost)  │    │
│  └────────┬────────┘     └──────────┬───────────┘    │
│           │                         │                │
│           ▼                         ▼                │
│  ┌─────────────────────────────────────────────┐     │
│  │            API.gs (processAction)           │     │
│  │            Central Dispatcher               │     │
│  │  - Auth Check (_getCurrentUser)             │     │
│  │  - RBAC (_checkPermission)                  │     │
│  │  - Audit Logging (_logAudit)                │     │
│  │  - Route → Business Logic                   │     │
│  └─────────────────┬───────────────────────────┘     │
│                    │                                 │
│  ┌─────────────────▼───────────────────────────┐     │
│  │          BUSINESS LOGIC LAYER               │     │
│  │  inventory.gs  │ Request.gs  │ auth.gs      │     │
│  │  report.gs     │ approval.gs │ cache.gs     │     │
│  │  notification.gs │ validation.gs             │     │
│  └─────────────────┬───────────────────────────┘     │
│                    │                                 │
│  ┌─────────────────▼───────────────────────────┐     │
│  │           DATA ACCESS LAYER                 │     │
│  │  database.gs                                │     │
│  │  _findRow / _updateRow / _appendRow / etc.  │     │
│  └─────────────────┬───────────────────────────┘     │
│                    │                                 │
│  ┌─────────────────▼───────────────────────────┐     │
│  │          Google Sheets (Database)           │     │
│  │  Spreadsheet ID ใน _config.gs               │     │
│  └─────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────┘
```

---

## 📂 โครงสร้างไฟล์ (File Map)

### Backend — Google Apps Script (`clothing-store/`)

| ไฟล์ | หน้าที่ | ความสำคัญ |
|:---|:---|:---|
| `_config.gs` | ค่าคงที่, Roles, Permissions, Status, RBAC Mapping | 🔴 CRITICAL |
| `API.gs` | Central Dispatcher (`processAction`), Auth, RBAC Check | 🔴 CRITICAL |
| `Code.gs` | Entry Point (`doGet`), HTML Include | 🔴 CRITICAL |
| `webapp.gs` | REST API สำหรับ Vercel (`doPost`, CORS) | 🔴 CRITICAL |
| `database.gs` | Data Access Layer (CRUD, Lock, Cache Invalidation) | 🔴 CRITICAL |
| `auth.gs` | Login, Password, Employee CRUD, Permission Helpers | 🔴 CRITICAL |
| `cache.gs` | CacheService Wrapper (Chunked Large Cache) | 🟡 HIGH |
| `Request.gs` | ใบเบิก: สร้าง, อนุมัติ, จ่าย, เซ็นรับ, Sub-stock | 🟡 HIGH |
| `inventory.gs` | สินค้า, หมวดหมู่, คลังหลัก/ย่อย, ทีม, สาขา | 🟡 HIGH |
| `validation.gs` | Sanitize, Stock Check, Budget Check, Payload Validation | 🟡 HIGH |
| `notification.gs` | LINE Notify, Queue System, System Settings | 🟢 MEDIUM |
| `report.gs` | Dashboard Stats, Monthly Trends, Reports | 🟢 MEDIUM |
| `Upload.gs` | Google Drive File Upload | 🟢 MEDIUM |
| `Debug.gs` | Debug/Test Utilities | ⚪ LOW |
| `Tests.gs` | Automated Test Suite | ⚪ LOW |

> [!CAUTION]
> **ห้ามแก้ไขไฟล์ .html / .js.html ในโฟลเดอร์ `clothing-store/`** 
> ไฟล์เหล่านั้นถือเป็นไฟล์เก่า (Legacy) และไม่ได้ถูกใช้งานในระบบปัจจุบัน 
> การพัฒนา Frontend ทั้งหมดต้องทำในโฟลเดอร์นี้ (`clothing-store-vercel/`) เท่านั้น

### Frontend — HTML Pages (`clothing-store-vercel/`)
| ไฟล์ (Vercel) | หน้าที่ |
|:---|:---|
| `index.html` | หน้าร้าน (Storefront) — สำหรับพนักงานเบิกของ |
| `admin.html` | Admin Panel — จัดการทุกอย่าง (3,000+ บรรทัด) |
| `manager.html` | หน้าผู้อนุมัติ — อนุมัติ/ปฏิเสธใบเบิก |
| `login.html` | หน้า Login |
| `scanner.html` | QR/Barcode Scanner (ถ่ายรูป → อ่านรหัส) |
| `style.css` / `style.html` | Design System (Midnight Gold Theme) |

### Frontend — JavaScript (`clothing-store-vercel/`)

| ไฟล์ (Vercel) | หน้าที่ |
|:---|:---|:---|
| `api.js` | API Adapter (GAS ใช้ `google.script.run`, Vercel ใช้ `fetch`) |
| `app.js` | Storefront Logic |
| `cart.js` | Shopping Cart |

---

## 🔐 ระบบสิทธิ์ (RBAC)

### บทบาท (Roles) — ตามลำดับอำนาจจากสูงสุด

| Role | ความหมาย | สิทธิ์หลัก |
|:---|:---|:---|
| `superadmin` | ผู้ดูแลระบบสูงสุด | **เข้าถึงได้ทุกอย่างโดยอัตโนมัติ** (Master Bypass) |
| `admin` | แอดมิน | จัดการสินค้า, พนักงาน, อนุมัติ, จ่ายของ, **เซ็นรับแทนทุกคน** |
| `manager` | ผู้จัดการ | อนุมัติ/ปฏิเสธใบเบิก (เฉพาะแผนกตัวเอง), ดูรายงาน |
| `hr` | ฝ่ายบุคคล | จัดการพนักงาน, ดูรายงาน, จัดการคลัง |
| `fc` | FC | จัดการคลัง, สร้างใบเบิก, รับของ |
| `technician` | ช่างเทคนิค | ดูสินค้า, สร้างใบเบิก, จัดการคลัง |
| `employee` | พนักงานทั่วไป | ดูสินค้า, สร้างใบเบิก, รับของ (เฉพาะของตัวเอง) |

### Permission Constants — ดูที่ `_config.gs > PERMS`

```javascript
PERMS.VIEW_PRODUCTS, PERMS.MANAGE_PRODUCTS, PERMS.MANAGE_CATEGORIES,
PERMS.MANAGE_INVENTORY, PERMS.CREATE_REQUEST, PERMS.VIEW_MY_REQUESTS,
PERMS.VIEW_ALL_REQUESTS, PERMS.APPROVE_REQUEST, PERMS.DISPATCH_REQUEST,
PERMS.RECEIVE_REQUEST, PERMS.VIEW_EMPLOYEES, PERMS.MANAGE_EMPLOYEES,
PERMS.MANAGE_STRUCTURE, PERMS.VIEW_DASHBOARD, PERMS.VIEW_REPORTS,
PERMS.MANAGE_SETTINGS, PERMS.EXPORT_DATA
```

### วิธีตรวจสอบสิทธิ์

| Layer | ฟังก์ชัน | ใช้งาน |
|:---|:---|:---|
| API Gateway | `_checkPermission(user, action)` | ตรวจสอบก่อนเข้าถึง Action (อัตโนมัติ) |
| Business Logic | `_requirePermission(empId, perm)` | ตรวจสอบ Permission เฉพาะจุด |
| Business Logic | `_requireRole(empId, roles[])` | ตรวจสอบ Role เฉพาะจุด (Legacy) |
| Frontend | `API.hasPermission(perm)` | ซ่อน/แสดง UI ตามสิทธิ์ |
| Frontend | `API.hasRole(role)` | ตรวจ Role ที่ Frontend |

> [!CAUTION]
> **Superadmin/Owner จะข้ามการตรวจสอบทุกอย่างเสมอ** — หากเพิ่มการตรวจสอบสิทธิ์ใหม่ ต้องมั่นใจว่ามี Master Bypass สำหรับ Superadmin

---

## 💾 Database Schema (Google Sheets)

### ตารางหลัก

| Sheet Name | Primary Key | หน้าที่ |
|:---|:---|:---|
| `Employees` | `employeeId` | ข้อมูลพนักงาน, Role, Session Token |
| `Products` | `productId` | สินค้า, สต็อก, ไซส์ (variantStock = JSON) |
| `Categories` | `categoryId` | หมวดหมู่สินค้า |
| `Orders` | `orderId` | ใบเบิก (Header) |
| `OrderItems` | `orderItemId` | รายละเอียดสินค้าในใบเบิก |
| `Approvals` | `approvalId` | ประวัติการอนุมัติ/ปฏิเสธ |
| `INVENTORY_LOGS` | `logId` | ประวัติการเคลื่อนไหวสต็อก |
| `SUB_STOCK` | `id` | คลังย่อย (แชร์รายทีมถ้ามีทีม / รายบุคคลถ้าไม่มี) |
| `Teams` | `teamId` | ทีมช่าง |
| `Branches` | `branchId` | สาขา |
| `Departments` | `departmentId` | แผนก + งบประมาณ |
| `AuditLogs` | `logId` | ประวัติการใช้งานระบบ |

### สถานะใบเบิก (Order Flow)

```
Pending → Approved → Ready → Dispatched → Received
                  ↘ Rejected
                  ↘ Cancelled
```

| Status | ความหมาย | ใครเปลี่ยน |
|:---|:---|:---|
| `Pending` | รออนุมัติ | ระบบ (เมื่อสร้างใบเบิก) |
| `Approved` | อนุมัติแล้ว | Manager/Admin |
| `Ready` | จัดของเสร็จ | Admin (กดจัดเสร็จแล้ว) |
| `Dispatched` | จ่ายของแล้ว (ตัดสต็อก) | Admin (กดจ่ายของ) |
| `Received` | รับของแล้ว (เซ็นชื่อ) | เจ้าของ / Admin / Superadmin |
| `Rejected` | ไม่อนุมัติ | Manager/Admin |

---

## 🔧 Coding Conventions

### ภาษาและ Syntax

```
- ใช้ `var` ทุกที่ (GAS ไม่รองรับ let/const อย่างเต็มรูป ในบาง Runtime)
- ห้ามใช้ Arrow Functions (=>) ในไฟล์ .gs (ใช้ได้เฉพาะใน .html/.js)
- ใช้ `function(){}` แบบ ES5 ในไฟล์ .gs เสมอ
- ใช้ `.indexOf()` แทน `.includes()` ในไฟล์ .gs
- ใช้ `.filter(function(x){})` แทน `.filter(x => {})` ในไฟล์ .gs
- ในไฟล์ Frontend (.html, .js) สามารถใช้ ES6+ ได้
```

### Naming Conventions

```
- ฟังก์ชันสาธารณะ: camelCase          → getProducts(), createRequest()
- ฟังก์ชัน Internal: _prefixCamelCase  → _findRow(), _checkPermission()
- ค่าคงที่: UPPER_SNAKE              → CONFIG, SHEETS, PERMS, ORDER_STATUS
- Sheet Names: PascalCase              → 'Employees', 'OrderItems'
- ID Prefix: 3 ตัวพิมพ์ใหญ่           → REQ-, PRD-, INV-, APP-, CAT-, TM-
```

### Error Handling Pattern

```javascript
// ทุกฟังก์ชัน Public ต้อง return Object ที่มี success
return { success: true, data: result };
return { success: false, message: 'เหตุผลที่ล้มเหลว' };
```

### Data Mutation Pattern

```javascript
// 1. Lock → 2. Validate → 3. Mutate → 4. Invalidate Cache → 5. Log → 6. Release Lock
var lock = LockService.getScriptLock();
try {
  lock.waitLock(10000);
  // validate...
  // mutate...
  invalidateProductCache();   // ล้างแคชที่เกี่ยวข้อง
  _logAudit(userId, action, detail);
} finally {
  lock.releaseLock();
}
```

### Cache Invalidation — ต้องทำทุกครั้งที่แก้ข้อมูล

| เมื่อแก้ไข | ต้องเรียก |
|:---|:---|
| Products | `invalidateProductCache()` |
| Categories | `invalidateCategoryCache()` + `invalidateProductCache()` |
| Employees | `invalidateEmployeeCache()` |
| อื่นๆ | `invalidateRequestCache(sheetName)` |

---

## 🎨 Design System

### Theme: **Midnight Gold**

```css
--bg:      #0a0a0f        /* พื้นหลังหลัก (เกือบดำ) */
--surface: #12121a        /* Card/Modal Background */
--primary: #fbbf24        /* สีทอง (Accent หลัก) */
--accent:  #22c55e        /* สีเขียว (สำเร็จ/ยืนยัน) */
--danger:  #ef4444        /* สีแดง (ลบ/ข้อผิดพลาด) */
--text1:   #f8fafc        /* ตัวอักษรหลัก (ขาว) */
--text2:   #94a3b8        /* ตัวอักษรรอง (เทาอ่อน) */
--text3:   #64748b        /* ตัวอักษรจาง (เทาเข้ม) */
--border:  rgba(255,255,255,0.06)
```

### UI Components Pattern

```
- Glass Cards: background: rgba + backdrop-filter: blur
- Smooth Transitions: transition: all 0.3s
- Hover Effects: transform: translateY(-2px) + box-shadow
- Badge Colors: badge-pending (เหลือง), badge-approved (เขียว), badge-rejected (แดง)
- Loading: <div class="spinner"></div>
- Toast: showToast(message, type) — type: success/error/warning/info
```

### Typography

```
- Font Stack: 'Inter', 'IBM Plex Sans Thai', 'Noto Sans Thai', sans-serif
- ใช้ Lucide Icons (สำหรับ icon ทั้งหมด)
```

---

## ⚡ API Communication Patterns

### GAS Environment (clothing-store)

```javascript
// Frontend เรียก Backend ผ่าน google.script.run
google.script.run
  .withSuccessHandler(callback)
  .withFailureHandler(errorHandler)
  .processAction({ action: 'getProducts', data: {}, user: currentUser });
```

### Vercel Environment (clothing-store-vercel)

```javascript
// Frontend เรียก Backend ผ่าน REST API (fetch → webapp.gs/doPost)
API._call('getProducts', { filter: {} }, true);
// ภายในใช้ fetch(GAS_URL, { method: 'POST', body: JSON.stringify(payload) })
```

### API Payload Structure

```javascript
{
  action: 'actionName',          // ชื่อ Action (ดูรายการใน API.gs switch)
  data: { /* parameters */ },    // ข้อมูลที่ส่งไป
  user: { employeeId, role, ... }, // ข้อมูลผู้ใช้ (จาก localStorage)
  token: 'session_token'          // Session Token
}
```

---

## ⚠️ กฎเหล็ก (CRITICAL RULES)

### ❌ ห้ามทำ

1. **ห้ามใช้ let/const/arrow ใน .gs** — GAS Runtime เก่าอาจ crash
2. **ห้ามลบ Sheet Headers** — `setupSpreadsheet()` จะสร้างใหม่แต่ข้อมูลเก่าอาจเสียหาย
3. **ห้ามเปลี่ยน CONFIG.SPREADSHEET_ID** โดยไม่ได้รับอนุญาต
4. **ห้าม Rewrite ไฟล์ทั้งไฟล์** — แก้เฉพาะส่วนที่เกี่ยวข้อง
5. **ห้ามลบ Backward Compatibility** — ฟังก์ชันเก่าที่มีการเรียกใช้ต้องคงไว้
6. **ห้ามลบ Comments ที่มี `[FIX]`, `[BUG]`, `[CRITICAL]`** — เป็นบันทึกแก้บัก
7. **ห้าม hardcode API Keys/Tokens** — ใช้ `CONFIG` หรือ `PropertiesService`
8. **ห้ามแก้ api.js ฝั่ง Vercel โดยไม่แก้ api.js.html ฝั่ง GAS ด้วย** (หรือกลับกัน)
9. **ห้ามแก้ไขไฟล์โดยไม่จำเป็น**
10. **ห้ามเดาสุ่ม**
11. **ห้ามแก้โค้ดโดยไม่วิเคราะห์**
12. **ห้าม rewrite โดยไม่จำเป็น**
13. **ห้ามทำให้ระบบเดิมพัง**

### ✅ ต้องทำ

1. **ทดสอบก่อน Deploy** — ใช้ `Debug.gs` หรือ `Tests.gs`
2. **Invalidate Cache** หลังทุกการ Mutate ข้อมูล
3. **ใช้ LockService** สำหรับทุก Write Operation ที่สำคัญ
4. **ส่ง `{ success: boolean, message?: string }` เสมอ** จากทุกฟังก์ชัน Backend
5. **เพิ่ม Action ใหม่ใน `_checkPermission` actionToPerm** เมื่อสร้าง Action ใหม่
6. **เพิ่ม Action ใหม่ใน `mutationActions`** (API.gs) ถ้าเป็น Write Action
7. **เรียก `refreshIcons()`** หลังทุกครั้งที่ render HTML ใหม่ที่มี Lucide Icons
8. **รักษา Ownership Check** — ยกเว้น Admin/Superadmin ที่ได้รับ Bypass อย่างชัดเจน

---

## 🔄 ขั้นตอนเมื่อเพิ่ม Feature ใหม่

### 1. เพิ่ม API Action ใหม่

```
1. เขียนฟังก์ชัน Business Logic ในไฟล์ .gs ที่เหมาะสม
2. เพิ่ม case ใน API.gs > processAction switch
3. เพิ่ม Permission Mapping ใน API.gs > _checkPermission > actionToPerm
4. (ถ้าเป็น Write Action) เพิ่มใน mutationActions Array
5. เพิ่ม API method ใน api.js.html (GAS) และ api.js (Vercel)
6. เรียกใช้จาก Frontend
```

### 2. เพิ่ม Sheet/ตารางใหม่

```
1. เพิ่มชื่อ Sheet ใน _config.gs > SHEETS
2. เพิ่ม Schema ใน database.gs > setupSpreadsheet > schemas[]
3. สร้างฟังก์ชัน CRUD ที่ใช้ _findRow, _appendRow, _updateRow
```

### 3. เพิ่ม Role/Permission ใหม่

```
1. เพิ่ม Role ใน _config.gs > APP_ROLES
2. เพิ่ม Permission ใน _config.gs > PERMS
3. สร้าง ROLE_PERMS mapping สำหรับ Role ใหม่
4. เพิ่ม Permission ใน api.js > PERMS (Frontend)
5. อัปเดต UI ใน admin.html (Role dropdown, Settings)
```

---

## 🧪 การทดสอบ

### ไฟล์ทดสอบ

- `Tests.gs` — Automated Test Suite (รัน `runAllTests()`)
- `Debug.gs` — Debug Functions สำหรับตรวจสอบข้อมูล
- `RunTests.gs` — Test Runner

### วิธีทดสอบ

```
1. เปิด Google Apps Script Editor
2. เลือกฟังก์ชัน runAllTests
3. กด Run
4. ดูผลลัพธ์ใน Execution Log
```

---

## 📋 ข้อมูลอ้างอิงด่วน

### External Dependencies (CDN)

| Library | Version | ใช้งาน |
|:---|:---|:---|
| Lucide Icons | latest | Icons ทั้งระบบ |
| Chart.js | latest | Graphs/Charts ใน Dashboard |
| SheetJS (xlsx) | 0.18.5 | Excel Export |
| html5-qrcode | latest | QR/Barcode Scanner |
| bwip-js | 3.0.4 | Barcode Generator |
| Google Fonts | Inter, IBM Plex Sans Thai, Noto Sans Thai | Typography |

### Token & Session

```
- Session Token เก็บใน localStorage('_user')
- Token Expiry: 24 ชั่วโมง
- Superadmin ข้าม Token Check เพื่อความเสถียร
- Password Hash: SHA-256 (ใช้ Utilities.computeDigest)
```

### GAS URL สำหรับ Vercel

```
ตั้งค่าใน clothing-store-vercel/api.js > GAS_URL
ต้อง Deploy ใหม่เป็น "New Version" ทุกครั้งที่แก้ไข Backend
```

---

## 📝 บันทึกสำคัญสำหรับ Agent

1. **admin.html มีขนาดใหญ่มาก (165KB+)** — ทุก Admin Logic รวมอยู่ในไฟล์เดียว ควรแก้เฉพาะส่วนที่เกี่ยวข้อง ห้าม rewrite ทั้งไฟล์
2. **GAS มี Execution Time Limit 6 นาที** — ฟังก์ชันที่หนักต้อง optimize ให้ทำงานใน 30 วินาที
3. **CacheService มีขีดจำกัด 100KB ต่อ key** — ระบบใช้ Chunked Cache ใน `cache.gs`
4. **Google Sheets ไม่ใช่ Database จริง** — ต้องใช้ Lock, Batch Operations, และ Cache เพื่อ Performance
5. **ระบบรองรับ 2 แบบ ID** — บางแถวใช้ `productId` บางแถวใช้ `id` ต้องมี Fallback Search
6. **variantStock** เก็บเป็น JSON String ในเซลล์ — ต้อง `JSON.parse()` ก่อนใช้ และ `JSON.stringify()` ก่อนบันทึก



