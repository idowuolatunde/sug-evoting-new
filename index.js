const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// 1. Health Check
app.get('/', (req, res) => {
    res.send("SUG E-Voting Server is LIVE!");
});

// 2. Database Connection
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 4000,
    ssl: {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true
    }
});

// 3. Auth Middleware
const authenticate = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ message: "No token provided" });
    // In production, verify JWT. For demo, we assume valid.
    req.studentId = 1;
    next();
};

// 4. Login Route
app.post('/api/auth/login', (req, res) => {
    const { matric_number, password } = req.body;
    db.query('SELECT id, matric_number, name, faculty, department, has_voted FROM students WHERE matric_number = ? AND password = ?',
    [matric_number, password], (err, results) => {
        if (err) {
            console.error("Login SQL Error:", err);
            return res.status(500).json({ message: "Database Error: " + err.message });
        }
        if (results.length > 0) {
            const student = results[0];
            student.has_voted = student.has_voted === 1 || student.has_voted === true;
            res.json({ token: "demo-jwt-token", student: student });
        } else {
            res.status(401).json({ message: "Invalid matric number or password" });
        }
    });
});

// 5. Get Election Data (Positions & Candidates)
app.get('/api/election', authenticate, (req, res) => {
    const query = `
        SELECT e.id as e_id, e.name as e_name, e.status as e_status,
               p.id as p_id, p.name as p_name,
               c.id as c_id, c.name as c_name, c.department as c_dept, c.manifesto as c_manifesto
        FROM elections e
        LEFT JOIN positions p ON e.id = p.election_id
        LEFT JOIN candidates c ON p.id = c.position_id
        WHERE e.status = 'open'
    `;
    db.query(query, (err, results) => {
        if (err) {
            console.error("Election SQL Error:", err);
            return res.status(500).json({ message: "Error fetching election data" });
        }

        console.log("DB Results for /api/election:", results.length, "rows found");

        if (!results || results.length === 0) {
            return res.json({
                election: { id: 0, name: "No Active Election", status: "closed" },
                positions: []
            });
        }

        const election = {
            id: results[0].e_id || 0,
            name: results[0].e_name || "Unknown Election",
            status: results[0].e_status || "closed"
        };

        const positionsMap = {};

        results.forEach(row => {
            if (row.p_id) {
                if (!positionsMap[row.p_id]) {
                    positionsMap[row.p_id] = { id: row.p_id, name: row.p_name, candidates: [] };
                }
                if (row.c_id) {
                    positionsMap[row.p_id].candidates.push({
                        id: row.c_id, name: row.c_name, department: row.c_dept, manifesto: row.c_manifesto
                    });
                }
            }
        });

        const finalPositions = Object.values(positionsMap);
        console.log("Returning", finalPositions.length, "positions to app");
        res.json({ election, positions: finalPositions });
    });
});

// 6. Get Voting Status (Truly Dynamic)
app.get('/api/status', authenticate, (req, res) => {
    // Check both student's voted status AND if any election is open
    const query = `
        SELECT
            (SELECT has_voted FROM students WHERE id = ?) as has_voted,
            (SELECT status FROM elections WHERE status = 'open' LIMIT 1) as election_status
    `;
    db.query(query, [req.studentId], (err, results) => {
        if (err) {
            console.error("Status SQL Error:", err);
            return res.status(500).json({ message: "Error checking status" });
        }

        if (!results || results.length === 0) {
            return res.json({ has_voted: false, election_status: "closed" });
        }

        res.json({
            has_voted: results[0].has_voted === 1,
            election_status: results[0].election_status || "closed"
        });
    });
});

// 7. Submit Vote
app.post('/api/votes', authenticate, (req, res) => {
    const { election_id, votes } = req.body;
    const studentId = req.studentId;

    db.query('SELECT has_voted FROM students WHERE id = ?', [studentId], (err, results) => {
        if (err || !results[0]) return res.status(500).json({ message: "Error checking status" });
        if (results[0].has_voted) return res.status(400).json({ message: "Already voted" });

        if (!votes || votes.length === 0) return res.status(400).json({ message: "Ballot is empty" });

        const voteValues = votes.map(v => [studentId, election_id, v.position_id, v.candidate_id]);
        db.query('INSERT INTO votes (student_id, election_id, position_id, candidate_id) VALUES ?', [voteValues], (err) => {
            if (err) {
                console.error("Vote Insert Error:", err);
                return res.status(500).json({ message: "Voting failed. Please try again." });
            }
            db.query('UPDATE students SET has_voted = 1 WHERE id = ?', [studentId], () => {
                res.json({ success: true, message: "Vote submitted successfully!" });
            });
        });
    });
});

// 8. Get Results
app.get('/api/results', (req, res) => {
    const query = `
        SELECT p.name as position_name, c.name as candidate_name, COUNT(v.id) as vote_count
        FROM positions p
        JOIN candidates c ON p.id = c.position_id
        LEFT JOIN votes v ON c.id = v.candidate_id
        GROUP BY p.id, c.id
        ORDER BY p.id, vote_count DESC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ message: "Error fetching results" });

        const resultsMap = {};
        results.forEach(row => {
            if (!resultsMap[row.position_name]) {
                resultsMap[row.position_name] = { name: row.position_name, results: [] };
            }
            resultsMap[row.position_name].results.push({
                name: row.candidate_name,
                votes: row.vote_count,
                percentage: 0
            });
        });

        res.json({
            election: { name: "2026 SUG Live Results" },
            results: Object.values(resultsMap)
        });
    });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`SERVER RUNNING ON PORT ${PORT}`);
});
