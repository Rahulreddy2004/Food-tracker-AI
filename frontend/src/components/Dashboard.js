import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { auth, db } from '../firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';
import { Loader2, ArrowLeft, TrendingUp, PieChart, BarChart, Target, Flag, CheckCircle, FileWarning } from 'lucide-react';
import { 
  ResponsiveContainer, 
  PieChart as RePieChart, 
  Pie, 
  Cell, 
  Tooltip, 
  Legend,
  BarChart as ReBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid
} from 'recharts';
import './Dashboard.css';

const API_URL = 'http://127.0.0.1:5000';

// --- (Helper functions are unchanged) ---
const getTodayString = () => new Date().toISOString().split('T')[0];
const processMealData = (meals) => {
  let todayCalories = 0, todayProtein = 0, todayFat = 0, todayCarbs = 0;
  const today = getTodayString();
  const dailyCalories = {};
  meals.forEach(meal => {
    const mealDate = meal.timestamp.split(' ')[0];
    if (!dailyCalories[mealDate]) dailyCalories[mealDate] = 0;
    let mealTotalCalories = 0;
    meal.foods.forEach(food => {
      const calories = food.calories || 0;
      const protein = food.protein_g || 0;
      const fat = food.fat_g || 0;
      const carbs = food.carbs_g || 0;
      mealTotalCalories += calories;
      if (mealDate === today) {
        todayCalories += calories;
        todayProtein += protein;
        todayFat += fat;
        todayCarbs += carbs;
      }
    });
    dailyCalories[mealDate] += mealTotalCalories;
  });
  const barChartData = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const dateString = d.toISOString().split('T')[0];
    const shortName = d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
    barChartData.push({ name: shortName, calories: dailyCalories[dateString] || 0 });
  }
  const pieChartData = [
    { name: 'Protein', value: Math.round(todayProtein) },
    { name: 'Fat', value: Math.round(todayFat) },
    { name: 'Carbs', value: Math.round(todayCarbs) },
  ];
  const summaryStats = {
    todayCalories: Math.round(todayCalories),
    todayProtein: Math.round(todayProtein),
    todayFat: Math.round(todayFat),
    todayCarbs: Math.round(todayCarbs)
  };
  return { barChartData, pieChartData, summaryStats };
};
const COLORS = ['#10b981', '#f59e0b', '#3b82f6'];

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // ... (fetchDashboardData is unchanged) ...
    const fetchDashboardData = async () => {
      try {
        const user = auth.currentUser;
        if (!user) {
          setError("You must be logged in.");
          setIsLoading(false);
          return;
        }
        const token = await user.getIdToken();
        const mealPromise = axios.get(`${API_URL}/get-my-meals`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const profilePromise = getDoc(doc(db, "user_profiles", user.uid));
        const [mealResponse, profileSnap] = await Promise.all([mealPromise, profilePromise]);
        
        const processedData = processMealData(mealResponse.data);
        setStats(processedData);
        
        if (profileSnap.exists()) {
          setProfile(profileSnap.data());
        } else {
          setProfile({ goal: 'general health', daily_calories_target: 2000 }); // Default
        }
      } catch (err) {
        console.error("Error fetching dashboard data:", err);
        setError("Could not fetch your dashboard data.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchDashboardData();
  }, []);

  // --- 1. REMOVE CALCULATIONS FROM HERE ---
  // const calorieProgress = (stats.summaryStats.todayCalories / profile.daily_calories_target) * 100;
  // const isOverTarget = stats.summaryStats.todayCalories > profile.daily_calories_target;

  if (isLoading) {
    return (
      <div className="container" style={{ textAlign: 'center' }}>
        <Loader2 className="spinner" size={48} />
        <p>Loading your dashboard...</p>
      </div>
    );
  }

  if (error || !stats || !profile) {
    return <div className="container error-box">{error || "Could not load stats."}</div>;
  }
  
  // --- 2. MOVE CALCULATIONS HERE ---
  // Now it's safe because we know 'stats' and 'profile' are not null.
  const calorieProgress = (stats.summaryStats.todayCalories / profile.daily_calories_target) * 100;
  const isOverTarget = stats.summaryStats.todayCalories > profile.daily_calories_target;

  return (
    <div className="container dashboard-container">
      <Link to="/" className="back-link"><ArrowLeft size={18} /> Back to Home</Link>
      <header className="app-header">
        <h1>Your Dashboard</h1>
        <p>A summary of your nutrition.</p>
      </header>
      
      {/* --- Daily Progress Bar --- */}
      <h2>Daily Goal: {profile.goal}</h2>
      <div className="progress-card">
        <div className="progress-labels">
          <strong>Today's Calories</strong>
          <span style={{ color: isOverTarget ? 'var(--error-color)' : 'var(--success-color)' }}>
            {stats.summaryStats.todayCalories} / {profile.daily_calories_target} kcal
          </span>
        </div>
        <div className="progress-bar-container">
          <div 
            className="progress-bar-fill" 
            style={{ 
              width: `${Math.min(calorieProgress, 100)}%`,
              backgroundColor: isOverTarget ? 'var(--error-color)' : 'var(--success-color)'
            }}
          ></div>
        </div>
        {isOverTarget ? (
          <p className="progress-status error"><FileWarning size={16} /> You're {stats.summaryStats.todayCalories - profile.daily_calories_target} kcal over your goal.</p>
        ) : (
          <p className="progress-status success"><CheckCircle size={16} /> You have {profile.daily_calories_target - stats.summaryStats.todayCalories} kcal remaining.</p>
        )}
      </div>

      {/* --- Today's Summary (REVERTED TO LIST) --- */}
      <h2>Today's Summary</h2>
      <div className="dashboard-summary-list">
        <div className="summary-item">
          <Target size={20} style={{ color: 'var(--primary-color)' }} />
          <span>Calorie Goal</span>
          <strong>{profile.daily_calories_target} kcal</strong>
        </div>
        <div className="summary-item">
          <PieChart size={20} style={{ color: COLORS[0] }} />
          <span>Protein</span>
          <strong>{stats.summaryStats.todayProtein}g</strong>
        </div>
        <div className="summary-item">
          <PieChart size={20} style={{ color: COLORS[1] }} />
          <span>Fat</span>
          <strong>{stats.summaryStats.todayFat}g</strong>
        </div>
        <div className="summary-item">
          <PieChart size={20} style={{ color: COLORS[2] }} />
          <span>Carbs</span>
          <strong>{stats.summaryStats.todayCarbs}g</strong>
        </div>
      </div>

      {/* --- Charts --- */}
      <div className="charts-grid">
        <div className="chart-container">
          <h3>Today's Macro Breakdown</h3>
          <ResponsiveContainer width="100%" height={300}>
            <RePieChart>
              <Pie
                data={stats.pieChartData.filter(entry => entry.value > 0)}
                cx="50%" cy="50%"
                labelLine={false} outerRadius={80}
                fill="#8884d8" dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {stats.pieChartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => `${value}g`} />
              <Legend />
            </RePieChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-container">
          <h3>Last 7 Days Calories</h3>
          <ResponsiveContainer width="100%" height={300}>
            <ReBarChart data={stats.barChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
              <XAxis dataKey="name" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip 
                contentStyle={{ backgroundColor: 'var(--surface-color)', border: '1px solid var(--glass-border)', borderRadius: '8px' }} 
                labelStyle={{ color: '#fff' }}
              />
              <Bar dataKey="calories" fill="var(--primary-color)" radius={[4, 4, 0, 0]} />
            </ReBarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;