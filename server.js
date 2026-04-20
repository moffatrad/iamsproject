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
  .then(client => {
    console.log('✅ Connected to PostgreSQL');
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

async function validateSignupPayload(role, password, profile) {
  if (!password || password.length < 6) {
    return 'Password must be at least 6 characters long.';
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

async function findBestOrgMatch(studentId) {
  const studentPrefResult = await pool.query(
    `SELECT p.location, p.project_type FROM preferences p
     JOIN users u ON u.id = p.user_id
     WHERE u.id = $1 AND u.role = 'student'`,
    [studentId]
  );

  const studentPref = studentPrefResult.rows[0];
  if (!studentPref) {
    return { match: null, recommendations: [] };
  }

  const orgResult = await pool.query(
    `SELECT u.id, u.email, u.name, p.required_skills FROM users u
     JOIN preferences p ON p.user_id = u.id
     WHERE u.role = 'organization'`);

  const projectType = normalizeToken(studentPref.project_type);
  const location = normalizeToken(studentPref.location);
  const candidates = [];

  for (const org of orgResult.rows) {
    const skills = tokenize(org.required_skills);
    let score = 0;
    if (projectType) {
      score += skills.reduce((sum, token) => sum + (token.includes(projectType) ? 1 : 0), 0);
    }
    if (location) {
      score += skills.reduce((sum, token) => sum + (token.includes(location) ? 1 : 0), 0);
    }
    if (score > 0) {
      candidates.push({ ...org, score });
    }
  }

  if (candidates.length === 0) {
    const recommendations = orgResult.rows
      .map(org => {
        const skills = tokenize(org.required_skills);
        const score = skills.reduce((sum, token) => sum + (token.includes(projectType) ? 1 : 0), 0);
        return { ...org, score };
      })
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
  for (const student of students.rows) {
    await updateStudentMatch(student.id);
  }
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
    const insertUserText = `
      INSERT INTO users (email, password, role, name, student_id, program, org_name, industry, supervisor_dept)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, email, role, name
    `;
    const userValues = [
      email,
      hashedPassword,
      role,
      profile?.name || null,
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
      await updateStudentMatch(userId);
    } else if (role === 'organization') {
      await matchAllStudents();
    }

    res.status(201).json({ message: 'Account created.', email, role, name: profile?.name || null });
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
    const responsePayload = { message: 'If this email is registered, a password reset code has been sent.' };
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      responsePayload.otpCode = otpCode;
    }
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

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
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
      `SELECT m.score, u.email AS org_email, u.name AS org_name FROM matches m
       JOIN users u ON u.id = m.organization_id
       WHERE m.student_id = $1`,
      [user.id]
    );

    const preferences = prefResult.rows[0] || null;
    const match = matchResult.rows[0] || null;
    let recommendations = [];
    let organizations = [];

    if (user.role === 'student') {
      const matchInfo = await findBestOrgMatch(user.id);
      if (!matchInfo.match) {
        recommendations = matchInfo.recommendations;
      }
      const orgsResult = await pool.query(
        `SELECT u.email, u.name, u.org_name, p.required_skills
         FROM users u
         LEFT JOIN preferences p ON p.user_id = u.id
         WHERE u.role = 'organization'`
      );
      organizations = orgsResult.rows.map(row => ({
        email: row.email,
        name: row.name,
        orgName: row.org_name,
        requiredSkills: row.required_skills
      }));
    }

    let supervisorStudents = [];
    if (user.role === 'supervisor' && user.supervisor_dept) {
      const supervisorResult = await pool.query(
        `SELECT u.email, u.name, u.student_id, u.program, p.location, p.project_type, m.score, ou.email AS org_email, ou.name AS org_name
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
      matchedOrganization: match ? { email: match.org_email, name: match.org_name, score: match.score } : null,
      recommendations,
      organizations,
      supervisorStudents
    });
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
              m.score, ou.email AS organization_email, ou.name AS organization_name
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

app.get('/api/coordinator/organizations', async (req, res) => {
  try {
    const role = req.query.role;
    if (role !== 'coordinator') {
      return res.status(403).json({ error: 'Only coordinators can access this endpoint.' });
    }

    const result = await pool.query(
      `SELECT u.email, u.name, p.required_skills,
              ARRAY_REMOVE(ARRAY_AGG(su.name) FILTER (WHERE su.name IS NOT NULL), NULL) AS students
       FROM users u
       LEFT JOIN preferences p ON p.user_id = u.id
       LEFT JOIN matches m ON m.organization_id = u.id
       LEFT JOIN users su ON su.id = m.student_id
       WHERE u.role = 'organization'
       GROUP BY u.id, p.required_skills`
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
      `SELECT u.name AS student_name, u.email AS student_email, l.week, l.content, l.created_at
       FROM logbooks l
       JOIN users u ON u.id = l.user_id
       WHERE u.role = 'student'
       ORDER BY l.created_at DESC`
    );
    res.json(result.rows);
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
