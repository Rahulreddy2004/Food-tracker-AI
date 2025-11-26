import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { auth } from '../firebaseConfig';
import { Loader2, ArrowLeft, BookOpen, Search } from 'lucide-react'; // <-- 1. IMPORT Search
import './Diary.css';

const API_URL = 'http://127.0.0.1:5000';

const Diary = () => {
  const [meals, setMeals] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState(""); // <-- 2. ADD SEARCH STATE

  useEffect(() => {
    // ... (fetchMeals function is unchanged) ...
    const fetchMeals = async () => {
      try {
        const user = auth.currentUser;
        if (!user) {
          setError("You must be logged in to view your diary.");
          setIsLoading(false);
          return;
        }
        const token = await user.getIdToken();
        const response = await axios.get(`${API_URL}/get-my-meals`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        setMeals(response.data);
      } catch (err) {
        console.error("Error fetching meals:", err);
        setError("Could not fetch your meal diary.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchMeals();
  }, []);

  // --- 3. FILTER LOGIC ---
  const filteredMeals = meals.filter(meal => {
    if (searchTerm === "") return true; // Show all if search is empty
    // Check if any food in the meal matches the search term
    return meal.foods.some(food =>
      food.food_name_display.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });
  // --- END OF FILTER LOGIC ---

  if (isLoading) {
    // ... (loading unchanged) ...
  }
  if (error) {
    // ... (error unchanged) ...
  }

  return (
    <div className="container diary-container">
      <Link to="/" className="back-link"><ArrowLeft size={18} /> Back to Home</Link>
      <header className="app-header">
        <h1>My Food Diary</h1>
        <p>Your complete meal history.</p>
      </header>

      {/* --- 4. ADD SEARCH BAR --- */}
      <div className="search-bar-container">
        <Search size={20} className="search-icon" />
        <input
          type="text"
          placeholder="Search your logged meals..."
          className="search-input"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
      </div>
      {/* --- END OF SEARCH BAR --- */}
      
      {filteredMeals.length === 0 ? (
        <div className="empty-diary">
          <BookOpen size={48} />
          <h2>{searchTerm ? "No meals found." : "Your diary is empty."}</h2>
          <p>{searchTerm ? "Try a different search term." : "Go to the scanner to log your first meal!"}</p>
        </div>
      ) : (
        <div className="meal-list">
          {/* --- 5. MAP OVER 'filteredMeals' --- */}
          {filteredMeals.map((meal) => (
            <div key={meal.id} className="meal-entry-card">
              {/* ... (rest of the card is unchanged) ... */}
              <div className="meal-header">
                <h3>{typeof meal.timestamp === 'string' ? new Date(meal.timestamp).toLocaleString() : new Date().toLocaleString()}</h3>
              </div>
              <div className="food-list-diary">
                {meal.foods.map((food, index) => (
                  <div key={index} className="food-card-diary">
                    <h4>{food.food_name_display}</h4>
                    <p><strong>Group:</strong> {food.group}</p>
                    <p><strong>Confidence:</strong> {food.confidence}</p>
                    <p className="calories">{food.label || "Calories not found"}</p>
                    {food.calories > 0 && (
                      <div className="macro-list-diary">
                        <p>Protein<span>{food.protein_g?.toFixed(1) || 0}g</span></p>
                        <p>Fat<span>{food.fat_g?.toFixed(1) || 0}g</span></p>
                        <p>Carbs<span>{food.carbs_g?.toFixed(1) || 0}g</span></p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Diary;