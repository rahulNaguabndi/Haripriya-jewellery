# Jewelry Lending Management Application - Complete Specification

## Overview
A full-stack web application for managing jewelry loans, tracking borrowers, recording payments, and calculating interest dynamically. Built with React (frontend), Node.js + Express.js (backend), and MongoDB (database). Uses Supabase for admin authentication.

---

## Tech Stack
- **Frontend**: React
- **Backend**: Node.js + Express.js
- **Database**: MongoDB (free tier)
- **Authentication**: Supabase (admin/staff only)
- **Hosting**: TBD (Vercel for frontend, Heroku/Railway for backend)

---

## Database Schema (MongoDB)

### 1. **Borrowers Collection**
```javascript
{
  _id: ObjectId,
  supabaseUserId: String, // Link to Supabase user who created this
  name: String, // Required
  phone: String,
  email: String,
  address: String,
  city: String,
  state: String,
  pincode: String,
  aadharOrId: String, // ID proof
  createdAt: Date,
  updatedAt: Date
}
```

### 2. **Loans Collection**
```javascript
{
  _id: ObjectId,
  borrowerId: ObjectId, // Reference to Borrowers
  loanNumber: String, // Auto-generated unique ID (e.g., LOAN-20240706-001)
  
  // Jewelry Details
  itemType: String, // e.g., "Ring", "Necklace", "Bracelet", etc.
  metalType: String, // "Gold", "Silver", "Platinum", etc.
  weight: Number, // in grams
  purity: String, // e.g., "22k", "925", etc. (optional)
  description: String, // Additional details
  
  // Loan Terms
  loanAmount: Number, // Principal amount in rupees
  loanDate: Date,
  dueDate: Date,
  status: String, // "active", "closed", "defaulted", "partial_payment"
  
  // Interest Configuration
  interestRate: Number, // Applied rate (%, annually) - calculated based on loanAmount
  interestType: String, // "compound_annual" (default)
  
  // Payment Tracking
  totalPaymentReceived: Number, // Sum of all payments
  partialPayments: [
    {
      paymentId: ObjectId,
      amount: Number,
      paymentDate: Date,
      notes: String
    }
  ],
  
  createdAt: Date,
  updatedAt: Date,
  createdBy: String // Supabase user ID
}
```

### 3. **Payments Collection** (Optional, for better tracking)
```javascript
{
  _id: ObjectId,
  loanId: ObjectId, // Reference to Loans
  borrowerId: ObjectId,
  amount: Number,
  paymentDate: Date,
  paymentType: String, // "cash", "cheque", "transfer", etc.
  notes: String,
  createdBy: String, // Supabase user ID
  createdAt: Date
}
```

### 4. **Interest Configuration Collection** (Admin Settings)
```javascript
{
  _id: ObjectId,
  configName: String, // "default", "special", etc.
  isActive: Boolean,
  tiers: [
    {
      minAmount: Number, // Minimum loan amount
      maxAmount: Number, // Maximum loan amount (null for unlimited)
      interestRate: Number, // Interest rate for this tier
      description: String
    }
  ],
  compoundingFrequency: String, // "annual", "quarterly", "monthly" (default: "annual")
  createdAt: Date,
  updatedAt: Date,
  updatedBy: String // Supabase user ID
}
```

Example Interest Tiers:
```javascript
{
  minAmount: 0,
  maxAmount: 999,
  interestRate: 36
},
{
  minAmount: 1000,
  maxAmount: null,
  interestRate: 24
}
```

### 5. **Admin Users Collection** (Optional, for internal tracking)
```javascript
{
  _id: ObjectId,
  supabaseUserId: String, // From Supabase
  email: String,
  fullName: String,
  role: String, // "super_admin", "admin", "staff"
  isActive: Boolean,
  lastLogin: Date,
  createdAt: Date,
  createdBy: String // Super admin who created this
}
```

---

## API Endpoints

### Authentication Endpoints (via Supabase)
- **POST** `/api/auth/login` - Login with email/password (Supabase handles)
- **POST** `/api/auth/logout` - Logout
- **GET** `/api/auth/me` - Get current user info

