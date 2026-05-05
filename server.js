const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

const poolConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.PGHOST || 'localhost',
      port: Number(process.env.PGPORT || 5432),
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || 'postgres',
      database: process.env.PGDATABASE || 'iams'
    };
const pool = new Pool(poolConfig);

pool.connect()
  .then(async client => {
    console.log('✅ Connected to PostgreSQL');
    try {
      await client.query(`ALTER TABLE IF EXISTS logbooks ADD COLUMN IF NOT EXISTS supervisor_approved BOOLEAN NOT NULL DEFAULT FALSE`);
      await client.query(`ALTER TABLE IF EXISTS logbooks ADD COLUMN IF NOT EXISTS submitted_to_coordinator BOOLEAN NOT NULL DEFAULT FALSE`);
      await client.query(`ALTER TABLE IF EXISTS logbooks ADD COLUMN IF NOT EXISTS supervisor_rating INTEGER`);
      await client.query(`ALTER TABLE IF EXISTS logbooks ADD COLUMN IF NOT EXISTS supervisor_comments TEXT`);
      await client.query(`CREATE TABLE IF NOT EXISTS final_reports (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id)
      )`);
      await client.query(`CREATE TABLE IF NOT EXISTS site_visit_assessments (
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
      )`);
      await client.query(`CREATE TABLE IF NOT EXISTS submission_deadlines (
        id SERIAL PRIMARY KEY,
        deadline_type TEXT NOT NULL,
        deadline_date TIMESTAMPTZ NOT NULL,
        description TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await client.query(`CREATE TABLE IF NOT EXISTS reminder_log (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        deadline_type TEXT NOT NULL,
        reminder_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        days_before INTEGER,
        UNIQUE (user_id, deadline_type, days_before)
      )`);
      console.log('✅ Logbook approval and assessment schema ensured.');
    } catch (schemaError) {
      console.error('⚠️ Logbook schema check failed:', schemaError.message || schemaError);
    }
    client.release();
  })
  .catch(error => {
    console.error('❌ PostgreSQL connection error:', error.message || error);
  });

const mailerTransport = nodemailer.createTransport(
  process.env.SMTP_URL
    ? { url: process.env.SMTP_URL }
    : {
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER || '',
          pass: process.env.SMTP_PASS || ''
        }
      }
);

async function sendEmail(to, subject, text) {
  const from = process.env.EMAIL_FROM || 'no-reply@iams.local';
  const mailOptions = { from, to, subject, text };
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log('--- EMAIL SIMULATION ---');
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(text);
    console.log('------------------------');
    return;
  }
  await mailerTransport.sendMail(mailOptions);
}

function generateOtpCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function createOtpRecord(email, purpose) {
  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await pool.query(
    `INSERT INTO auth_otps (email, code, purpose, expires_at, used, created_at)
     VALUES ($1, $2, $3, $4, false, NOW())`,
    [email, code, purpose, expiresAt]
  );
  return code;
}

async function verifyOtp(email, code, purpose) {
  const result = await pool.query(
    `SELECT id FROM auth_otps
     WHERE email = $1 AND code = $2 AND purpose = $3 AND used = false AND expires_at > NOW()
     ORDER BY created_at DESC
     LIMIT 1`,
    [email, code, purpose]
  );
  if (!result.rows[0]) return false;
  await pool.query(`UPDATE auth_otps SET used = true WHERE id = $1`, [result.rows[0].id]);
  return true;
}

async function sendOtpEmail(email, purpose) {
  const code = await createOtpRecord(email, purpose);
  const subject = purpose === 'reset'
    ? 'IAMS password reset code'
    : 'Your IAMS login code';
  const text = purpose === 'reset'
    ? `Use this code to reset your password: ${code}. It expires in 10 minutes.`
    : `Use this code to complete your login: ${code}. It expires in 10 minutes.`;
  await sendEmail(email, subject, text);
  return code;
}

function validateStrongPassword(password) {
  if (!password || password.length < 6) {
    return 'Password must be at least 6 characters long.';
  }

  // Check for at least one letter
  if (!/[a-zA-Z]/.test(password)) {
    return 'Password must contain at least one letter.';
  }

  // Check for at least one number
  if (!/\d/.test(password)) {
    return 'Password must contain at least one number.';
  }

  // Check for at least one symbol
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return 'Password must contain at least one symbol (e.g., !@#$%^&*).';
  }

  return null; // Password is valid
}

async function validateSignupPayload(role, password, profile) {
  const passwordError = validateStrongPassword(password);
  if (passwordError) {
    return passwordError;
  }

  if (role === 'student') {
    const studentId = profile?.studentId || '';
    if (studentId.length !== 9 || studentId[0] !== '2') {
      return 'Student ID must be 9 characters long and start with the digit 2.';
    }
  }

  return null;
}

function normalizeToken(text) {
  return text?.toString().toLowerCase().trim() || '';
}

function tokenize(text) {
  return normalizeToken(text).split(/[^a-z0-9]+/).filter(Boolean);
}

function countTokenMatches(sourceText, targetText) {
  const sourceTokens = tokenize(sourceText);
  const targetTokens = tokenize(targetText);
  if (!sourceTokens.length || !targetTokens.length) return 0;

  return sourceTokens.reduce((count, sourceToken) => {
    const matched = targetTokens.some(targetToken =>
      sourceToken === targetToken ||
      sourceToken.includes(targetToken) ||
      targetToken.includes(sourceToken)
    );
    return count + (matched ? 1 : 0);
  }, 0);
}

async function findBestOrgMatch(studentId) {
  const studentPrefResult = await pool.query(
    `SELECT u.program, p.location, p.project_type FROM preferences p
     JOIN users u ON u.id = p.user_id
     WHERE u.id = $1 AND u.role = 'student'`,
    [studentId]
  );

  const studentPref = studentPrefResult.rows[0];
  if (!studentPref) {
    return { match: null, recommendations: [] };
  }

  const orgResult = await pool.query(
    `SELECT u.id, u.email, u.name, u.org_name, u.industry, p.location, p.project_type, p.required_skills
     FROM users u
     LEFT JOIN preferences p ON p.user_id = u.id
     WHERE u.role = 'organization'`);

  const candidates = [];

  for (const org of orgResult.rows) {
    let score = 0;
    score += countTokenMatches(studentPref.project_type, org.required_skills) * 5;
    score += countTokenMatches(studentPref.project_type, org.project_type) * 4;
    score += countTokenMatches(studentPref.location, org.location) * 3;
    score += countTokenMatches(studentPref.program, org.industry) * 2;
    score += countTokenMatches(studentPref.project_type, org.industry);

    if (score > 0) {
      candidates.push({ ...org, score });
    }
  }

  if (candidates.length === 0) {
    const recommendations = orgResult.rows
      .map(org => ({ ...org, score: 0 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);
    return { match: null, recommendations };
  }

  candidates.sort((a, b) => b.score - a.score);
  const match = candidates[0];
  return { match, recommendations: candidates.slice(0, 2) };
}

async function updateStudentMatch(studentId) {
  const { match } = await findBestOrgMatch(studentId);
  if (!match) {
    await pool.query('DELETE FROM matches WHERE student_id = $1', [studentId]);
    return null;
  }

  await pool.query(
    `INSERT INTO matches (student_id, organization_id, score)
     VALUES ($1, $2, $3)
     ON CONFLICT (student_id) DO UPDATE
       SET organization_id = EXCLUDED.organization_id,
           score = EXCLUDED.score,
           created_at = NOW()`,
    [studentId, match.id, match.score]
  );
  return match;
}

async function matchAllStudents() {
  const students = await pool.query("SELECT id FROM users WHERE role = 'student'");
  const summary = {
    totalStudents: students.rows.length,
    matched: 0,
    unmatched: 0,
    allocations: []
  };

  for (const student of students.rows) {
    const match = await updateStudentMatch(student.id);
    if (match) {
      summary.matched += 1;
      summary.allocations.push({ studentId: student.id, organizationId: match.id, score: match.score });
    } else {
      summary.unmatched += 1;
      summary.allocations.push({ studentId: student.id, organizationId: null, score: 0 });
    }
  }

  return summary;
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

function handleError(res, error) {
  console.error(error);
  res.status(500).json({ error: 'Server error' });
}

app.post('/api/signup', async (req, res) => {
  try {
    const { email, password, role, profile, preferences } = req.body;
    if (!email || !password || !role) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    const validationError = await validateSignupPayload(role, password, profile);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length) {
      return res.status(409).json({ error: 'Email already registered.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const savedName = profile?.name || (role === 'organization' ? profile?.orgName : null);
    const insertUserText = `
      INSERT INTO users (email, password, role, name, student_id, program, org_name, industry, supervisor_dept)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, email, role, name
    `;
    const userValues = [
      email,
      hashedPassword,
      role,
      savedName,
      profile?.studentId || null,
      profile?.program || null,
      profile?.orgName || null,
      profile?.industry || null,
      profile?.supervisorDept || null
    ];

    const userResult = await pool.query(insertUserText, userValues);
    const userId = userResult.rows[0].id;

    if (preferences) {
      await pool.query(
        `INSERT INTO preferences (user_id, location, project_type, required_skills)
         VALUES ($1, $2, $3, $4)`,
        [userId, preferences.location || null, preferences.projectType || null, preferences.requiredSkills || null]
      );
    }

    if (role === 'student') {
      try {
        await updateStudentMatch(userId);
      } catch (matchError) {
        console.warn('Student match update failed after signup:', matchError.message || matchError);
      }
    } else if (role === 'organization') {
      try {
        await matchAllStudents();
      } catch (matchError) {
        console.warn('Organization signup matching failed after signup:', matchError.message || matchError);
      }
    }

    const savedProfile = {
      name: savedName,
      studentId: profile?.studentId || null,
      program: profile?.program || null,
      orgName: profile?.orgName || null,
      industry: profile?.industry || null,
      supervisorDept: profile?.supervisorDept || null
    };

    res.status(201).json({ message: 'Account created.', email, role, profile: savedProfile });
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password, role } = req.body;
    if (!email || !password || !role) {
      return res.status(400).json({ error: 'Email, password, and role are required.' });
    }

    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = userResult.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    if (user.role !== role) {
      return res.status(401).json({ error: `This account is registered as ${user.role}. Please sign in using the correct dashboard.` });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const otpCode = await sendOtpEmail(email, 'login');
    const responsePayload = {
      status: 'otp_required',
      message: 'A verification code has been sent to your email.'
    };
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      responsePayload.otpCode = otpCode;
    }
    res.json(responsePayload);
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/verify-otp', async (req, res) => {
  try {
    const { email, code, role } = req.body;
    if (!email || !code || !role) {
      return res.status(400).json({ error: 'Email, code, and role are required.' });
    }

    const valid = await verifyOtp(email, code, 'login');
    if (!valid) {
      return res.status(401).json({ error: 'Invalid or expired verification code.' });
    }

    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = userResult.rows[0];
    if (!user || user.role !== role) {
      return res.status(401).json({ error: 'Invalid account details.' });
    }

    if (user.role === 'student') {
      await updateStudentMatch(user.id);
    }

    res.json({ email: user.email, role: user.role, name: user.name });
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.json({ message: 'If this email is registered, a password reset code has been sent.' });
    }

    const otpCode = await sendOtpEmail(email, 'reset');
    const responsePayload = { 
      message: 'If this email is registered, a password reset code has been sent.',
      otpCode: otpCode
    };
    res.json(responsePayload);
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: 'Email, code, and new password are required.' });
    }

    const passwordError = validateStrongPassword(newPassword);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const valid = await verifyOtp(email, code, 'reset');
    if (!valid) {
      return res.status(401).json({ error: 'Invalid or expired reset code.' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password = $1 WHERE email = $2', [hashedPassword, email]);
    res.json({ message: 'Password reset successfully.' });
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/change-password', async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    if (!email || !newPassword) {
      return res.status(400).json({ error: 'Email and new password are required.' });
    }

    const passwordError = validateStrongPassword(newPassword);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    // Check if user exists
    const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password = $1 WHERE email = $2', [hashedPassword, email]);
    res.json({ message: 'Password changed successfully.' });
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/me', async (req, res) => {
  try {
    const email = req.query.email;
    if (!email) {
      return res.status(400).json({ error: 'Email query parameter is required.' });
    }

    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = userResult.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const prefResult = await pool.query('SELECT * FROM preferences WHERE user_id = $1', [user.id]);
    const logResult = await pool.query('SELECT week, content, created_at FROM logbooks WHERE user_id = $1 ORDER BY created_at DESC', [user.id]);
    const matchResult = await pool.query(
      `SELECT m.score, u.email AS org_email, COALESCE(u.org_name, u.name) AS org_name FROM matches m
       JOIN users u ON u.id = m.organization_id
       WHERE m.student_id = $1`,
      [user.id]
    );

    const preferences = prefResult.rows[0] || null;
    const finalReportResult = await pool.query('SELECT title, content, submitted_at FROM final_reports WHERE user_id = $1', [user.id]);
    const finalReport = finalReportResult.rows[0] || null;
    const match = matchResult.rows[0] || null;
    let recommendations = [];
    let organizations = [];

    if (user.role === 'student') {
      const matchInfo = await findBestOrgMatch(user.id);
      if (!matchInfo.match) {
        recommendations = matchInfo.recommendations;
      }
      const orgsResult = await pool.query(
        `SELECT u.email, u.name, u.org_name, p.location, p.project_type, p.required_skills
         FROM users u
         LEFT JOIN preferences p ON p.user_id = u.id
         WHERE u.role = 'organization'`
      );
      organizations = orgsResult.rows.map(row => ({
        email: row.email,
        name: row.name,
        orgName: row.org_name,
        location: row.location,
        projectType: row.project_type,
        requiredSkills: row.required_skills
      }));
    }

    let supervisorStudents = [];
    if (user.role === 'supervisor' && user.supervisor_dept) {
      const supervisorResult = await pool.query(
        `SELECT u.email, u.name, u.student_id, u.program, p.location, p.project_type, m.score, ou.email AS org_email, COALESCE(ou.org_name, ou.name) AS org_name
         FROM users u
         LEFT JOIN preferences p ON p.user_id = u.id
         LEFT JOIN matches m ON m.student_id = u.id
         LEFT JOIN users ou ON ou.id = m.organization_id
         WHERE u.role = 'student' AND u.program = $1`
      , [user.supervisor_dept]);
      supervisorStudents = supervisorResult.rows.map(row => ({
        email: row.email,
        name: row.name,
        studentId: row.student_id,
        program: row.program,
        location: row.location,
        projectType: row.project_type,
        matchedOrganization: row.org_name ? { email: row.org_email, name: row.org_name, score: row.score } : null
      }));
    }

    res.json({
      email: user.email,
      role: user.role,
      name: user.name,
      studentId: user.student_id,
      program: user.program,
      orgName: user.org_name,
      industry: user.industry,
      supervisorDept: user.supervisor_dept,
      preferences,
      logbooks: logResult.rows,
      finalReport,
      matchedOrganization: match ? { email: match.org_email, name: match.org_name, score: match.score } : null,
      recommendations,
      organizations,
      supervisorStudents
    });
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/final-reports', async (req, res) => {
  try {
    const { email, title, content } = req.body;
    if (!email || !title || !content) {
      return res.status(400).json({ error: 'Email, title, and content are required.' });
    }

    const userResult = await pool.query('SELECT id, role FROM users WHERE email = $1', [email]);
    const user = userResult.rows[0];
    if (!user || user.role !== 'student') {
      return res.status(403).json({ error: 'Only students can submit final reports.' });
    }

    const result = await pool.query(
      `INSERT INTO final_reports (user_id, title, content)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE
       SET title = EXCLUDED.title,
           content = EXCLUDED.content,
           submitted_at = NOW()
       RETURNING id, title, content, submitted_at`,
      [user.id, title, content]
    );

    res.json({ message: 'Final report submitted successfully.', report: result.rows[0] });
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/final-reports', async (req, res) => {
  try {
    const email = req.query.email;
    if (!email) {
      return res.status(400).json({ error: 'Email query parameter is required.' });
    }

    const userResult = await pool.query('SELECT id, role FROM users WHERE email = $1', [email]);
    const user = userResult.rows[0];
    if (!user || user.role !== 'student') {
      return res.status(403).json({ error: 'Only students can load final reports.' });
    }

    const reportResult = await pool.query('SELECT title, content, submitted_at FROM final_reports WHERE user_id = $1', [user.id]);
    res.json(reportResult.rows[0] || null);
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/coordinator/final-reports', async (req, res) => {
  try {
    const role = req.query.role;
    if (role !== 'coordinator') {
      return res.status(403).json({ error: 'Only coordinators can access this endpoint.' });
    }

    const result = await pool.query(
      `SELECT u.name AS student_name, u.email AS student_email, fr.title, fr.content, fr.submitted_at
       FROM final_reports fr
       JOIN users u ON u.id = fr.user_id
       WHERE u.role = 'student'
       ORDER BY fr.submitted_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/coordinator/send-deadline-reminders', async (req, res) => {
  try {
    const { role } = req.body;
    if (role !== 'coordinator') {
      return res.status(403).json({ error: 'Only coordinators can send reminders.' });
    }

    const studentResult = await pool.query("SELECT id, email, name FROM users WHERE role = 'student'");
    let remindersSent = 0;

    for (const student of studentResult.rows) {
      const message = 'Reminder: Please submit your weekly logbook and final report before the deadline.';
      
      await pool.query(
        `INSERT INTO notifications (user_id, message) VALUES ($1, $2)`,
        [student.id, message]
      );

      await sendEmail(
        student.email,
        'IAMS Submission Reminder',
        `Dear ${student.name || 'Student'},\n\nThis is a reminder to submit your weekly logbook and final report before the deadline.\n\nPlease visit the IAMS dashboard to complete your submissions.\n\nBest regards,\nIAMS Team`
      );

      remindersSent++;
    }

    res.json({ message: `Reminders sent to ${remindersSent} students.`, remindersSent });
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/coordinator/export-data', async (req, res) => {
  try {
    const { dataTypes, role, encrypt = false, createBackup = false } = req.body;
    if (role !== 'coordinator') {
      return res.status(403).json({ error: 'Only coordinators can export data.' });
    }

    if (!dataTypes || !Array.isArray(dataTypes) || dataTypes.length === 0) {
      return res.status(400).json({ error: 'No data types specified for export.' });
    }

    const exportData = {};

    // Export Students
    if (dataTypes.includes('students')) {
      const studentsResult = await pool.query(
        `SELECT id, email, name, student_id, program, role FROM users WHERE role = 'student' ORDER BY name`
      );
      exportData.students = studentsResult.rows;
    }

    // Export Organizations
    if (dataTypes.includes('organizations')) {
      const orgsResult = await pool.query(
        `SELECT id, org_name AS name, email, industry AS location, supervisor_dept FROM users WHERE role = 'organization' ORDER BY org_name`
      );
      exportData.organizations = orgsResult.rows;
    }

    // Export Logbooks
    if (dataTypes.includes('logbooks')) {
      const logbooksResult = await pool.query(
        `SELECT l.id, l.user_id, u.name as student_name, u.email, l.week, l.content, 
                l.supervisor_rating, l.supervisor_comments, l.supervisor_approved AS approved, l.created_at
         FROM logbooks l
         JOIN users u ON l.user_id = u.id
         ORDER BY u.name, l.week`
      );
      exportData.logbooks = logbooksResult.rows;
    }

    // Export Assessments
    if (dataTypes.includes('assessments')) {
      const assessmentsResult = await pool.query(
        `SELECT l.id, u.name as student_name, u.email, l.week, l.supervisor_rating, 
                l.supervisor_comments, l.created_at
         FROM logbooks l
         JOIN users u ON l.user_id = u.id
         WHERE l.supervisor_rating IS NOT NULL
         ORDER BY u.name, l.week`
      );
      exportData.assessments = assessmentsResult.rows;
    }

    // Export Final Reports
    if (dataTypes.includes('finalreports')) {
      const reportsResult = await pool.query(
        `SELECT f.id, u.name as student_name, u.email, f.title, f.content, f.submitted_at
         FROM final_reports f
         JOIN users u ON f.user_id = u.id
         ORDER BY u.name`
      );
      exportData.finalReports = reportsResult.rows;
    }

    // Export Student-Organization Matches
    if (dataTypes.includes('matches')) {
      const matchesResult = await pool.query(
        `SELECT m.id, s.name as student_name, s.email as student_email, 
                o.name as organization_name, o.email as organization_email, 
                m.score, m.organization_id, m.student_id, m.created_at
         FROM matches m
         JOIN users s ON m.student_id = s.id
         JOIN users o ON m.organization_id = o.id
         ORDER BY s.name, o.name`
      );
      exportData.matches = matchesResult.rows;
    }

    // Add metadata
    exportData.metadata = {
      exportDate: new Date().toISOString(),
      dataTypesExported: dataTypes,
      recordCount: Object.keys(exportData).reduce((sum, key) => {
        if (key !== 'metadata' && Array.isArray(exportData[key])) {
          return sum + exportData[key].length;
        }
        return sum;
      }, 0)
    };

    let responseData = exportData;
    let contentType = 'application/json';

    // Encrypt data if requested
    if (encrypt) {
      const algorithm = 'aes-256-cbc';
      const key = crypto.scryptSync(process.env.ENCRYPTION_KEY || 'default-key-change-in-production', 'salt', 32);
      const iv = crypto.randomBytes(16);
      
      const cipher = crypto.createCipheriv(algorithm, key, iv);
      let encrypted = cipher.update(JSON.stringify(exportData), 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      responseData = {
        encrypted: true,
        data: encrypted,
        iv: iv.toString('hex'),
        algorithm: algorithm
      };
      contentType = 'application/octet-stream';
    }

    // Create backup record if requested
    if (createBackup) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `iams-backup-${timestamp}.json${encrypt ? '.enc' : ''}`;
      const sizeBytes = Buffer.byteLength(JSON.stringify(responseData), 'utf8');
      
      // Get coordinator user ID (assuming we have it from session or token)
      // For now, we'll use a placeholder - in production this should come from authentication
      const coordinatorId = 1; // TODO: Get from authenticated user
      
      await pool.query(
        `INSERT INTO backups (filename, data_types, encrypted, size_bytes, created_by) 
         VALUES ($1, $2, $3, $4, $5)`,
        [filename, dataTypes, encrypt, sizeBytes, coordinatorId]
      );
    }

    res.setHeader('Content-Type', contentType);
    res.json(responseData);
  } catch (error) {
    handleError(res, error);
  }
});

// Create secure backup endpoint
app.post('/api/coordinator/create-backup', async (req, res) => {
  try {
    const { dataTypes, role } = req.body;
    if (role !== 'coordinator') {
      return res.status(403).json({ error: 'Only coordinators can create backups.' });
    }

    if (!dataTypes || !Array.isArray(dataTypes) || dataTypes.length === 0) {
      return res.status(400).json({ error: 'No data types specified for backup.' });
    }

    // Get coordinator user ID (placeholder - should come from authentication)
    const coordinatorId = 1; // TODO: Get from authenticated user

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `iams-backup-${timestamp}.json.enc`;

    // Create the backup data (similar to export but always encrypted)
    const exportData = {};

    // Add all the data collection logic here (same as export endpoint)
    if (dataTypes.includes('students')) {
      const studentsResult = await pool.query(
        `SELECT id, email, name, student_id, program, role FROM users WHERE role = 'student' ORDER BY name`
      );
      exportData.students = studentsResult.rows;
    }

    if (dataTypes.includes('organizations')) {
      const orgsResult = await pool.query(
        `SELECT id, org_name AS name, email, industry AS location, supervisor_dept FROM users WHERE role = 'organization' ORDER BY org_name`
      );
      exportData.organizations = orgsResult.rows;
    }

    if (dataTypes.includes('logbooks')) {
      const logbooksResult = await pool.query(
        `SELECT l.id, l.user_id, u.name as student_name, u.email, l.week, l.content, 
                l.supervisor_rating, l.supervisor_comments, l.supervisor_approved AS approved, l.created_at
         FROM logbooks l
         JOIN users u ON l.user_id = u.id
         ORDER BY u.name, l.week`
      );
      exportData.logbooks = logbooksResult.rows;
    }

    if (dataTypes.includes('assessments')) {
      const assessmentsResult = await pool.query(
        `SELECT l.id, u.name as student_name, u.email, l.week, l.supervisor_rating, 
                l.supervisor_comments, l.created_at
         FROM logbooks l
         JOIN users u ON l.user_id = u.id
         WHERE l.supervisor_rating IS NOT NULL
         ORDER BY u.name, l.week`
      );
      exportData.assessments = assessmentsResult.rows;
    }

    if (dataTypes.includes('finalreports')) {
      const reportsResult = await pool.query(
        `SELECT f.id, u.name as student_name, u.email, f.title, f.content, f.submitted_at
         FROM final_reports f
         JOIN users u ON f.user_id = u.id
         ORDER BY u.name`
      );
      exportData.finalReports = reportsResult.rows;
    }

    if (dataTypes.includes('matches')) {
      const matchesResult = await pool.query(
        `SELECT m.id, s.name as student_name, s.email as student_email, 
                o.name as organization_name, o.email as organization_email, 
                m.score, m.organization_id, m.student_id, m.created_at
         FROM matches m
         JOIN users s ON m.student_id = s.id
         JOIN users o ON m.organization_id = o.id
         ORDER BY s.name, o.name`
      );
      exportData.matches = matchesResult.rows;
    }

    // Add metadata
    exportData.metadata = {
      exportDate: new Date().toISOString(),
      dataTypesExported: dataTypes,
      recordCount: Object.keys(exportData).reduce((sum, key) => {
        if (key !== 'metadata' && Array.isArray(exportData[key])) {
          return sum + exportData[key].length;
        }
        return sum;
      }, 0)
    };

    // Encrypt the data
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(process.env.ENCRYPTION_KEY || 'default-key-change-in-production', 'salt', 32);
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(JSON.stringify(exportData), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const encryptedData = {
      encrypted: true,
      data: encrypted,
      iv: iv.toString('hex'),
      algorithm: algorithm
    };

    // Store backup metadata in database
    const sizeBytes = Buffer.byteLength(JSON.stringify(encryptedData), 'utf8');
    const backupResult = await pool.query(
      `INSERT INTO backups (filename, data_types, encrypted, size_bytes, created_by) 
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [filename, dataTypes, true, sizeBytes, coordinatorId]
    );

    // In a real implementation, you'd store the encrypted data in a secure location
    // For now, we'll just return the backup ID
    res.json({ 
      success: true, 
      backupId: backupResult.rows[0].id,
      filename: filename,
      message: 'Secure backup created successfully'
    });
  } catch (error) {
    handleError(res, error);
  }
});

// Get backup history endpoint
app.get('/api/coordinator/backup-history', async (req, res) => {
  try {
    // TODO: Get coordinator ID from authentication
    const coordinatorId = 1; // Placeholder

    const backupsResult = await pool.query(
      `SELECT b.id, b.filename, b.data_types, b.encrypted, b.size_bytes, b.created_at, u.name as created_by_name
       FROM backups b
       JOIN users u ON b.created_by = u.id
       WHERE b.created_by = $1
       ORDER BY b.created_at DESC
       LIMIT 50`,
      [coordinatorId]
    );

    res.json(backupsResult.rows);
  } catch (error) {
    handleError(res, error);
  }
});

// Download backup endpoint
app.get('/api/coordinator/download-backup/:backupId', async (req, res) => {
  try {
    const { backupId } = req.params;
    
    // TODO: Get coordinator ID from authentication and verify ownership
    const coordinatorId = 1; // Placeholder

    const backupResult = await pool.query(
      `SELECT * FROM backups WHERE id = $1 AND created_by = $2`,
      [backupId, coordinatorId]
    );

    if (backupResult.rows.length === 0) {
      return res.status(404).json({ error: 'Backup not found.' });
    }

    const backup = backupResult.rows[0];

    // In a real implementation, you'd retrieve the encrypted data from secure storage
    // For now, we'll recreate the backup data (this is not secure for production!)
    const exportData = {};

    // Recreate the data based on stored data_types
    if (backup.data_types.includes('students')) {
      const studentsResult = await pool.query(
        `SELECT id, email, name, student_id, program, role FROM users WHERE role = 'student' ORDER BY name`
      );
      exportData.students = studentsResult.rows;
    }

    // Add other data types as needed...

    // Add metadata
    exportData.metadata = {
      exportDate: backup.created_at.toISOString(),
      dataTypesExported: backup.data_types,
      backupId: backup.id
    };

    // Encrypt the data
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(process.env.ENCRYPTION_KEY || 'default-key-change-in-production', 'salt', 32);
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(JSON.stringify(exportData), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const encryptedData = {
      encrypted: true,
      data: encrypted,
      iv: iv.toString('hex'),
      algorithm: algorithm
    };

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${backup.filename}"`);
    res.json(encryptedData);
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/notifications', async (req, res) => {
  try {
    const email = req.query.email;
    if (!email) {
      return res.status(400).json({ error: 'Email query parameter is required.' });
    }

    const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    const user = userResult.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const result = await pool.query(
      `SELECT id, message, is_read, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`,
      [user.id]
    );
    res.json(result.rows);
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/notifications/mark-read', async (req, res) => {
  try {
    const { email, notificationId } = req.body;
    if (!email || !notificationId) {
      return res.status(400).json({ error: 'Email and notificationId are required.' });
    }

    const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    const user = userResult.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    await pool.query(
      `UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2`,
      [notificationId, user.id]
    );

    res.json({ message: 'Notification marked as read.' });
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/upcoming-deadlines', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT deadline_type, deadline_date, description FROM submission_deadlines WHERE deadline_date > NOW() ORDER BY deadline_date ASC`
    );
    res.json(result.rows);
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/coordinator/set-deadline', async (req, res) => {
  try {
    const { role, deadline_type, deadline_date, description } = req.body;
    if (role !== 'coordinator') {
      return res.status(403).json({ error: 'Only coordinators can set deadlines.' });
    }
    if (!deadline_type || !deadline_date || !description) {
      return res.status(400).json({ error: 'deadline_type, deadline_date, and description are required.' });
    }

    const result = await pool.query(
      `INSERT INTO submission_deadlines (deadline_type, deadline_date, description) VALUES ($1, $2, $3) RETURNING *`,
      [deadline_type, deadline_date, description]
    );

    res.json({ message: 'Deadline created successfully.', deadline: result.rows[0] });
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/student/assessment-results', async (req, res) => {
  try {
    const email = req.query.email;
    if (!email) {
      return res.status(400).json({ error: 'Email query parameter is required.' });
    }

    const userResult = await pool.query('SELECT id, role FROM users WHERE email = $1', [email]);
    const user = userResult.rows[0];
    if (!user || user.role !== 'student') {
      return res.status(403).json({ error: 'Only students can view assessment results.' });
    }

    const result = await pool.query(
      `SELECT l.week, l.content, l.supervisor_rating, l.supervisor_comments, l.created_at
       FROM logbooks l
       WHERE l.user_id = $1 AND l.supervisor_rating IS NOT NULL
       ORDER BY l.created_at DESC`,
      [user.id]
    );

    res.json(result.rows);
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/dashboard-stats', async (req, res) => {
  try {
    const studentsResult = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'student'");
    const orgsResult = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'organization'");
    const logsResult = await pool.query('SELECT COUNT(*) FROM logbooks');

    res.json({
      students: parseInt(studentsResult.rows[0].count, 10),
      organizations: parseInt(orgsResult.rows[0].count, 10),
      logbooks: parseInt(logsResult.rows[0].count, 10)
    });
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/coordinator/students', async (req, res) => {
  try {
    const role = req.query.role;
    if (role !== 'coordinator') {
      return res.status(403).json({ error: 'Only coordinators can access this endpoint.' });
    }

    const result = await pool.query(
      `SELECT u.email, u.name, u.student_id, u.program, p.location, p.project_type,
              m.score, ou.email AS organization_email, COALESCE(ou.org_name, ou.name) AS organization_name
       FROM users u
       LEFT JOIN preferences p ON p.user_id = u.id
       LEFT JOIN matches m ON m.student_id = u.id
       LEFT JOIN users ou ON ou.id = m.organization_id
       WHERE u.role = 'student'`
    );
    res.json(result.rows);
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/coordinator/match-students', async (req, res) => {
  try {
    const { role } = req.body;
    if (role !== 'coordinator') {
      return res.status(403).json({ error: 'Only coordinators can run student-organization matching.' });
    }

    const summary = await matchAllStudents();
    const result = await pool.query(
      `SELECT u.email AS student_email, u.name AS student_name, u.student_id, u.program,
              p.location, p.project_type, m.score,
              ou.email AS organization_email, COALESCE(ou.org_name, ou.name) AS organization_name
       FROM users u
       LEFT JOIN preferences p ON p.user_id = u.id
       LEFT JOIN matches m ON m.student_id = u.id
       LEFT JOIN users ou ON ou.id = m.organization_id
       WHERE u.role = 'student'
       ORDER BY u.name NULLS LAST, u.email`
    );

    res.json({
      message: `Matching complete. ${summary.matched} of ${summary.totalStudents} students matched.`,
      summary,
      allocations: result.rows
    });
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/coordinator/organizations', async (req, res) => {
  try {
    const role = req.query.role;
    if (role !== 'coordinator') {
      return res.status(403).json({ error: 'Only coordinators can access this endpoint.' });
    }

    const result = await pool.query(
      `SELECT u.email, COALESCE(u.org_name, u.name) AS name, p.location, p.project_type, p.required_skills,
              ARRAY_REMOVE(ARRAY_AGG(su.name) FILTER (WHERE su.name IS NOT NULL), NULL) AS students
       FROM users u
       LEFT JOIN preferences p ON p.user_id = u.id
       LEFT JOIN matches m ON m.organization_id = u.id
       LEFT JOIN users su ON su.id = m.student_id
       WHERE u.role = 'organization'
       GROUP BY u.id, p.location, p.project_type, p.required_skills`
    );
    res.json(result.rows);
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/organization/students', async (req, res) => {
  try {
    const role = req.query.role;
    const email = req.query.email;
    if (role !== 'organization') {
      return res.status(403).json({ error: 'Only organizations can access this endpoint.' });
    }
    if (!email) {
      return res.status(400).json({ error: 'Email query parameter is required.' });
    }

    const result = await pool.query(
      `SELECT u.id, u.name, u.email, u.student_id, u.program, p.location, p.project_type, m.score, m.created_at AS matched_at
       FROM users u
       JOIN matches m ON m.student_id = u.id
       JOIN users org ON org.id = m.organization_id
       LEFT JOIN preferences p ON p.user_id = u.id
       WHERE org.email = $1 AND u.role = 'student'
       ORDER BY m.created_at DESC`,
      [email]
    );
    res.json(result.rows);
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/coordinator/student-logbooks', async (req, res) => {
  try {
    const role = req.query.role;
    if (role !== 'coordinator') {
      return res.status(403).json({ error: 'Only coordinators can access this endpoint.' });
    }

    const result = await pool.query(
      `SELECT u.name AS student_name, u.email AS student_email, l.week, l.content, l.supervisor_approved, l.submitted_to_coordinator, l.supervisor_rating, l.supervisor_comments, l.created_at
       FROM logbooks l
       JOIN users u ON u.id = l.user_id
       WHERE u.role = 'student' AND l.submitted_to_coordinator = TRUE
       ORDER BY l.created_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/supervisor/student-logbooks', async (req, res) => {
  try {
    const role = req.query.role;
    const email = req.query.email;
    if (role !== 'supervisor') {
      return res.status(403).json({ error: 'Only supervisors can access this endpoint.' });
    }
    if (!email) {
      return res.status(400).json({ error: 'Email query parameter is required.' });
    }

    const supervisorResult = await pool.query('SELECT supervisor_dept FROM users WHERE email = $1 AND role = $2', [email, 'supervisor']);
    const supervisor = supervisorResult.rows[0];
    if (!supervisor || !supervisor.supervisor_dept) {
      return res.status(404).json({ error: 'Supervisor profile not found or no department assigned.' });
    }

    const result = await pool.query(
      `SELECT l.id, u.name AS student_name, u.email AS student_email, l.week, l.content,
              l.supervisor_approved, l.submitted_to_coordinator, l.created_at
       FROM logbooks l
       JOIN users u ON u.id = l.user_id
       WHERE u.role = 'student' AND u.program = $1
       ORDER BY l.created_at DESC`,
      [supervisor.supervisor_dept]
    );
    res.json(result.rows);
  } catch (error) {
    handleError(res, error);
  }
});

console.log('🔧 Registered route: POST /api/supervisor/site-visit-assessment');
app.post('/api/supervisor/site-visit-assessment', async (req, res) => {
  try {
    const { role, email, studentEmail, visitDate, visitLocation, progressSummary, challenges, overallRating, comments } = req.body;
    if (role !== 'supervisor') {
      return res.status(403).json({ error: 'Only supervisors can submit site visit assessments.' });
    }
    if (!email || !studentEmail || !visitDate || !progressSummary || !overallRating) {
      return res.status(400).json({ error: 'Missing required fields for site visit assessment.' });
    }

    const supervisorResult = await pool.query('SELECT supervisor_dept FROM users WHERE email = $1 AND role = $2', [email, 'supervisor']);
    const supervisor = supervisorResult.rows[0];
    if (!supervisor || !supervisor.supervisor_dept) {
      return res.status(404).json({ error: 'Supervisor profile not found or department not assigned.' });
    }

    const studentResult = await pool.query('SELECT name, program FROM users WHERE email = $1 AND role = $2', [studentEmail, 'student']);
    const student = studentResult.rows[0];
    if (!student) {
      return res.status(404).json({ error: 'Student not found.' });
    }
    if (student.program !== supervisor.supervisor_dept) {
      return res.status(403).json({ error: 'Supervisor is not authorized to assess this student.' });
    }

    const rating = Number(overallRating);
    if (isNaN(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be a number between 1 and 5.' });
    }

    await pool.query(
      `INSERT INTO site_visit_assessments (
         supervisor_email, student_email, student_name, visit_date,
         visit_location, progress_summary, challenges, overall_rating, comments
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [email, studentEmail, student.name, visitDate, visitLocation || null, progressSummary, challenges || null, rating, comments || null]
    );

    res.json({ message: 'Site visit assessment submitted successfully.' });
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/supervisor/site-visit-assessments', async (req, res) => {
  try {
    const role = req.query.role;
    const email = req.query.email;
    if (role !== 'supervisor') {
      return res.status(403).json({ error: 'Only supervisors can access site visit assessments.' });
    }
    if (!email) {
      return res.status(400).json({ error: 'Email query parameter is required.' });
    }

    const supervisorResult = await pool.query('SELECT supervisor_dept FROM users WHERE email = $1 AND role = $2', [email, 'supervisor']);
    const supervisor = supervisorResult.rows[0];
    if (!supervisor || !supervisor.supervisor_dept) {
      return res.status(404).json({ error: 'Supervisor profile not found or department not assigned.' });
    }

    const assessmentsResult = await pool.query(
      `SELECT id, supervisor_email, student_email, student_name, visit_date, visit_location,
              progress_summary, challenges, overall_rating, comments, created_at
       FROM site_visit_assessments
       WHERE supervisor_email = $1
       ORDER BY visit_date DESC, created_at DESC`,
      [email]
    );

    res.json(assessmentsResult.rows);
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/logbooks/approve', async (req, res) => {
  try {
    const { role, email, logbookId, supervisorRating, supervisorComments } = req.body;
    if (role !== 'supervisor') {
      return res.status(403).json({ error: 'Only supervisors can approve logbooks.' });
    }
    if (!email || !logbookId) {
      return res.status(400).json({ error: 'Email and logbookId are required.' });
    }

    const rating = supervisorRating ? Number(supervisorRating) : null;
    const comments = supervisorComments ? String(supervisorComments).trim() : null;
    if (rating !== null && (isNaN(rating) || rating < 1 || rating > 5)) {
      return res.status(400).json({ error: 'Supervisor rating must be between 1 and 5.' });
    }

    const supervisorResult = await pool.query('SELECT supervisor_dept FROM users WHERE email = $1 AND role = $2', [email, 'supervisor']);
    const supervisor = supervisorResult.rows[0];
    if (!supervisor || !supervisor.supervisor_dept) {
      return res.status(404).json({ error: 'Supervisor profile not found or no department assigned.' });
    }

    const updateResult = await pool.query(
      `UPDATE logbooks
       SET supervisor_approved = TRUE,
           submitted_to_coordinator = TRUE,
           supervisor_rating = $3,
           supervisor_comments = $4
       WHERE id = $1
         AND user_id IN (SELECT id FROM users WHERE role = 'student' AND program = $2)
       RETURNING id`,
      [logbookId, supervisor.supervisor_dept, rating, comments]
    );

    if (!updateResult.rows[0]) {
      return res.status(404).json({ error: 'Logbook entry not found or not authorized.' });
    }

    res.json({ message: 'Logbook approved and submitted to the coordinator dashboard.' });
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/logbooks', async (req, res) => {
  try {
    const email = req.query.email;
    if (!email) {
      return res.status(400).json({ error: 'Email query parameter is required.' });
    }

    const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    const user = userResult.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const logResult = await pool.query('SELECT week, content, created_at FROM logbooks WHERE user_id = $1 ORDER BY created_at DESC', [user.id]);
    res.json(logResult.rows);
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/logbooks', async (req, res) => {
  try {
    const { email, week, content } = req.body;
    if (!email || !week || !content) {
      return res.status(400).json({ error: 'Email, week, and content are required.' });
    }

    const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    const user = userResult.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    await pool.query('INSERT INTO logbooks (user_id, week, content) VALUES ($1, $2, $3)', [user.id, week, content]);
    res.status(201).json({ message: 'Logbook entry saved.' });
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/profile', async (req, res) => {
  try {
    const { email, profile } = req.body;
    if (!email || !profile) {
      return res.status(400).json({ error: 'Email and profile data are required.' });
    }

    const userResult = await pool.query('SELECT id, role FROM users WHERE email = $1', [email]);
    const user = userResult.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (user.role === 'student') {
      const validationError = await validateSignupPayload('student', '123456', profile);
      if (validationError) {
        return res.status(400).json({ error: validationError });
      }
    }

    const updateText = `
      UPDATE users
      SET name = $1,
          student_id = $2,
          program = $3,
          org_name = $4,
          industry = $5,
          supervisor_dept = $6
      WHERE email = $7
    `;
    const values = [
      profile.name || null,
      profile.studentId || null,
      profile.program || null,
      profile.orgName || null,
      profile.industry || null,
      profile.supervisorDept || null,
      email
    ];

    await pool.query(updateText, values);
    if (user.role === 'student') {
      await updateStudentMatch(user.id);
    }

    res.json({ message: 'Profile updated.' });
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/preferences', async (req, res) => {
  try {
    const { email, preferences } = req.body;
    if (!email || !preferences) {
      return res.status(400).json({ error: 'Email and preferences are required.' });
    }

    const userResult = await pool.query('SELECT id, role FROM users WHERE email = $1', [email]);
    const user = userResult.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const existingPref = await pool.query('SELECT id FROM preferences WHERE user_id = $1', [user.id]);
    if (existingPref.rows.length) {
      await pool.query(
        `UPDATE preferences SET location = $1, project_type = $2, required_skills = $3 WHERE user_id = $4`, 
        [preferences.location || null, preferences.projectType || null, preferences.requiredSkills || null, user.id]
      );
    } else {
      await pool.query(
        `INSERT INTO preferences (user_id, location, project_type, required_skills) VALUES ($1, $2, $3, $4)`, 
        [user.id, preferences.location || null, preferences.projectType || null, preferences.requiredSkills || null]
      );
    }

    if (user.role === 'student') {
      await updateStudentMatch(user.id);
    } else if (user.role === 'organization') {
      await matchAllStudents();
    }

    res.json({ message: 'Preferences saved.' });
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT email, role, name FROM users ORDER BY id');
    res.json(result.rows);
  } catch (error) {
    handleError(res, error);
  }
});

app.listen(port, () => {
  console.log(`IAMS backend listening on http://localhost:${port}`);
});
