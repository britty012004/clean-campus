require('dotenv').config();
const express = require('express');
const path = require('path');
const morgan = require('morgan');
const session = require('express-session');
const multer = require('multer');

const logger = require('./middleware/logger');
const { requireAuth, requireAdmin } = require('./middleware/auth');
const { initDB } = require('./models/db');
const {
    registerUser,
    loginUser,
    createComplaint,
    getAllComplaints,
    updateComplaintStatus
} = require('./models/authService');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Multer (file uploads) ───────────────────────────────────────────────────
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } }); // 5 MB max

// ─── View Engine ─────────────────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(session({
    secret: process.env.SESSION_SECRET || 'campus-fallback-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 1000 * 60 * 60 * 24 } // 1 day
}));

// Expose session user to all EJS views
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

// ─── Public Routes ────────────────────────────────────────────────────────────

app.get('/', (req, res) => res.render('index', { title: 'Home' }));

// ── Signup ──
app.get('/signup', (req, res) => {
    if (req.session.user) return res.redirect('/');
    res.render('signup', { title: 'Sign Up', error: null });
});

app.post('/signup', async (req, res) => {
    const { name, email, password, confirmPassword } = req.body;

    if (!name || !email || !password) {
        return res.render('signup', { title: 'Sign Up', error: 'All fields are required.' });
    }
    if (password !== confirmPassword) {
        return res.render('signup', { title: 'Sign Up', error: 'Passwords do not match.' });
    }
    if (password.length < 6) {
        return res.render('signup', { title: 'Sign Up', error: 'Password must be at least 6 characters.' });
    }

    try {
        const user = await registerUser({ name, email, password });
        req.session.user = user;
        req.session.save(() => {
            if (user.role === 'admin') return res.redirect('/admin/dashboard');
            return res.redirect('/my-reports');
        });
    } catch (err) {
        logger.error('Signup error: ' + err.message);
        res.render('signup', { title: 'Sign Up', error: err.message });
    }
});

// ── Login ──
app.get('/login', (req, res) => {
    if (req.session.user) {
        return req.session.user.role === 'admin'
            ? res.redirect('/admin/dashboard')
            : res.redirect('/my-reports');
    }
    res.render('login', { title: 'Login', error: null });
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.render('login', { title: 'Login', error: 'Email and password are required.' });
    }

    try {
        const user = await loginUser({ email, password });
        req.session.user = user;
        req.session.save(() => {
            if (user.role === 'admin') return res.redirect('/admin/dashboard');
            return res.redirect('/my-reports');
        });
    } catch (err) {
        logger.error('Login error: ' + err.message);
        res.render('login', { title: 'Login', error: err.message });
    }
});

// ── Logout ──
app.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/'));
});

// ─── Protected: Student Routes ────────────────────────────────────────────────

app.get('/report', requireAuth, (req, res) => {
    res.render('report', { title: 'Report an Issue', error: null });
});

app.post('/report', requireAuth, upload.single('image'), async (req, res) => {
    const { title, location, description } = req.body;

    if (!title || !location || !description) {
        return res.render('report', { title: 'Report an Issue', error: 'All fields except photo are required.' });
    }

    try {
        await createComplaint({
            title,
            location,
            description,
            imageUrl: req.file ? `/uploads/${req.file.filename}` : null,
            userId: req.session.user.uid,
            userName: req.session.user.name
        });
        res.redirect('/my-reports');
    } catch (err) {
        logger.error('Report error: ' + err.message);
        res.render('report', { title: 'Report an Issue', error: 'Could not submit report. Please try again.' });
    }
});

app.get('/my-reports', requireAuth, async (req, res) => {
    try {
        const all = await getAllComplaints();
        const reports = all.filter(r => r.userId === req.session.user.uid);
        res.render('dashboard', { title: 'My Reports', reports, isAdmin: false });
    } catch (err) {
        logger.error('My Reports error: ' + err.message);
        res.render('dashboard', { title: 'My Reports', reports: [], isAdmin: false });
    }
});

// ─── Protected: Admin Routes ──────────────────────────────────────────────────

app.get('/admin/dashboard', requireAdmin, async (req, res) => {
    try {
        const reports = await getAllComplaints();
        res.render('dashboard', { title: 'Admin Dashboard', reports, isAdmin: true });
    } catch (err) {
        logger.error('Admin dashboard error: ' + err.message);
        res.render('dashboard', { title: 'Admin Dashboard', reports: [], isAdmin: true });
    }
});

app.post('/admin/update-status', requireAdmin, async (req, res) => {
    const { reportId, status } = req.body;
    try {
        await updateComplaintStatus(reportId, status);
    } catch (err) {
        logger.error('Status update error: ' + err.message);
    }
    res.redirect('/admin/dashboard');
});

// ─── Error Handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    logger.error(`Unhandled error: ${err.message}`);
    res.status(500).render('index', { title: 'Error' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
initDB()
    .then(() => {
        app.listen(PORT, () => {
            logger.info(`Server running at http://localhost:${PORT}`);
            console.log(`✅ Server running at http://localhost:${PORT}`);
        });
    })
    .catch(err => {
        console.error('❌ Failed to initialise database:', err.message);
        process.exit(1);
    });