### Borrower Endpoints
- **POST** `/api/borrowers` - Create a new borrower
- **GET** `/api/borrowers` - List all borrowers (with pagination)
- **GET** `/api/borrowers/:id` - Get borrower details + all associated loans
- **PUT** `/api/borrowers/:id` - Update borrower info
- **DELETE** `/api/borrowers/:id` - Delete borrower (soft delete)
- **GET** `/api/borrowers/search?name=xyz` - Search borrowers by name

### Loan Endpoints
- **POST** `/api/loans` - Create a new loan
- **GET** `/api/loans` - List all loans (with filters & pagination)
- **GET** `/api/loans/:id` - Get loan details + calculated interest
- **PUT** `/api/loans/:id` - Update loan details
- **PATCH** `/api/loans/:id/status` - Change loan status
- **GET** `/api/loans?borrowerId=xyz` - Get all loans for a borrower
- **GET** `/api/loans?status=active` - Filter loans by status
- **GET** `/api/loans?metalType=gold` - Filter by metal type
- **GET** `/api/loans?itemType=ring` - Filter by item type
- **GET** `/api/loans?minAmount=1000&maxAmount=50000` - Filter by amount range

### Payment Endpoints
- **POST** `/api/payments` - Record a payment/partial payment
- **GET** `/api/payments/:loanId` - Get all payments for a loan
- **PUT** `/api/payments/:paymentId` - Update a payment
- **DELETE** `/api/payments/:paymentId` - Delete a payment (soft delete)

### Interest Calculation Endpoint
- **GET** `/api/loans/:id/interest-summary` - Get calculated interest for a specific loan
- **GET** `/api/borrowers/:id/interest-summary` - Get all interest calculations for a borrower's loans

Response format:
```javascript
{
  loanId: ObjectId,
  borrowerName: String,
  loanAmount: Number,
  loanDate: Date,
  daysElapsed: Number,
  appliedInterestRate: Number,
  calculatedInterest: Number, // Dynamically calculated
  expectedInterest: Number, // What should have been paid
  actualInterestCollected: Number,
  interestDifference: Number,
  status: String,
  partialPayments: Array
}
```

### Admin Configuration Endpoints
- **GET** `/api/admin/config/interest` - Get current interest configuration
- **PUT** `/api/admin/config/interest` - Update interest tiers
- **GET** `/api/admin/config/all` - Get all configurations
- **GET** `/api/admin/users` - List all admin users
- **POST** `/api/admin/users` - Create new admin user (super admin only)
- **DELETE** `/api/admin/users/:id` - Deactivate admin user (super admin only)

### Reporting & Analytics Endpoints
- **GET** `/api/reports/summary` - Dashboard summary (total loans, active loans, total interest, etc.)
- **GET** `/api/reports/borrower-summary` - Summary stats per borrower
- **GET** `/api/reports/outstanding-interest` - All open loans with outstanding interest
- **GET** `/api/reports/payments?dateFrom=xxx&dateTo=xxx` - Payments in a date range
- **GET** `/api/reports/overdue` - Overdue loans
- **GET** `/api/reports/closed` - Closed loans

---

## Interest Calculation Logic

### Formula:
```
A = P * (1 + r/100)^t

Where:
- A = Final Amount (Principal + Interest)
- P = Principal (Loan Amount)
- r = Annual Interest Rate (%)
- t = Time in years

Interest = A - P
```

