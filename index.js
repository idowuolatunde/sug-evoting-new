const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// DIAGNOSTIC: Print detected environment variables (NOT values)
console.log("Checking Environment Variables...");
console.log("DB_HOST detected:", !!process.env.DB_HOST);
console.log("DB_USER detected:", !!process.env.DB_USER);
console.log("DB_NAME detected:", !!process.env.DB_NAME);

// 1. Health Check
app.get('/', (req, res) => {
    console.log("Health check received");
    res.send("SUG E-Voting Server is LIVE!");
});

// 2. Database Connection with SSL
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 4000,
    ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true }
});

// 3. Login Route with Enhanced Error Reporting
app.post('/api/auth/login', (req, res) => {
    const { matric_number, password } = req.body;
    console.log(`Login attempt for: ${matric_number}`);

    db.query('SELECT id, matric_number, name FROM students WHERE matric_number = ? AND password = ?', 
    [matric_number, password], (err, results) => {
        if (err) {
            console.error("MYSQL ERROR:", err);
            // This returns the FULL error code and message to the phone
            return res.status(500).json({ 
                message: `Database Error [${err.code}]: ${err.message || 'No message'}` 
            });
        }
        
        if (results && results.length > 0) {
            console.log("Login successful");
            res.json({ token: "demo-token", student: results[0] });
        } else {
            console.log("Invalid credentials");
            res.status(401).json({ message: "Invalid matric number or password" });
        }
    });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`SERVER RUNNING ON PORT ${PORT}`);
});