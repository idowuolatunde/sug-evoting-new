// test-db.js
const mysql = require('mysql2/promise');
require('dotenv').config();

async function testConnection() {
    console.log("Testing Connection to:", process.env.DB_HOST);
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: process.env.DB_PORT || 4000,
            ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true }
        });
        console.log("✅ CONNECTION SUCCESSFUL!");
        const [rows] = await connection.execute('SELECT COUNT(*) as count FROM students');
        console.log("✅ DATA FETCHED! Student count:", rows[0].count);
        await connection.end();
    } catch (err) {
        console.error("❌ CONNECTION FAILED!");
        console.error("Error Code:", err.code);
        console.error("Error Message:", err.message);
    }
}

testConnection();