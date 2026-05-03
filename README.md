Authors:
•	Goitseone Moothai 201403857
•	Aobakwe Motingwa 201803690
•	Thero Setlhare 201804745
•	Thusang Radingaka 202002221
•	Rodwell Patrick 201901812

# IAMS — Industrial Attachment Management System

This repository contains a simple full-stack application for managing student industrial attachments, with support for students, organizations, supervisors, and coordinators.

## Overview

- `index.html` / `welcome.js` — Landing page, signup/login flow, OTP support.
- `dashboard.html` / `dashboard.js` — Role-based dashboard for students, organizations, supervisors, and coordinators.
- `server.js` — Node.js/Express backend using PostgreSQL.
- `db/schema.sql` — PostgreSQL schema definitions.
- `db/init-db.js` — Database initialization and sample data seeding.
- `style.css` / `dashboard.css` — UI styling for public pages and dashboard.

## Features

- Role-specific signup and login
- Password hashing with bcrypt
- OTP verification via email simulation when SMTP is not configured
- Student preferences and organization match recommendations
- Coordinator dashboard with collapsible sections
- Supervisor dashboard showing supervised students
- Logbook submission for students
- Organization preference listing on the student dashboard

## Requirements

- Node.js 18+ / 20+
- PostgreSQL

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a PostgreSQL database named `iams` (or update `.env` accordingly):

```sql
CREATE DATABASE iams;
```

3. Configure environment variables in `.env`:

```env
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPASSWORD=""
PGDATABASE=iams
PORT=3000
```

4. Initialize the database schema and sample data:

```bash
node db/init-db.js
```

5. Start the server:

```bash
node server.js
```

6. Open `index.html` in the browser or serve the folder from a static server.

## Running the App

- Backend: `http://localhost:3000`
- Frontend: open `index.html` in a browser or use a simple static server

## Sample Accounts

- Student: `student@uni.ac.bw` / `password`
- Organization: `hr@techcorp.co.bw` / `password`
- Coordinator: `coordinator@cs.ub.bw` / `password`
- Supervisor: `supervisor@ub.bw` / `password`

## API Endpoints

- `POST /api/signup`
- `POST /api/login`
- `POST /api/verify-otp`
- `POST /api/forgot-password`
- `POST /api/reset-password`
- `GET /api/me?email={email}`
- `GET /api/dashboard-stats`
- `GET /api/coordinator/students?role=coordinator`
- `GET /api/coordinator/organizations?role=coordinator`
- `GET /api/coordinator/student-logbooks?role=coordinator`
- `GET /api/logbooks?email={email}`
- `POST /api/logbooks`
- `POST /api/profile`
- `POST /api/preferences`
- `GET /api/users`

## Notes

- OTP codes are displayed directly in the UI when SMTP is not configured, for development convenience.
- The supervisor dashboard uses `supervisor_dept` to identify supervised students.

## License

This project is provided as-is for learning and demonstration purposes.
