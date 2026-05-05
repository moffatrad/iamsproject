const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config();

// Support both DATABASE_URL (Railway) and individual env vars (local dev)
const dbConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.PGHOST || 'localhost',
      port: Number(process.env.PGPORT || 5432),
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || 'postgres',
      database: process.env.PGDATABASE || 'iams'
    };

async function applySchema() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  const client = new Client(dbConfig);
  try {
    await client.connect();
    console.log('Applying schema...');
    await client.query(sql);
    console.log('Schema applied successfully.');
  } finally {
    await client.end();
  }
}

async function seedSampleData() {
  const client = new Client(dbConfig);
  try {
    await client.connect();
    console.log('Seeding sample users...');

    const hashedPassword = await bcrypt.hash('password', 10);

    await client.query(
      `INSERT INTO users (email, password, role, name, student_id, program)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (email) DO UPDATE
         SET password = EXCLUDED.password,
             role = EXCLUDED.role,
             name = EXCLUDED.name,
             student_id = EXCLUDED.student_id,
             program = EXCLUDED.program`,
      ['student@uni.ac.bw', hashedPassword, 'student', 'Alex Motho', '201403857', 'Computer Science']
    );

    await client.query(
      `INSERT INTO users (email, password, role, name, org_name, industry)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (email) DO UPDATE
         SET password = EXCLUDED.password,
             role = EXCLUDED.role,
             name = EXCLUDED.name,
             org_name = EXCLUDED.org_name,
             industry = EXCLUDED.industry`,
      ['hr@techcorp.co.bw', hashedPassword, 'organization', null, 'TechCorp Ltd', 'Software Development']
    );

    await client.query(
      `INSERT INTO users (email, password, role, name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE
         SET password = EXCLUDED.password,
             role = EXCLUDED.role,
             name = EXCLUDED.name`,
      ['coordinator@cs.ub.bw', hashedPassword, 'coordinator', 'Prof. T. Selelo']
    );

    await client.query(
      `INSERT INTO users (email, password, role, name, supervisor_dept)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE
         SET password = EXCLUDED.password,
             role = EXCLUDED.role,
             name = EXCLUDED.name,
             supervisor_dept = EXCLUDED.supervisor_dept`,
      ['supervisor@ub.bw', hashedPassword, 'supervisor', 'Dr. L. Mokgweetsi', 'Computer Science']
    );

    await client.query(
      `INSERT INTO preferences (user_id, location, project_type)
       VALUES ((SELECT id FROM users WHERE email = $1), $2, $3)
       ON CONFLICT (user_id) DO NOTHING`,
      ['student@uni.ac.bw', 'Gaborone', 'Web Dev']
    );

    await client.query(
      `INSERT INTO preferences (user_id, required_skills)
       VALUES ((SELECT id FROM users WHERE email = $1), $2)
       ON CONFLICT (user_id) DO NOTHING`,
      ['hr@techcorp.co.bw', 'JavaScript, Python']
    );

    await client.query(
      `INSERT INTO logbooks (user_id, week, content)
       VALUES ((SELECT id FROM users WHERE email = $1), $2, $3)`,
      ['student@uni.ac.bw', 1, 'Onboarding and orientation']
    );

    // Create sample matches
    await client.query(
      `INSERT INTO matches (student_id, organization_id, score)
       VALUES (
         (SELECT id FROM users WHERE email = $1),
         (SELECT id FROM users WHERE email = $2),
         $3
       )
       ON CONFLICT (student_id) DO NOTHING`,
      ['student@uni.ac.bw', 'hr@techcorp.co.bw', 85]
    );

    console.log('Sample data seeded.');
  } finally {
    await client.end();
  }
}

(async () => {
  try {
    await applySchema();
    await seedSampleData();
    console.log('✅ Database initialization complete.');
  } catch (error) {
    console.error('❌ Database initialization failed:', error.message || error);
    process.exit(1);
  }
})();
