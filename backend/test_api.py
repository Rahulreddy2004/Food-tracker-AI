import requests
import json

# --- IMPORTANT ---
# Change this to the name of your test image file
YOUR_TEST_IMAGE = "palak_paneer.jpg" 
# -----------------

# The URL where your Flask server is running
PREDICT_URL = "http://127.0.0.1:5000/predict"
DIET_URL = "http://127.0.0.1:5000/get-diet-plan"

print(f"--- 1. Testing /predict endpoint with {YOUR_TEST_IMAGE} ---")

try:
    # Open the image file in binary-read mode
    with open(YOUR_TEST_IMAGE, 'rb') as f:
        # 'files' is a dictionary where the key 'image' 
        # matches what your app.py expects: request.files['image']
        files = {'image': (YOUR_TEST_IMAGE, f, 'image/png')}
        
        # Make the POST request
        response = requests.post(PREDICT_URL, files=files)
        
    print(f"\n[SUCCESS] Server Response (Status Code: {response.status_code}):")
    
    # Pretty-print the JSON response
    predicted_foods = response.json()
    print(json.dumps(predicted_foods, indent=2))
    
    
    # --- 2. Testing /get-diet-plan endpoint ---
    if predicted_foods and 'error' not in predicted_foods:
        print("\n--- 2. Testing /get-diet-plan endpoint ---")
        
        # We'll use the data we just got from the /predict endpoint
        # The key 'foods' must match what your app.py expects: data.get('foods')
        diet_plan_payload = {
            "foods": predicted_foods
        }
        
        # Make the second POST request, this time with JSON data
        diet_response = requests.post(DIET_URL, json=diet_plan_payload)
        
        print(f"\n[SUCCESS] Server Response (Status Code: {diet_response.status_code}):")
        print(json.dumps(diet_response.json(), indent=2))
        
    else:
        print("\n--- Skipping /get-diet-plan test because /predict failed ---")

except requests.exceptions.ConnectionError:
    print("\n[FAILED] Connection error. Is your 'app.py' server running in the other terminal?")
except Exception as e:
    print(f"\n[FAILED] An error occurred: {e}")