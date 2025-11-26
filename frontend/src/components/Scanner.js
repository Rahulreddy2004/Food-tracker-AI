import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Webcam from 'react-webcam';
import axios from 'axios';
import { Camera, Upload, ArrowLeft, Loader2, Bot, FileWarning, CheckCircle, Save, Edit, X, Check, BookUser, Package } from 'lucide-react'; // <-- 1. IMPORT
import { auth } from '../firebaseConfig';

const API_URL = 'http://127.0.0.1:5000';

// --- 2. NEW PANTRY MODAL COMPONENT ---
const PantryModal = ({ onSelect, onClose }) => {
  const [pantryFoods, setPantryFoods] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchPantryFoods = async () => {
      try {
        const token = await auth.currentUser.getIdToken();
        const response = await axios.get(`${API_URL}/my-foods`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        setPantryFoods(response.data);
      } catch (err) {
        console.error("Error fetching pantry:", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchPantryFoods();
  }, []);

  const handleSelectFood = (food) => {
    // Create a new food object that matches our standard format
    const selectedFood = {
      food_name_raw: food.name.replace(/ /g, "_").toLowerCase(),
      food_name_display: food.name,
      group: "My Pantry",
      confidence: "100.00%",
      label: `${food.calories} kcal`,
      calories: food.calories,
      protein_g: food.protein_g,
      fat_g: food.fat_g,
      carbs_g: food.carbs_g
      // No 'box' as this is a manual add
    };
    onSelect(selectedFood);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h3>Choose from My Pantry</h3>
        {isLoading ? (
          <Loader2 className="spinner" />
        ) : pantryFoods.length === 0 ? (
          <p>Your pantry is empty. Add items in the "My Pantry" page.</p>
        ) : (
          <div className="pantry-list">
            {pantryFoods.map(food => (
              <div key={food.id} className="pantry-item" onClick={() => handleSelectFood(food)}>
                <span>{food.name}</span>
                <span>{food.calories} kcal</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const Scanner = () => {
  const { mode } = useParams();
  const webcamRef = useRef(null);
  
  const [imageSrc, setImageSrc] = useState(null);
  const [detectedFoods, setDetectedFoods] = useState([]);
  const [dietPlan, setDietPlan] = useState("");
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isLogging, setIsLogging] = useState(false);
  const [isLogged, setIsLogged] = useState(false);
  const [error, setError] = useState(null);

  const [editIndex, setEditIndex] = useState(null);
  const [editText, setEditText] = useState("");
  
  const [isPantryOpen, setIsPantryOpen] = useState(false); // <-- 3. STATE FOR MODAL

  // ... (resetState, handleFileChange, capture are unchanged) ...
  const resetState = () => {
    setImageSrc(null); setDetectedFoods([]); setDietPlan("");
    setError(null); setIsLogged(false); setEditIndex(null);
    setEditText(""); setIsAnalyzing(false); setIsPantryOpen(false);
  };
  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      resetState();
      setImageSrc(URL.createObjectURL(file));
    }
  };
  const capture = useCallback(() => {
    const image = webcamRef.current.getScreenshot();
    resetState();
    setImageSrc(image);
  }, [webcamRef]);
  
  // ... (fetchSingleFoodCalories, fetchCalorieAndPlanData, analyzeImage, handleLogMeal are unchanged) ...
  const fetchSingleFoodCalories = async (foodItem) => {
    const box = foodItem.box;
    const pixel_area = (box[2] - box[0]) * (box[3] - box[1]);
    try {
      const response = await axios.post(`${API_URL}/get-calories`, {
        food_name: foodItem.food_name_raw,
        pixel_area: pixel_area
      });
      return { ...foodItem, ...response.data, calories: response.data.calories };
    } catch (err) {
      console.error("Error fetching calories:", err);
      return { ...foodItem, calories: 0, label: "Error fetching calories", protein_g: 0, fat_g: 0, carbs_g: 0 };
    }
  };
  const fetchCalorieAndPlanData = async (foods) => {
    const token = await auth.currentUser.getIdToken();
    const planPromise = axios.post(`${API_URL}/get-diet-plan`, { foods: foods }, { headers: { 'Authorization': `Bearer ${token}` } })
      .catch(err => console.error("Error fetching diet plan:", err));
    const caloriePromises = foods.map(food => fetchSingleFoodCalories(food));
    const [planResult, ...calorieResults] = await Promise.allSettled([planPromise, ...caloriePromises]);
    if (planResult.status === 'fulfilled' && planResult.value.data.plan) {
      setDietPlan(planResult.value.data.plan);
    }
    const finalDetectedFoods = calorieResults.map((result, index) => {
      if (result.status === 'fulfilled') return result.value;
      return foods[index]; // Fallback on error
    });
    setDetectedFoods(finalDetectedFoods);
  };
  const analyzeImage = async () => {
    if (!imageSrc) return;
    setIsAnalyzing(true); setError(null); setIsLogged(false);
    setDetectedFoods([]); setDietPlan("");
    const response = await fetch(imageSrc);
    const blob = await response.blob();
    const formData = new FormData();
    formData.append('image', blob, 'food.jpg');
    try {
      const predictResponse = await axios.post(`${API_URL}/predict`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (predictResponse.data.length === 0) {
        setError("No food items were detected in the image. Please try again.");
        setIsAnalyzing(false);
        return;
      }
      const foodsWithLoading = predictResponse.data.map(food => ({
        ...food, calories: null, label: "Loading calories...",
        protein_g: null, fat_g: null, carbs_g: null
      }));
      setDetectedFoods(foodsWithLoading);
      await fetchCalorieAndPlanData(foodsWithLoading); 
    } catch (err) {
      console.error(err);
      setError("An error occurred. Is the backend server running?");
    } finally {
      setIsAnalyzing(false); 
    }
  };
  const handleLogMeal = async () => {
    if (detectedFoods.length === 0 || !auth.currentUser) return;
    setIsLogging(true); setError(null);
    try {
      const token = await auth.currentUser.getIdToken();
      await axios.post(`${API_URL}/log-meal`, { foods: detectedFoods },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      setIsLogged(true);
    } catch (err) {
      console.error("Error logging meal:", err);
      setError("Failed to log meal.");
    } finally {
      setIsLogging(false);
    }
  };
  const handleEditClick = (food, index) => {
    setEditIndex(index);
    setEditText(food.food_name_display);
  };
  
  // --- 4. UPDATE THE CORRECTION LOGIC ---
  const handleCorrectionSave = (index) => {
    const correctedFoodBase = {
      ...detectedFoods[index],
      food_name_display: editText,
      food_name_raw: editText.replace(/ /g, "_").toLowerCase(),
      label: "Recalculating..."
    };
    setDetectedFoods(prevFoods =>
      prevFoods.map((food, i) => (i === index ? correctedFoodBase : food))
    );
    setEditIndex(null);
    setEditText("");
    // Re-fetch calories for just this one item
    fetchSingleFoodCalories(correctedFoodBase, index);
  };

  // --- 5. NEW FUNCTION TO HANDLE PANTRY SELECTION ---
  const handlePantrySelect = (foodFromPantry) => {
    // Add the food from the pantry to our list
    setDetectedFoods(prevFoods => [...prevFoods, foodFromPantry]);
    setIsPantryOpen(false);
  };

  return (
    <div className="container">
      {/* --- 6. ADD THE MODAL --- */}
      {isPantryOpen && <PantryModal 
        onClose={() => setIsPantryOpen(false)} 
        onSelect={handlePantrySelect} 
      />}
      
      <Link to="/" className="back-link"><ArrowLeft size={18} /> Back to Home</Link>
      <header className="scanner-header">
        <h1>{mode === 'live' ? 'Live Detection' : 'Upload Image'}</h1>
      </header>

      {/* ... (Capture/Upload/Preview sections are unchanged) ... */}
      {!imageSrc && (
        <div className="capture-container">
          {mode === 'live' ? (
            <>
              <Webcam audio={false} ref={webcamRef} screenshotFormat="image/jpeg" className="webcam-preview" videoConstraints={{ facingMode: "environment" }} />
              <button onClick={capture} className="scan-button"><Camera /> Capture</button>
            </>
          ) : (
            <div className="upload-box">
              <Upload size={48} />
              <p>Drag & drop your image here, or click to browse.</p>
              <input type="file" accept="image/*" onChange={handleFileChange} />
            </div>
          )}
        </div>
      )}
      {imageSrc && (
        <div className="preview-container">
          <h3>Image Preview</h3>
          <img src={imageSrc} alt="Food preview" className="preview-image" />
          <div className="button-group">
            <button onClick={resetState} className="button-secondary">Clear Image</button>
            <button onClick={analyzeImage} disabled={isAnalyzing} className="scan-button">
              {isAnalyzing ? <Loader2 className="spinner" /> : null}
              {isAnalyzing ? 'Analyzing... Please Wait' : 'Analyze Food'}
            </button>
          </div>
        </div>
      )}

      {error && <div className="error-box"><FileWarning /> {error}</div>}
      
      {/* --- 7. UPDATE THE RESULTS SECTION --- */}
      {detectedFoods.length > 0 && (
        <div className="results-container">
          <h2>Detected Food Items</h2>
          <div className="food-list">
            {detectedFoods.map((food, index) => (
              <div key={index} className="food-card">
                {editIndex === index ? (
                  <div className="edit-container">
                    {/* ... (edit input is unchanged) ... */}
                    <input type="text" value={editText} onChange={(e) => setEditText(e.target.value)} autoFocus />
                    <div className="edit-buttons">
                      <button onClick={() => setEditIndex(null)} className="edit-btn cancel-btn"><X size={16}/></button>
                      <button onClick={() => handleCorrectionSave(index)} className="edit-btn save-btn"><Check size={16}/></button>
                    </div>
                  </div>
                ) : (
                  <div className="display-header">
                    <h3>{food.food_name_display}</h3>
                    {/* Don't allow editing food from "My Pantry" */}
                    {food.group !== "My Pantry" && (
                      <button onClick={() => handleEditClick(food, index)} className="edit-btn" disabled={isAnalyzing}>
                        <Edit size={14} />
                      </button>
                    )}
                  </div>
                )}
                
                <p><strong>Group:</strong> {food.group}</p>
                {/* Don't show confidence for Pantry items */}
                {food.group !== "My Pantry" && <p><strong>Confidence:</strong> {food.confidence}</p>}
                
                <p className="calories">
                  {food.calories === null ? (
                    <span className="loading-text">Loading calories...</span>
                  ) : (
                    food.label
                  )}
                </p>

                {food.calories !== null && (
                  <div className="macro-list">
                    <p>Protein<span>{food.protein_g?.toFixed(1) || 0}g</span></p>
                    <p>Fat<span>{food.fat_g?.toFixed(1) || 0}g</span></p>
                    <p>Carbs<span>{food.carbs_g?.toFixed(1) || 0}g</span></p>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="log-meal-container">
            {/* --- 8. ADD THE "ADD FROM PANTRY" BUTTON --- */}
            <button 
              className="button-secondary" 
              onClick={() => setIsPantryOpen(true)}
              disabled={isAnalyzing || isLogging || editIndex !== null}
            >
              <Package size={20} /> Add from Pantry
            </button>
            <button 
              className="scan-button" 
              onClick={handleLogMeal}
              disabled={isAnalyzing || isLogging || isLogged || editIndex !== null}
            >
              {isLogging && <Loader2 className="spinner" />}
              {isLogged && <CheckCircle size={20} />}
              {isAnalyzing ? "Analyzing... Please Wait" : (isLogging ? "Saving..." : (isLogged ? "Meal Logged!" : "Log Meal to Diary"))}
            </button>
          </div>

          {dietPlan && (
            <div className="diet-plan">
              <Bot size={24} />
              <div>
                <strong>AI Diet Plan:</strong>
                <p>{dietPlan}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Scanner;