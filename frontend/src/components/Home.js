import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
// --- 1. Remove MessageSquare ---
import { Camera, Upload, LogOut, BookOpen, User, LayoutDashboard, Barcode, Package } from 'lucide-react';
import { auth } from '../firebaseConfig';
import { signOut } from 'firebase/auth';

function Home() {
  const navigate = useNavigate();

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      navigate('/login');
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  return (
    <>
      <nav className="header-nav">
        <Link to="/dashboard" className="nav-button">
          <LayoutDashboard size={18} /> Dashboard
        </Link>
        <Link to="/profile" className="nav-button">
          <User size={18} /> My Profile
        </Link>
        <Link to="/diary" className="nav-button">
          <BookOpen size={18} /> My Diary
        </Link>
        <Link to="/my-foods" className="nav-button">
          <Package size={18} /> My Pantry
        </Link>
        {/* --- 2. DELETE THE AI CHAT LINK --- */}
        <button onClick={handleSignOut} className="nav-button sign-out-button">
          <LogOut size={18} /> Sign Out
        </button>
      </nav>

      <div className="container home-container">
        {/* ... (rest of the file is unchanged) ... */}
        <header className="app-header">
          <h1>Food Tracker AI</h1>
          <p>Your Personal AI Nutrition Assistant</p>
        </header>
        
        <div className="choice-container-grid3">
          <Link to="/scanner/live" className="choice-card">
            <Camera size={48} />
            <h2>Live Detection</h2>
            <p>Use your camera to scan un-packaged food.</p>
          </Link>
          <Link to="/scanner/upload" className="choice-card">
            <Upload size={48} />
            <h2>Upload Image</h2>
            <p>Analyze a photo from your library.</p>
          </Link>
          <Link to="/barcode-scanner" className="choice-card">
            <Barcode size={48} />
            <h2>Scan Barcode</h2>
            <p>Log packaged food from its barcode.</p>
          </Link>
        </div>
      </div>
    </>
  );
}

export default Home;