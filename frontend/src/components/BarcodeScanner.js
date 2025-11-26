import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { auth } from '../firebaseConfig';
import { ArrowLeft, Loader2, Bot, FileWarning, CheckCircle, Save, ScanBarcode, ZapOff } from 'lucide-react';
import { useZxing } from 'react-zxing'; // <-- THIS IS THE CORRECT IMPORT

const API_URL = 'http://127.0.0.1:5000';

const BarcodeScanner = () => {
  const [detectedFoods, setDetectedFoods] = useState([]);
  const [dietPlan, setDietPlan] = useState("");
  
  const [isProcessing, setIsProcessing] = useState(false); // For API calls
  const [isLogging, setIsLogging] = useState(false);
  const [isLogged, setIsLogged] = useState(false);
  const [error, setError] = useState(null);

  // This is the new way to use the scanner
  const { ref } = useZxing({
    onResult(result) {
      if (!isProcessing) {
        handleScanResult(result.getText());
      }
    },
    onError(error) {
      if (error && !isProcessing) {
        console.error(error);
        setError("Could not access camera. Please check permissions.");
      }
    }
  });

  // This function is called when a barcode is found
  const handleScanResult = async (upcCode) => {
    // A barcode was found!
    setIsProcessing(true); // Stop scanning, start processing
    setError(null);
    console.log("Scanned UPC:", upcCode);

    try {
      // --- 1. Call our new backend endpoint ---
      const response = await axios.post(`${API_URL}/lookup-barcode`, { upc_code: upcCode });
      
      const foods = response.data;
      setDetectedFoods(foods);
      
      // --- 2. Get a diet plan for this item ---
      const token = await auth.currentUser.getIdToken();
      const planResponse = await axios.post(`${API_URL}/get-diet-plan`, 
        { foods: foods },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      setDietPlan(planResponse.data.plan);

    } catch (err) {
      console.error("Error looking up barcode:", err);
      setError(err.response?.data?.error || "Could not find product for this barcode.");
    } finally {
      setIsProcessing(false); // Done processing
    }
  };

  // Log meal function
  const handleLogMeal = async () => {
    if (detectedFoods.length === 0 || !auth.currentUser) return;
    setIsLogging(true);
    setError(null);
    try {
      const token = await auth.currentUser.getIdToken();
      await axios.post(`${API_URL}/log-meal`, { foods: detectedFoods }, { 
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setIsLogged(true);
    } catch (err) {
      console.error("Error logging meal:", err);
      setError("Failed to log meal.");
    } finally {
      setIsLogging(false);
    }
  };

  const resetScanner = () => {
    setDetectedFoods([]);
    setDietPlan("");
    setError(null);
    setIsLogged(false);
    setIsProcessing(false);
  };

  // Check if we are done (processing is false AND we have results)
  const isDoneScanning = !isProcessing && detectedFoods.length > 0;

  return (
    <div className="container">
      <Link to="/" className="back-link"><ArrowLeft size={18} /> Back to Home</Link>
      <header className="scanner-header">
        <h1>Barcode Scanner</h1>
      </header>

      {/* --- 1. THE SCANNER --- */}
      {/* Show scanner OR loading spinner */}
      <div className="capture-container">
        <p className="scan-prompt">
          {isProcessing ? "Looking up product..." : "Point your camera at a product barcode"}
        </p>
        <div className="webcam-preview">
          <video ref={ref} className="scanner-video" />
          {isProcessing && (
            <div className="scanner-overlay">
              <Loader2 className="spinner" size={48} />
            </div>
          )}
        </div>
      </div>
      

      {/* --- 3. RESULTS --- */}
      {error && <div className="error-box"><FileWarning /> {error}</div>}
      
      {isDoneScanning && (
        <div className="results-container">
          <h2>Detected Food Item</h2>
          <div className="food-list">
            {detectedFoods.map((food, index) => (
              <div key={index} className="food-card">
                <h3>{food.food_name_display}</h3>
                <p><strong>Group:</strong> {food.group}</p>
                <p><strong>Source:</strong> Barcode Scan</p>
                <p className="calories">{food.label}</p>
                <div className="macro-list">
                  <p>Protein<span>{food.protein_g?.toFixed(1) || 0}g</span></p>
                  <p>Fat<span>{food.fat_g?.toFixed(1) || 0}g</span></p>
                  <p>Carbs<span>{food.carbs_g?.toFixed(1) || 0}g</span></p>
                </div>
              </div>
            ))}
          </div>

          <div className="log-meal-container">
            <button 
              className="button-secondary"
              onClick={resetScanner}
              disabled={isLogging || isProcessing}
            >
              <ScanBarcode size={20} /> Scan Another
            </button>
            <button 
              className="scan-button" 
              onClick={handleLogMeal}
              disabled={isLogging || isLogged}
            >
              {isLogging && <Loader2 className="spinner" />}
              {isLogged && <CheckCircle size={20} />}
              {isLogging ? "Saving..." : (isLogged ? "Logged!" : "Log to Diary")}
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

      {/* Show reset button if there's an error and camera is off */}
      {error && !isProcessing && (
        <div className="button-group" style={{ marginTop: '20px' }}>
          <button onClick={resetScanner} className="button-secondary">
            <ZapOff size={20} /> Try Again
          </button>
        </div>
      )}
    </div>
  );
};

export default BarcodeScanner;