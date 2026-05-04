const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Mock database - in-memory storage for development
let mockUsers = [
  {
    id: 1,
    email: 'student@uni.ac.bw',
    password: '$2a$10$hashedpassword', // 'password' hashed
    role: 'student',
    name: 'Alex Motho',
    student_id: '201403857',
    program: 'Computer Science'
  },
  {
    id: 2,
    email: '20200221@ub.ac.bw',
    password: '$2a$10$hashedpassword', // 'password' hashed
    role: 'student',
    name: 'U.B. Student',
    student_id: '20200221',
    program: 'Computer Science'
  },
  {
    id: 3,
    email: 'coordinator@cs.ub.bw',
    password: '$2a$10$hashedpassword', // 'password' hashed
    role: 'coordinator',
    name: 'Dr. Coordinator',
    department: 'Computer Science'
  }
];

let mockLogbooks = [];
let mockOrganizations = [];
let resetCodes = {};

function generateResetCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Hash the default password
async function initializeMockData() {
  const hashedPassword = await bcrypt.hash('password', 10);
  mockUsers.forEach(user => {
    user.password = hashedPassword;
  });
  console.log('✅ Mock database initialized');
}

initializeMockData();

console.log('✅ Connected to Mock Database');

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

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.post('/api/signup', async (req, res) => {
  try {
    const { email, password, role, profile } = req.body;
    const name = profile?.name || '';
    const studentId = profile?.studentId || profile?.student_id || '';
    const program = profile?.program || '';
    const orgName = profile?.orgName || profile?.organizationName || '';
    const industry = profile?.industry || '';
    const supervisorDept = profile?.supervisorDept || profile?.department || '';

    if (!email || !password || !role || !name) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    // Check if user already exists
    const existingUser = mockUsers.find(u => u.email === email);
    if (existingUser) {
      return res.status(409).json({ error: 'User already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const savedName = name || (role === 'organization' ? orgName : null);
    const newUser = {
      id: mockUsers.length + 1,
      email,
      password: hashedPassword,
      role,
      name: savedName,
      student_id: studentId || null,
      program: program || null,
      org_name: orgName || null,
      industry: industry || null,
      supervisor_dept: supervisorDept || null
    };

    mockUsers.push(newUser);
    res.status(201).json({
      message: 'User created successfully.',
      email,
      role,
      profile: {
        name: savedName,
        studentId: studentId || null,
        program: program || null,
        orgName: orgName || null,
        industry: industry || null,
        supervisorDept: supervisorDept || null
      }
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password, role } = req.body;
    if (!email || !password || !role) {
      return res.status(400).json({ error: 'Email, password, and role are required.' });
    }

    const user = mockUsers.find(u => u.email === email);
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

    // Return user data without password
    const { password: _, ...userWithoutPassword } = user;
    res.json({
      message: 'Login successful.',
      user: userWithoutPassword,
      token: 'mock-jwt-token-' + user.id
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Mock other endpoints
app.post('/api/verify-otp', (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) {
    return res.status(400).json({ error: 'Email and code are required.' });
  }
  if (resetCodes[email] && resetCodes[email] === code) {
    return res.json({ message: 'OTP verified successfully.' });
  }
  return res.status(401).json({ error: 'Invalid or expired OTP.' });
});

app.post('/api/forgot-password', (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required.' });
  }

  const user = mockUsers.find(u => u.email === email);
  if (!user) {
    return res.json({ message: 'If this email is registered, a password reset code has been sent.' });
  }

  const otpCode = generateResetCode();
  resetCodes[email] = otpCode;
  return res.json({
    message: 'Password reset email sent.',
    otpCode
  });
});

app.post('/api/reset-password', async (req, res) => {
  const { email, code, newPassword } = req.body;
  if (!email || !code || !newPassword) {
    return res.status(400).json({ error: 'Email, code, and new password are required.' });
  }
  if (!resetCodes[email] || resetCodes[email] !== code) {
    return res.status(401).json({ error: 'Invalid or expired reset code.' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
  }

  const user = mockUsers.find(u => u.email === email);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  user.password = await bcrypt.hash(newPassword, 10);
  delete resetCodes[email];
  res.json({ message: 'Password reset successfully.' });
});

app.get('/api/me', (req, res) => {
  // Mock authenticated user
  const user = mockUsers[0];
  const { password, ...userWithoutPassword } = user;
  res.json(userWithoutPassword);
});

app.get('/api/dashboard-stats', (req, res) => {
  res.json({
    totalStudents: 150,
    totalOrganizations: 25,
    totalSupervisors: 30,
    pendingMatches: 45
  });
});

app.get('/api/coordinator/students', (req, res) => {
  res.json(mockUsers.filter(u => u.role === 'student'));
});

app.get('/api/logbooks', (req, res) => {
  res.json(mockLogbooks);
});

app.post('/api/logbooks', (req, res) => {
  const newLogbook = {
    id: mockLogbooks.length + 1,
    ...req.body,
    created_at: new Date()
  };
  mockLogbooks.push(newLogbook);
  res.status(201).json(newLogbook);
});

// Catch-all handler for unhandled routes
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, () => {
  console.log(`🚀 IAMS backend (MOCK MODE) listening on http://localhost:${port}`);
  console.log('📝 Using in-memory database for development');
});