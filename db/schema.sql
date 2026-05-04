-- PostgreSQL schema for IAMS
-- Create the database from the postgres user prompt using:
--   CREATE DATABASE iams;
-- Then connect to the database:
--   \c iams

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL,
  name TEXT,
  student_id TEXT,
  program TEXT,
  org_name TEXT,
  industry TEXT,
  supervisor_dept TEXT
);

CREATE TABLE IF NOT EXISTS preferences (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  location TEXT,
  project_type TEXT,
  required_skills TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS logbooks (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week INTEGER NOT NULL,
  content TEXT NOT NULL,
  supervisor_approved BOOLEAN NOT NULL DEFAULT FALSE,
  submitted_to_coordinator BOOLEAN NOT NULL DEFAULT FALSE,
  supervisor_rating INTEGER,
  supervisor_comments TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS final_reports (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS site_visit_assessments (
  id SERIAL PRIMARY KEY,
  supervisor_email TEXT NOT NULL,
  student_email TEXT NOT NULL,
  student_name TEXT,
  visit_date DATE NOT NULL,
  visit_location TEXT,
  progress_summary TEXT NOT NULL,
  challenges TEXT,
  overall_rating INTEGER NOT NULL,
  comments TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS matches (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS submission_deadlines (
  id SERIAL PRIMARY KEY,
  deadline_type TEXT NOT NULL,
  deadline_date TIMESTAMPTZ NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reminder_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deadline_type TEXT NOT NULL,
  reminder_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  days_before INTEGER,
  UNIQUE (user_id, deadline_type, days_before)
);

CREATE TABLE IF NOT EXISTS auth_otps (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  purpose TEXT NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS backups (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL,
  data_types TEXT[] NOT NULL,
  encrypted BOOLEAN NOT NULL DEFAULT FALSE,
  size_bytes INTEGER,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Sample data is seeded by db/init-db.js so that passwords can be stored hashed.