### Implementation (Node.js):
```javascript
function calculateCompoundInterest(principal, annualRate, loanDateString, partialPayments = []) {
  const loanDate = new Date(loanDateString);
  const today = new Date();
  
  let remainingPrincipal = principal;
  let totalInterest = 0;
  
  // Sort partial payments by date
  const sortedPayments = partialPayments.sort((a, b) => 
    new Date(a.paymentDate) - new Date(b.paymentDate)
  );
  
  // Process periods between payments
  let currentDate = loanDate;
  let currentRate = annualRate;
  
  // Check if any tier applies (based on current outstanding principal)
  const applicableTier = getApplicableTier(remainingPrincipal);
  if (applicableTier) {
    currentRate = applicableTier.interestRate;
  }
  
  // Calculate interest period by period (between payments)
  for (let payment of sortedPayments) {
    const paymentDate = new Date(payment.paymentDate);
    const daysInPeriod = (paymentDate - currentDate) / (1000 * 60 * 60 * 24);
    const yearsInPeriod = daysInPeriod / 365;
    
    // Compound interest for this period
    const amount = remainingPrincipal * Math.pow(1 + currentRate/100, yearsInPeriod);
    const interestThisPeriod = amount - remainingPrincipal;
    
    totalInterest += interestThisPeriod;
    remainingPrincipal -= payment.amount; // Reduce principal by payment
    
    currentDate = paymentDate;
    
    // Re-check tier for new principal
    const newApplicableTier = getApplicableTier(remainingPrincipal);
    if (newApplicableTier) {
      currentRate = newApplicableTier.interestRate;
    }
  }
  
  // Calculate interest from last payment (or loan date) to today
  const finalDays = (today - currentDate) / (1000 * 60 * 60 * 24);
  const finalYears = finalDays / 365;
  const finalAmount = remainingPrincipal * Math.pow(1 + currentRate/100, finalYears);
  const finalInterest = finalAmount - remainingPrincipal;
  
  totalInterest += finalInterest;
  
  return {
    principalRemaining: remainingPrincipal,
    totalInterestAccrued: Math.round(totalInterest * 100) / 100,
    totalAmountDue: Math.round((remainingPrincipal + totalInterest) * 100) / 100,
    daysElapsed: (today - loanDate) / (1000 * 60 * 60 * 24)
  };
}

function getApplicableTier(principalAmount) {
  // Fetch from interest configuration and return applicable tier
  // This should call the interest config from DB
}
```

---

## Frontend Components Structure

### Pages
1. **Login** (`/login`)
   - Email/password login
   - Supabase authentication

2. **Dashboard** (`/dashboard`)
   - Summary cards (total loans, active loans, total interest)
   - Quick stats (overdue loans, recent payments)
   - Recent activity feed

3. **Borrowers** (`/borrowers`)
   - List all borrowers with search/filter
   - Create new borrower form
   - Borrower detail page with all their loans

4. **Loans** (`/loans`)
   - List all loans with multi-filter (status, borrower, metal type, item type, amount range)
   - Create new loan form
   - Loan detail page:
     - Loan summary
     - Interest calculation display
     - Partial payment history
     - Add partial payment form
     - Update loan details

5. **Payments** (`/payments`)
   - View all payments
   - Filter by date range, borrower, loan
   - Payment details

6. **Reports** (`/reports`)
   - Outstanding interest report
   - Payment summary by date range
   - Overdue loans report
   - Borrower-wise summary
   - Charts/graphs for visualization

7. **Admin Settings** (`/admin/settings`)
   - Interest tier configuration
   - Admin user management (super admin only)
   - System configuration

### Key Components
- **BorrowerForm**: Create/edit borrower
- **LoanForm**: Create/edit loan
- **PaymentForm**: Record payment
- **InterestSummaryCard**: Display interest info
- **FilterBar**: Multi-filter for loans
- **DataTable**: Reusable table with sorting/pagination
- **Chart**: For reporting (charts.js or recharts)

---

## Supabase Authentication Setup

### Tables needed in Supabase (optional, for reference):
- Use Supabase's built-in auth users table
- Store only essential info (email, role)
- Backend validates tokens and checks roles

### Backend JWT Verification:
```javascript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Middleware to verify auth
async function verifyAuth(req, res, next) {
  const token = req.headers.authorization?.split('Bearer ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token' });
  }
  
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error) throw error;
    
    req.user = data.user;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
}
```

### Super Admin Password Management:
- Super admin manually creates accounts in Supabase
- Shares email + temporary password with staff
- Staff logs in and can change password (optional feature)
- No complex password reset flow (keep it simple)

---

## Configuration & Admin Dashboard

### Configurable Settings:
1. **Interest Tiers** (main config)
   - Define minimum loan amount
   - Set interest rate for each tier
   - Enable/disable tiers

