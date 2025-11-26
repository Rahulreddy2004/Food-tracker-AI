import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { auth, db } from '../firebaseConfig';
import { doc, getDoc, setDoc } from "firebase/firestore";
import { Loader2, ArrowLeft, Save } from 'lucide-react';
import './Profile.css'; // We'll create this

const Profile = () => {
  const [goal, setGoal] = useState('weight loss');
  const [targetCalories, setTargetCalories] = useState(2000);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const navigate = useNavigate();

  // Get the current user
  const user = auth.currentUser;

  // Fetch profile on load
  const fetchProfile = useCallback(async () => {
    if (user) {
      const docRef = doc(db, "user_profiles", user.uid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        setGoal(data.goal);
        setTargetCalories(data.daily_calories_target);
      } else {
        // No profile yet, use defaults
        console.log("No such document!");
      }
    } else {
      // This shouldn't happen if ProtectedRoute is working
      navigate('/login');
    }
    setIsLoading(false);
  }, [user, navigate]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // Handle saving the profile
  const handleSave = async (e) => {
    e.preventDefault();
    if (!user) return;

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const docRef = doc(db, "user_profiles", user.uid);
      await setDoc(docRef, {
        goal: goal,
        daily_calories_target: Number(targetCalories)
      });
      setSuccess("Profile saved successfully!");
    } catch (err) {
      console.error("Error saving profile:", err);
      setError("Failed to save profile. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container" style={{ textAlign: 'center' }}>
        <Loader2 className="spinner" size={48} />
      </div>
    );
  }

  return (
    <div className="container profile-container">
      <Link to="/" className="back-link"><ArrowLeft size={18} /> Back to Home</Link>
      <header className="app-header">
        <h1>Your Profile</h1>
        <p>Set your daily diet goals.</p>
      </header>

      <form onSubmit={handleSave} className="profile-form">
        <div className="input-group">
          <label htmlFor="goal">My Primary Goal</label>
          <select id="goal" value={goal} onChange={(e) => setGoal(e.target.value)}>
            <option value="weight loss">Weight Loss</option>
            <option value="maintenance">Maintenance</option>
            <option value="muscle gain">Muscle Gain</option>
            <option value="general health">General Health</option>
          </select>
        </div>

        <div className="input-group">
          <label htmlFor="calories">Target Daily Calories</label>
          <input
            type="number"
            id="calories"
            value={targetCalories}
            onChange={(e) => setTargetCalories(e.target.value)}
            min="1000"
            max="10000"
            step="100"
          />
        </div>

        {error && <p className="error-message">{error}</p>}
        {success && <p className="success-message">{success}</p>}

        <button type="submit" className="save-button" disabled={isSaving}>
          {isSaving ? <Loader2 className="spinner" /> : <Save size={20} />}
          {isSaving ? "Saving..." : "Save Profile"}
        </button>
      </form>
    </div>
  );
};

export default Profile;