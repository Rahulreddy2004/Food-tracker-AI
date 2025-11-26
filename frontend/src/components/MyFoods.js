import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { auth } from '../firebaseConfig';
import { Loader2, ArrowLeft, Plus, Trash2, FileWarning } from 'lucide-react';
import './MyFoods.css'; // We will create this

const API_URL = 'http://127.0.0.1:5000';

const MyFoods = () => {
  const [foods, setFoods] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // State for the new food form
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [fat, setFat] = useState('');
  const [carbs, setCarbs] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch all custom foods on load
  const fetchCustomFoods = async () => {
    try {
      const token = await auth.currentUser.getIdToken();
      const response = await axios.get(`${API_URL}/my-foods`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setFoods(response.data);
    } catch (err) {
      console.error("Error fetching custom foods:", err);
      setError("Could not fetch your custom foods.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (auth.currentUser) {
      fetchCustomFoods();
    }
  }, []); // Runs once on component mount

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const token = await auth.currentUser.getIdToken();
      const payload = {
        name: name,
        calories: parseFloat(calories),
        protein_g: parseFloat(protein),
        fat_g: parseFloat(fat),
        carbs_g: parseFloat(carbs)
      };
      const response = await axios.post(`${API_URL}/my-foods`, payload, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      // Add new food to the list instantly
      setFoods([...foods, { ...response.data.data, id: response.data.food_id }]);
      // Reset form
      setName(''); setCalories(''); setProtein(''); setFat(''); setCarbs('');
    } catch (err) {
      console.error("Error adding food:", err);
      setError("Failed to add food. Please check your inputs.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle deleting a food
  const handleDelete = async (foodId) => {
    if (!window.confirm("Are you sure you want to delete this food?")) return;
    
    try {
      const token = await auth.currentUser.getIdToken();
      await axios.delete(`${API_URL}/my-foods/${foodId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      // Remove food from the list instantly
      setFoods(foods.filter(food => food.id !== foodId));
    } catch (err) {
      console.error("Error deleting food:", err);
      setError("Failed to delete food.");
    }
  };

  return (
    <div className="container">
      <Link to="/" className="back-link"><ArrowLeft size={18} /> Back to Home</Link>
      <header className="app-header">
        <h1>My Pantry</h1>
        <p>Add and manage your custom foods.</p>
      </header>
      
      {/* --- Add New Food Form --- */}
      <form onSubmit={handleSubmit} className="my-foods-form">
        <h3>Add a New Food</h3>
        <div className="form-grid">
          <input type="text" placeholder="Food Name (e.g., Mom's Lasagna)" value={name} onChange={e => setName(e.target.value)} required />
          <input type="number" placeholder="Calories" value={calories} onChange={e => setCalories(e.target.value)} required />
          <input type="number" placeholder="Protein (g)" value={protein} onChange={e => setProtein(e.target.value)} required />
          <input type="number" placeholder="Fat (g)" value={fat} onChange={e => setFat(e.target.value)} required />
          <input type="number" placeholder="Carbs (g)" value={carbs} onChange={e => setCarbs(e.target.value)} required />
          <button type="submit" className="scan-button" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="spinner" /> : <Plus size={20} />}
            {isSubmitting ? 'Adding...' : 'Add Food'}
          </button>
        </div>
        {error && <p className="error-message" style={{marginTop: '15px'}}>{error}</p>}
      </form>

      {/* --- Custom Food List --- */}
      <div className="my-foods-list">
        <h3>Your Saved Foods</h3>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <Loader2 className="spinner" size={32} />
          </div>
        ) : foods.length === 0 ? (
          <p style={{color: 'var(--text-secondary)'}}>You haven't saved any custom foods yet.</p>
        ) : (
          <div className="food-list-diary"> {/* Re-using diary styles */}
            {foods.map(food => (
              <div key={food.id} className="food-card-diary">
                <div className="display-header">
                  <h4>{food.name}</h4>
                  <button onClick={() => handleDelete(food.id)} className="edit-btn cancel-btn">
                    <Trash2 size={16} />
                  </button>
                </div>
                <p className="calories">{food.calories} kcal</p>
                <div className="macro-list-diary">
                  <p>Protein<span>{food.protein_g}g</span></p>
                  <p>Fat<span>{food.fat_g}g</span></p>
                  <p>Carbs<span>{food.carbs_g}g</span></p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MyFoods;