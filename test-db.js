const { Client } = require('pg');
require('dotenv').config();

const dbConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.PGHOST || 'localhost',
      port: Number(process.env.PGPORT || 5432),
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || 'postgres',
      database: process.env.PGDATABASE || 'iams'
    };

async function testDatabase() {
  const client = new Client(dbConfig);
  try {
    await client.connect();
    console.log('Connected to database');

    // Check if matches table exists and has data
    const matchesResult = await client.query('SELECT * FROM matches');
    console.log('Matches:', matchesResult.rows);

    // Check if users exist
    const usersResult = await client.query('SELECT id, email, role FROM users');
    console.log('Users:', usersResult.rows);

    // Test the organization students query
    const orgStudentsResult = await client.query(
      `SELECT u.id, u.name, u.email, u.student_id, u.program, p.location, p.project_type, m.score, m.created_at AS matched_at
       FROM users u
       JOIN matches m ON m.student_id = u.id
       JOIN users org ON org.id = m.organization_id
       LEFT JOIN preferences p ON p.user_id = u.id
       WHERE org.email = $1 AND u.role = 'student'
       ORDER BY m.created_at DESC`,
      ['hr@techcorp.co.bw']
    );
    console.log('Organization students:', orgStudentsResult.rows);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

testDatabase();