2. **Optional Future Configs**:
   - Compounding frequency
   - Default loan duration
   - Late payment penalties
   - Email notifications

### Admin Dashboard Features:
- View/edit interest tiers
- Create/deactivate admin users
- View system logs/audit trail (optional)
- Backup data (optional)

---

## Folder Structure (Recommended)

```
jewelry-lending-app/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── db.js
│   │   ├── models/
│   │   │   ├── Borrower.js
│   │   │   ├── Loan.js
│   │   │   ├── Payment.js
│   │   │   ├── InterestConfig.js
│   │   │   └── AdminUser.js
│   │   ├── routes/
│   │   │   ├── borrowers.js
│   │   │   ├── loans.js
│   │   │   ├── payments.js
│   │   │   ├── admin.js
│   │   │   ├── reports.js
│   │   │   └── auth.js
│   │   ├── controllers/
│   │   │   ├── borrowerController.js
│   │   │   ├── loanController.js
│   │   │   ├── paymentController.js
│   │   │   └── reportController.js
│   │   ├── utils/
│   │   │   ├── interestCalculator.js
│   │   │   └── validators.js
│   │   ├── middleware/
│   │   │   ├── auth.js
│   │   │   └── errorHandler.js
│   │   └── app.js
│   ├── .env (store secrets)
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Borrowers/
│   │   │   ├── Loans/
│   │   │   ├── Payments/
│   │   │   ├── Reports/
│   │   │   ├── Admin/
│   │   │   └── common/
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   ├── BorrowersList.jsx
│   │   │   ├── LoansList.jsx
│   │   │   ├── Reports.jsx
│   │   │   └── AdminSettings.jsx
│   │   ├── services/
│   │   │   └── api.js (axios instance)
│   │   ├── context/
│   │   │   └── AuthContext.js
│   │   ├── utils/
│   │   │   └── formatters.js
│   │   ├── App.jsx
│   │   └── index.js
│   ├── .env (API_BASE_URL, SUPABASE_URL, etc.)
│   └── package.json
│
└── README.md
```

---

## Key Features Summary

✅ **Borrower Management**
- Create/view/edit borrowers
- Track multiple loans per borrower
- Search borrowers by name

✅ **Loan Management**
- Create loans with jewelry details (type, metal, weight, value)
- Track loan status (active, closed, defaulted)
- Filter by multiple criteria (borrower, metal type, item type, amount range, status)

✅ **Interest Calculation**
- Dynamic compound annual interest calculation
- Tiered interest rates based on loan amount
- Adjustable interest configuration
- Account for partial payments in interest calculation

✅ **Payment Tracking**
- Record partial payments with dates
- Track total payments received vs. principal
- Interest calculation adjusts for partial payments

✅ **Dashboard & Reporting**
- Summary cards for quick stats
- Outstanding interest report
- Payment history by date range
- Overdue loans report
- Borrower-wise summaries

✅ **Admin Features**
- Supabase authentication (email/password)
- Interest tier configuration
- Admin user management (super admin only)
- Role-based access (super admin, admin, staff)

---

## Environment Variables

### Backend (.env)
```
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/jewelry_lending
PORT=5000
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
NODE_ENV=development
```

### Frontend (.env)
```
REACT_APP_API_BASE_URL=http://localhost:5000/api
REACT_APP_SUPABASE_URL=https://xxxxx.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your_anon_key
```

---

## Next Steps to Build
1. Set up Supabase project and create auth
2. Set up MongoDB database and collections
3. Build backend (Express.js with routes, controllers, models)
4. Implement interest calculation logic
5. Build React frontend with all components
6. Connect frontend to backend via API
7. Test all filtering, calculations, and reporting
8. Deploy backend and frontend

---

## Notes
- **Market Value Integration**: Planned for future enhancement; can add API integration for real-time gold/silver prices later
- **Payments in Cash**: System tracks payment dates and amounts; assumes manual entry (no payment gateway)
- **Interest Recalculation**: Happens dynamically when viewing loans (not pre-calculated and stored)
- **Password Management**: Super admin creates accounts and shares passwords via email (simple approach, no password reset flow)
