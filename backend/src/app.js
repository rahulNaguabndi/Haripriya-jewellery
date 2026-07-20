import express from 'express';
import cors from 'cors';
import morgan from 'morgan';

import authRoutes from './routes/auth.js';
import borrowerRoutes from './routes/borrowers.js';
import loanRoutes from './routes/loans.js';
import paymentRoutes from './routes/payments.js';
import adminRoutes from './routes/admin.js';
import reportRoutes from './routes/reports.js';
import noticeRoutes from './routes/notices.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { getBrandTheme } from './controllers/adminController.js';

const app = express();

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim());

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Public (no auth): the login page needs this deployment's brand colors
// before a session exists.
app.get('/api/theme', getBrandTheme);

app.use('/api/auth', authRoutes);
app.use('/api/borrowers', borrowerRoutes);
app.use('/api/loans', loanRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/notices', noticeRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
