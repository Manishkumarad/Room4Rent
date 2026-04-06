const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const env = require('./config/env');
const authRoutes = require('./routes/auth.routes');
const adminRoutes = require('./routes/admin.routes');
const listingRoutes = require('./routes/listing.routes');
const membershipRoutes = require('./routes/membership.routes');
const studentRoutes = require('./routes/student.routes');
const chatRoutes = require('./routes/chat.routes');
const engagementRoutes = require('./routes/engagement.routes');
const immersiveRoutes = require('./routes/immersive.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const verificationRoutes = require('./routes/verification.routes');
const profileRoutes = require('./routes/profile.routes');
const healthRoutes = require('./routes/health.routes');
const { errorHandler } = require('./middlewares/errorHandler');

const app = express();

app.use(helmet());
app.use(cors({ origin: env.corsOrigin }));
app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false
}));

app.get('/', (req, res) => {
  res.status(200).json({
    service: 'roomrental-backend',
    status: 'running'
  });
});

app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/memberships', membershipRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/engagement', engagementRoutes);
app.use('/api/immersive', immersiveRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/verifications', verificationRoutes);
app.use('/api/profile', profileRoutes);

app.use(errorHandler);

module.exports = app;
