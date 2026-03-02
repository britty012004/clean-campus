/**
 * authService.js
 * Full auth system using:
 *  - NeonDB (PostgreSQL via @neondatabase/serverless) for storing users and complaints
 *  - bcryptjs for password hashing / verification
 */

const bcrypt = require('bcryptjs');
const { sql } = require('./db');

const SALT_ROUNDS = 10;

// ─────────────────────────────────────────────
//  USER AUTH
// ─────────────────────────────────────────────

/**
 * Register a new user.
 * Hashes password and stores profile in NeonDB.
 */
async function registerUser({ name, email, password }) {
    // Determine role: emails containing 'admin' get admin role
    const role = email.toLowerCase().includes('admin') ? 'admin' : 'student';

    // Check for existing account
    const existing = await sql`SELECT id FROM users WHERE email = ${email} LIMIT 1`;
    if (existing.length > 0) {
        throw new Error('An account with this email already exists. Please log in.');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // Insert user
    const rows = await sql`
        INSERT INTO users (name, email, password, role)
        VALUES (${name}, ${email}, ${hashedPassword}, ${role})
        RETURNING uid, name, email, role
    `;

    const user = rows[0];
    return { uid: user.uid, name: user.name, email: user.email, role: user.role };
}

/**
 * Login a user.
 * Verifies password with bcrypt then returns the user profile.
 */
async function loginUser({ email, password }) {
    const rows = await sql`SELECT uid, name, email, password, role FROM users WHERE email = ${email} LIMIT 1`;

    if (rows.length === 0) {
        throw new Error('Invalid email or password. Please try again.');
    }

    const user = rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
        throw new Error('Invalid email or password. Please try again.');
    }

    return { uid: user.uid, name: user.name, email: user.email, role: user.role };
}

// ─────────────────────────────────────────────
//  COMPLAINTS
// ─────────────────────────────────────────────

async function createComplaint({ title, location, description, imageUrl, userId, userName }) {
    const rows = await sql`
        INSERT INTO complaints (title, location, description, image_url, user_id, user_name, status)
        VALUES (${title}, ${location}, ${description}, ${imageUrl || null}, ${userId}, ${userName}, 'Pending')
        RETURNING uid AS id, title, location, description, image_url AS "imageUrl", user_id AS "userId", user_name AS "userName", status, created_at AS "createdAt"
    `;
    return rows[0];
}

async function getAllComplaints() {
    try {
        const rows = await sql`
            SELECT
                uid         AS id,
                title,
                location,
                description,
                image_url   AS "imageUrl",
                user_id     AS "userId",
                user_name   AS "userName",
                status,
                created_at  AS "createdAt",
                updated_at  AS "updatedAt"
            FROM complaints
            ORDER BY created_at DESC
        `;
        return rows;
    } catch {
        return [];
    }
}

async function updateComplaintStatus(id, status) {
    await sql`
        UPDATE complaints
        SET status = ${status}, updated_at = NOW()
        WHERE uid = ${id}
    `;
}

module.exports = { registerUser, loginUser, createComplaint, getAllComplaints, updateComplaintStatus };
