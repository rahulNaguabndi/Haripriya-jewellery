import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { BranchProvider } from './context/BranchContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { ConfirmProvider } from './components/common/ConfirmDialog.jsx';
import './theme.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <BranchProvider>
            <ConfirmProvider>
              <App />
            </ConfirmProvider>
          </BranchProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);
