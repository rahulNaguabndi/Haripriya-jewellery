import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import AppShell from './components/common/AppShell.jsx';

import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import BorrowersList from './pages/BorrowersList.jsx';
import BorrowerDetail from './pages/BorrowerDetail.jsx';
import LoansList from './pages/LoansList.jsx';
import LoanDetail from './pages/LoanDetail.jsx';
import Payments from './pages/Payments.jsx';
import NoticesDue from './pages/NoticesDue.jsx';
import Reports from './pages/Reports.jsx';
import AdminSettings from './pages/AdminSettings.jsx';

function ProtectedRoute({ children }) {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div style={{ padding: 40 }}>Loading…</div>;
  if (!session) return <Navigate to="/login" state={{ from: location.pathname }} replace />;

  return <AppShell>{children}</AppShell>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/borrowers" element={<ProtectedRoute><BorrowersList /></ProtectedRoute>} />
      <Route path="/borrowers/:id" element={<ProtectedRoute><BorrowerDetail /></ProtectedRoute>} />
      <Route path="/loans" element={<ProtectedRoute><LoansList /></ProtectedRoute>} />
      <Route path="/loans/:id" element={<ProtectedRoute><LoanDetail /></ProtectedRoute>} />
      <Route path="/payments" element={<ProtectedRoute><Payments /></ProtectedRoute>} />
      <Route path="/notices" element={<ProtectedRoute><NoticesDue /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
      <Route path="/admin/settings" element={<ProtectedRoute><AdminSettings /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
