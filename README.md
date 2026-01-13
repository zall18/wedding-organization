# 💍 Hadirin - Modern Wedding Guest Management System

![Status](https://img.shields.io/badge/Status-In%20Development-yellow)
![License](https://img.shields.io/badge/License-MIT-blue)

**Hadirin** adalah platform *Back-End Service* untuk manajemen tamu pernikahan digital berbasis SaaS (*Software as a Service*). Sistem ini dirancang untuk mempermudah Wedding Organizer (WO) dalam mengelola data tamu, proses *check-in* digital (QR Code), serta integrasi notifikasi WhatsApp.

Project ini dibangun dengan arsitektur **REST API** yang *scalable*, mendukung *multi-tenancy* (banyak event dalam satu sistem), dan siap diintegrasikan dengan Frontend modern (React/Next.js).

---

## 🚀 Key Features

### 1. Multi-Tenant Event Management
Sistem ini tidak hanya untuk satu pernikahan. Satu akun admin (WO) dapat mengelola **banyak event pernikahan** sekaligus secara terpisah.
- **Dynamic Event Slugs:** Undangan unik per pasangan (contoh: `/romeo-juliet`).
- **Role-Based Access Control (RBAC):** Mendukung level akses `ADMIN`, `ORGANIZER` (WO), dan `STAFF` (Penerima Tamu).

### 2. Digital Check-in System
Menggantikan buku tamu konvensional dengan teknologi digital.
- **QR Code Generation:** Setiap tamu otomatis mendapatkan UUID unik yang dikonversi menjadi QR Code.
- **Multiple Check-in Methods:** Mendukung scan QR Code atau pencarian nama manual jika tamu lupa membawa undangan.
- **Real-time Logs:** Mencatat waktu kehadiran dan siapa staff yang melakukan scan.

### 3. Guest & WhatsApp Integration
- **Guest Categorization:** Pelabelan tamu (VIP, Keluarga, Reguler).
- **Photo Booth Log:** Struktur database siap untuk fitur kirim foto tamu langsung ke WhatsApp (via integrasi 3rd party API).

---

## 🛠️ Tech Stack

Project ini dibangun menggunakan teknologi backend modern yang *robust* dan *developer-friendly*:

| Category | Technology | Description |
| :--- | :--- | :--- |
| **Runtime** | ![Node.js](https://img.shields.io/badge/-Node.js-339933?logo=node.js&logoColor=white) | JavaScript Runtime Environment. |
| **Framework** | ![Express](https://img.shields.io/badge/-Express.js-000000?logo=express&logoColor=white) | Fast & minimalist web framework. |
| **Database** | ![PostgreSQL](https://img.shields.io/badge/-PostgreSQL-336791?logo=postgresql&logoColor=white) | Relational Database Management System. |
| **ORM** | ![Prisma](https://img.shields.io/badge/-Prisma-2D3748?logo=prisma&logoColor=white) | Next-generation Node.js and TypeScript ORM. |
| **Security** | `bcrypt` & `JWT` | Password Hashing & JSON Web Token Auth. |

---

## 🗄️ Database Schema (ERD Overview)

Struktur database dirancang menggunakan **Prisma Schema** dengan relasi yang teroptimasi:

* **User:** Pengguna sistem (WO/Admin).
* **Event:** Data acara pernikahan (One User -> Many Events).
* **Guest:** Data tamu undangan (One Event -> Many Guests).
* **CheckInLog:** Riwayat kedatangan tamu.
* **PhotoLog:** Riwayat pengiriman foto ke WhatsApp.

### 2. Clone & Install
```bash
git clone [https://github.com/username/wedding-saas.git](https://github.com/username/wedding-saas.git)
cd wedding-saas
npm install
