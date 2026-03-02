/**
 * db.js
 * NeonDB (PostgreSQL) connection pool using @neondatabase/serverless.
 * All queries in the app go through this pool.
 */

const { neon } = require('@neondatabase/serverless');

if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set in .env. Please add your NeonDB connection string.');
}

const sql = neon(process.env.DATABASE_URL);

/**
 * Initialise the database schema on startup.
 * Creates the `users` and `complaints` tables if they don't already exist.
 */
async function initDB() {
    await sql`
        CREATE TABLE IF NOT EXISTS users (
            id          SERIAL PRIMARY KEY,
            uid         UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
            name        VARCHAR(255) NOT NULL,
            email       VARCHAR(255) UNIQUE NOT NULL,
            password    VARCHAR(255) NOT NULL,
            role        VARCHAR(50)  NOT NULL DEFAULT 'student',
            created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        )
    `;

    await sql`
        CREATE TABLE IF NOT EXISTS complaints (
            id          SERIAL PRIMARY KEY,
            uid         UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
            title       VARCHAR(255) NOT NULL,
            location    VARCHAR(255) NOT NULL,
            description TEXT         NOT NULL,
            image_url   VARCHAR(500),
            user_id     UUID         NOT NULL,
            user_name   VARCHAR(255) NOT NULL,
            status      VARCHAR(50)  NOT NULL DEFAULT 'Pending',
            created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            updated_at  TIMESTAMPTZ
        )
    `;

    console.log('✅ NeonDB schema ready.');
}

module.exports = { sql, initDB };
