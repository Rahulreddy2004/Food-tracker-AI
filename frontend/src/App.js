import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Home from './components/Home';
import Scanner from './components/Scanner';
import Login from './components/Login';
import ProtectedRoute from './components/ProtectedRoute';
import Diary from './components/Diary';
import Profile from './components/Profile';
import Dashboard from './components/Dashboard';
import BarcodeScanner from './components/BarcodeScanner';
import MyFoods from './components/MyFoods';

// --- 1. IMPORT THE NEW WIDGET & AUTH HOOK ---
import ChatWidget from './components/ChatWidget';
import useAuth from './hooks/useAuth';

function App() {
  // --- 2. CHECK IF USER IS LOGGED IN ---
  const { currentUser, loading } = useAuth();

  return (
    <div className="App">
      <Routes>
        <Route path="/login" element={<Login />} />
        
        <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
        <Route path="/scanner/:mode" element={<ProtectedRoute><Scanner /></ProtectedRoute>} />
        <Route path="/diary" element={<ProtectedRoute><Diary /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/barcode-scanner" element={<ProtectedRoute><BarcodeScanner /></ProtectedRoute>} />
        <Route path="/my-foods" element={<ProtectedRoute><MyFoods /></ProtectedRoute>} />
      </Routes>
      
      {/* --- 3. ADD THE WIDGET (only shows if logged in) --- */}
      {!loading && currentUser && <ChatWidget />}
    </div>
  );
}

export default App;