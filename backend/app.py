import os
import json
import numpy as np
import tensorflow as tf
from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
import io
import cv2
from ultralytics import YOLO
from dotenv import load_dotenv
import google.generativeai as genai
import firebase_admin
from firebase_admin import credentials, firestore, auth
import datetime
import requests

# --- (All your PyTorch fixes are still here) ---
import torch.serialization
import torch.nn.modules.container
import torch.nn.modules.conv
import torch.nn.modules.upsampling
import torch.nn.modules.batchnorm
import torch.nn.modules.activation
import torch.nn.modules.pooling
import ultralytics.nn.tasks
import ultralytics.nn.modules.conv
import ultralytics.nn.modules.block
import ultralytics.nn.modules.head

torch.serialization.add_safe_globals([
    ultralytics.nn.tasks.DetectionModel,
    torch.nn.modules.container.Sequential,
    ultralytics.nn.modules.conv.Conv,
    ultralytics.nn.modules.block.C2f,
    torch.nn.modules.conv.Conv2d,
    ultralytics.nn.modules.block.SPPF,
    torch.nn.modules.upsampling.Upsample,
    ultralytics.nn.modules.conv.Concat,
    ultralytics.nn.modules.head.Detect,
    torch.nn.modules.batchnorm.BatchNorm2d,
    torch.nn.modules.activation.SiLU,
    torch.nn.modules.container.ModuleList,
    ultralytics.nn.modules.block.Bottleneck,
    torch.nn.modules.pooling.MaxPool2d,
    ultralytics.nn.modules.block.DFL,
])
# --- END OF FIX ---


# --- 1. INITIALIZATION & SETUP ---
# ... (This section is unchanged) ...
load_dotenv()
app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "http://localhost:3000"}})
try:
    cred = credentials.Certificate('serviceAccountKey.json')
    firebase_admin.initialize_app(cred)
    db = firestore.client()
    print("✅ Firebase initialized.")
except Exception as e:
    print(f"❌ WARNING: Firebase initialization failed: {e}")
    db = None
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
if not GEMINI_API_KEY:
    print("❌ WARNING: 'GEMINI_API_KEY' not found.")
    gemini_model = None
else:
    genai.configure(api_key=GEMINI_API_KEY)
    gemini_model = genai.GenerativeModel('gemini-2.5-flash-preview-09-2025')
    print("✅ Gemini AI initialized.")
CALORIE_NINJA_API_KEY = os.getenv('CALORIE_NINJA_API_KEY')
if not CALORIE_NINJA_API_KEY:
    print("❌ WARNING: 'CALORIE_NINJA_API_KEY' not found.")
CALORIE_API_URL = 'https://api.calorieninjas.com/v1/nutrition?query='


# --- 2. LOAD AI MODELS & METADATA ---
# ... (This section is unchanged) ...
IMG_SIZE = 300
detector_model = None
classifier_model = None
classifier_class_names = []
food_groups = {}
portion_data = {}
def load_models():
    global detector_model, classifier_model, classifier_class_names, food_groups, portion_data
    try:
        detector_model = YOLO('best.pt')
        print("✅ YOLOv8 Detector loaded.")
        classifier_model = tf.keras.models.load_model('food101_EfficientNetV2B3_final.h5')
        print("✅ EfficientNet Classifier loaded.")
        with open('class_names.json', 'r') as f:
            classifier_class_names = json.load(f)
        print("✅ Classifier class names loaded.")
        with open('food_groups.json', 'r') as f:
            food_groups = json.load(f)
        print("✅ Food groups loaded.")
        with open('portion_data.json', 'r') as f:
            portion_data = json.load(f)
        print("✅ Portion calibration data loaded.")
        print("\n--- All models and data loaded successfully! Backend is ready. ---")
    except Exception as e:
        print(f"❌ FATAL ERROR LOADING MODELS: {e}")
        print("--- Backend is NOT ready. Please check file paths. ---")
def preprocess_image_for_classifier(image_bytes):
    img = Image.open(io.BytesIO(image_bytes))
    img = img.resize((IMG_SIZE, IMG_SIZE))
    img_array = np.array(img)
    img_array = np.expand_dims(img_array, axis=0)
    return img_array

# --- 3. CORE API ROUTES ---
# ... ( /predict, /get-calories, /get-diet-plan, /log-meal, /get-my-meals are unchanged) ...
@app.route('/predict', methods=['POST'])
def predict_pipeline():
    # ... (code unchanged) ...
    if 'image' not in request.files: return jsonify({'error': 'No image file provided'}), 400
    if not detector_model or not classifier_model: return jsonify({'error': 'Models are not loaded.'}), 500
    file = request.files['image']
    try:
        image_bytes = file.read()
        nparr = np.frombuffer(image_bytes, np.uint8)
        original_image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        detection_results = detector_model(original_image)
        detected_foods = []
        for result in detection_results:
            for box in result.boxes:
                x1, y1, x2, y2 = [int(i) for i in box.xyxy[0]]
                cropped_image = original_image[y1:y2, x1:x2]
                if cropped_image.size == 0: continue
                cropped_image_rgb = cv2.cvtColor(cropped_image, cv2.COLOR_BGR2RGB)
                pil_image = Image.fromarray(cropped_image_rgb)
                with io.BytesIO() as buf:
                    pil_image.save(buf, format='JPEG')
                    cropped_image_bytes = buf.getvalue()
                processed_crop = preprocess_image_for_classifier(cropped_image_bytes)
                predictions = classifier_model.predict(processed_crop, verbose=0)
                top_index = np.argmax(predictions[0])
                food_name = classifier_class_names[top_index]
                confidence = float(np.max(predictions[0]))
                food_group = food_groups.get(food_name, "Unknown")
                detected_foods.append({
                    "food_name_raw": food_name, "food_name_display": food_name.replace("_", " "),
                    "group": food_group, "confidence": f"{confidence * 100:.2f}%",
                    "box": [x1, y1, x2, y2]
                })
        return jsonify(detected_foods)
    except Exception as e:
        print(f"Error in /predict: {e}")
        return jsonify({'error': f'Error processing image: {str(e)}'}), 500

@app.route('/get-calories', methods=['POST'])
def get_calories():
    # ... (code unchanged) ...
    if not CALORIE_NINJA_API_KEY: return jsonify({'error': 'Calorie API key not configured.'}), 500
    data = request.json
    food_name_raw = data.get('food_name')
    pixel_area = data.get('pixel_area')
    if not food_name_raw or not pixel_area: return jsonify({'error': 'Missing food_name or pixel_area'}), 400
    query_string = food_name_raw.replace("_", " ")
    try:
        response = requests.get(CALORIE_API_URL + query_string, headers={'X-Api-Key': CALORIE_NINJA_API_KEY})
        response.raise_for_status()
        nutrition_data = response.json()
        if not nutrition_data.get('items') or len(nutrition_data['items']) == 0:
            return jsonify({"label": "Calories not found", "calories": 0, "protein_g": 0, "fat_g": 0, "carbs_g": 0})
        first_item = nutrition_data['items'][0]
        calories_per_100g = first_item.get('calories_per_100g', first_item.get('calories', 0))
        protein_per_100g = first_item.get('protein_g', 0)
        fat_per_100g = first_item.get('fat_total_g', 0)
        carbs_per_100g = first_item.get('carbohydrates_total_g', 0)
        standard_area = portion_data.get("standards", {}).get(food_name_raw, portion_data["default_area"])
        portion_multiplier = pixel_area / standard_area
        estimated_grams = 100 * portion_multiplier
        final_calories = calories_per_100g * portion_multiplier
        final_protein = protein_per_100g * portion_multiplier
        final_fat = fat_per_100g * portion_multiplier
        final_carbs = carbs_per_100g * portion_multiplier
        return jsonify({
            "label": f"{final_calories:.0f} kcal (Est. {estimated_grams:.0f}g)",
            "calories": final_calories, "protein_g": final_protein,
            "fat_g": final_fat, "carbs_g": final_carbs
        })
    except Exception as e:
        print(f"Error calling CalorieNinjas API: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/get-diet-plan', methods=['POST'])
def get_diet_plan():
    # ... (code unchanged) ...
    if not gemini_model: return jsonify({'error': 'Gemini AI model not loaded.'}), 500
    data = request.json
    scanned_foods = data.get('foods')
    user_id, error_response = get_user_id_from_token(request, allow_no_token=True)
    if error_response and user_id is None: return error_response
    profile = { "goal": "general health", "daily_calories_target": 2200 }
    if db and user_id:
        try:
            user_ref = db.collection('user_profiles').document(user_id)
            user_data = user_ref.get()
            if user_data.exists: profile = user_data.to_dict()
        except Exception as e:
            print(f"Warning: Could not fetch user profile from Firestore: {e}")
    prompt = f"""
    You are a helpful and supportive nutrition assistant.
    My profile: {profile.get('goal', 'general health')}.
    My target daily calories are: {profile.get('daily_calories_target', 2200)}.
    The food I just scanned is: {', '.join([food.get('food_name_display', 'food') for food in scanned_foods])}
    Please generate a short, encouraging, and helpful "Recommended Diet Plan" for the rest of my day.
    Keep it to one paragraph.
    Start by acknowledging the food I'm eating, and then suggest what I should focus on for my next meals (e.g., "for dinner, try...") to stay on track with my goal.
    """
    try:
        response = gemini_model.generate_content(prompt)
        return jsonify({ "plan": response.text })
    except Exception as e:
        print(f"Error from Gemini API: {e}")
        return jsonify({"error": "Could not generate diet plan."}), 500

@app.route('/log-meal', methods=['POST'])
def log_meal():
    # ... (code unchanged) ...
    if not db: return jsonify({'error': 'Database not initialized.'}), 500
    user_id, error_response = get_user_id_from_token(request)
    if error_response: return error_response
    data = request.json
    foods = data.get('foods')
    if not foods: return jsonify({'error': 'No food data provided'}), 400
    try:
        meal_data = {"timestamp": firestore.SERVER_TIMESTAMP, "foods": foods}
        meal_ref = db.collection('user_meals').document(user_id).collection('meals').add(meal_data)
        return jsonify({"success": True, "meal_id": meal_ref[1].id})
    except Exception as e:
        print(f"Error logging meal to Firestore: {e}")
        return jsonify({'error': 'Failed to log meal.'}), 500

@app.route('/get-my-meals', methods=['GET'])
def get_my_meals():
    # ... (code unchanged) ...
    if not db: return jsonify({'error': 'Database not initialized.'}), 500
    user_id, error_response = get_user_id_from_token(request)
    if error_response: return error_response
    try:
        meals_ref = db.collection('user_meals').document(user_id).collection('meals').order_by(
            "timestamp", direction=firestore.Query.DESCENDING).limit(50) # Get 10 most recent meals
        meals = []
        for doc in meals_ref.stream():
            meal_data = doc.to_dict()
            meal_data['id'] = doc.id
            if 'timestamp' in meal_data and meal_data['timestamp']:
                 meal_data['timestamp'] = meal_data['timestamp'].strftime('%Y-%m-%d %H:%M:%S')
            meals.append(meal_data)
        return jsonify(meals)
    except Exception as e:
        print(f"Error fetching meals: {e}")
        return jsonify({'error': 'Failed to fetch meals.'}), 500
        
@app.route('/my-foods', methods=['POST'])
def add_custom_food():
    # ... (code unchanged) ...
    if not db: return jsonify({'error': 'Database not initialized.'}), 500
    user_id, error_response = get_user_id_from_token(request)
    if error_response: return error_response
    data = request.json
    if not all(k in data for k in ('name', 'calories', 'protein_g', 'fat_g', 'carbs_g')):
        return jsonify({'error': 'Missing required fields'}), 400
    try:
        food_data = {
            "name": data['name'], "calories": float(data['calories']),
            "protein_g": float(data['protein_g']), "fat_g": float(data['fat_g']),
            "carbs_g": float(data['carbs_g']),
        }
        food_ref = db.collection('user_custom_foods').document(user_id).collection('foods').add(food_data)
        return jsonify({"success": True, "food_id": food_ref[1].id, "data": food_data})
    except Exception as e:
        print(f"Error adding custom food: {e}")
        return jsonify({'error': 'Failed to save food.'}), 500

@app.route('/my-foods', methods=['GET'])
def get_custom_foods():
    # ... (code unchanged) ...
    if not db: return jsonify({'error': 'Database not initialized.'}), 500
    user_id, error_response = get_user_id_from_token(request)
    if error_response: return error_response
    try:
        foods_ref = db.collection('user_custom_foods').document(user_id).collection('foods').order_by("name")
        foods = []
        for doc in foods_ref.stream():
            food_data = doc.to_dict()
            food_data['id'] = doc.id
            foods.append(food_data)
        return jsonify(foods)
    except Exception as e:
        print(f"Error fetching custom foods: {e}")
        return jsonify({'error': 'Failed to fetch custom foods.'}), 500

@app.route('/my-foods/<food_id>', methods=['DELETE'])
def delete_custom_food(food_id):
    # ... (code unchanged) ...
    if not db: return jsonify({'error': 'Database not initialized.'}), 500
    user_id, error_response = get_user_id_from_token(request)
    if error_response: return error_response
    try:
        db.collection('user_custom_foods').document(user_id).collection('foods').document(food_id).delete()
        return jsonify({"success": True, "deleted_id": food_id})
    except Exception as e:
        print(f"Error deleting custom food: {e}")
        return jsonify({'error': 'Failed to delete food.'}), 500

@app.route('/lookup-barcode', methods=['POST'])
def lookup_barcode():
    # ... (code unchanged) ...
    data = request.json
    upc_code = data.get('upc_code')
    if not upc_code: return jsonify({'error': 'No upc_code provided'}), 400
    OPEN_FOOD_FACTS_URL = f"https://world.openfoodfacts.org/api/v0/product/{upc_code}.json"
    try:
        response = requests.get(OPEN_FOOD_FACTS_URL)
        response.raise_for_status()
        data = response.json()
        if data.get('status') == 0 or not data.get('product'):
            return jsonify({'error': 'Product not found'}), 404
        product = data.get('product')
        nutriments = product.get('nutriments', {})
        serving_size_str = product.get('serving_size', '100g')
        calories = nutriments.get('energy-kcal_serving', nutriments.get('energy-kcal_100g', 0))
        protein = nutriments.get('proteins_serving', nutriments.get('proteins_100g', 0))
        fat = nutriments.get('fat_serving', nutriments.get('fat_100g', 0))
        carbs = nutriments.get('carbohydrates_serving', nutriments.get('carbohydrates_100g', 0))
        food_item = {
            "food_name_display": product.get('product_name', 'Unknown Product'),
            "group": product.get('categories', 'Packaged Food').split(',')[0],
            "confidence": "100.00%",
            "label": f"{calories or 0:.0f} kcal ({serving_size_str})",
            "calories": calories or 0, "protein_g": protein or 0,
            "fat_g": fat or 0, "carbs_g": carbs or 0
        }
        return jsonify([food_item])
    except Exception as e:
        print(f"Error calling Open Food Facts API: {e}")
        return jsonify({'error': str(e)}), 500

# --- 4. NEW AI CHATBOT ROUTE ---

@app.route('/chat-with-ai', methods=['POST'])
def chat_with_ai():
    """
    This is the main AI Chatbot endpoint.
    It builds a full context of the user's profile and meal history
    and uses it to hold a conversation with the Gemini AI.
    """
    if not gemini_model or not db:
        return jsonify({'error': 'Backend not fully initialized.'}), 500
        
    user_id, error_response = get_user_id_from_token(request)
    if error_response:
        return error_response
        
    data = request.json
    chat_history = data.get('history', [])
    
    try:
        # 1. Fetch User Profile
        profile_ref = db.collection('user_profiles').document(user_id)
        profile_data = profile_ref.get()
        if profile_data.exists:
            profile = profile_data.to_dict()
        else:
            profile = {"goal": "general health", "daily_calories_target": 2200}
            
        # 2. Fetch Recent Meals
        meals_ref = db.collection('user_meals').document(user_id).collection('meals').order_by(
            "timestamp", direction=firestore.Query.DESCENDING).limit(5) # Get 5 most recent meals
        meals = []
        for doc in meals_ref.stream():
            meals.append(doc.to_dict())
            
        # 3. Create the System Prompt (The AI's "Memory")
        system_prompt = f"""
        You are "Nutri-AI," a friendly and expert nutritionist.
        Your role is to act as a personal coach to help me with my health goals.
        You must adhere to the following rules:
        - Keep your answers supportive, encouraging, and easy to understand.
        - Do not give generic advice. Use my specific profile and meal history to give me personalized, actionable tips.
        - If I ask for a recipe, provide one.
        - If I ask about a food, give me its health benefits.
        - My conversation with you is ongoing. Remember what we've talked about.

        Here is my data:
        
        My Profile:
        - My Goal: {profile.get('goal', 'not set')}
        - My Target Daily Calories: {profile.get('daily_calories_target', 'not set')}

        My 5 Most Recently Logged Meals (most recent first):
        {json.dumps(meals, indent=2, default=str)}

        Please start the conversation by introducing yourself (Nutri-AI) and asking an open-ended question about my goals or how I'm feeling today, based on my profile.
        """
        
        # 4. Create the full chat history
        # We start a new chat session every time, but we "prime" it
        # with the system prompt and the user's previous messages.
        
        full_history_for_gemini = []
        
        # Add the "System Prompt"
        full_history_for_gemini.append({
            "role": "user",
            "parts": [system_prompt]
        })
        # Add the AI's first "OK" response
        full_history_for_gemini.append({
            "role": "model",
            "parts": ["Understood. I am Nutri-AI, your personal nutrition coach. I have your profile and meal history. I'm ready to help!"]
        })
        
        # Add the user's actual chat history from the frontend
        full_history_for_gemini.extend(chat_history)
        
        # 5. Start a new chat session and send the full history
        chat = gemini_model.start_chat(history=full_history_for_gemini)
        
        # We don't need to send the history again, just the *last* message.
        # But wait, the user's last message is *already in* chat_history.
        # This means we just need Gemini to respond to the last thing.
        # This is a problem if the history is empty.
        
        # --- REVISED LOGIC ---
        
        # If the history is empty, the frontend is asking for the *first* message.
        # If it's not empty, the frontend is sending a new message.
        
        last_message = "Generate your introductory greeting."
        if len(chat_history) > 0:
            last_message = chat_history[-1]["parts"][0]
            # Initialize the chat with all *previous* messages
            chat = gemini_model.start_chat(history=full_history_for_gemini[:-1])
        else:
            # This is the very first message. The history only has our system prompt.
            chat = gemini_model.start_chat(history=full_history_for_gemini)

        # Send the last message to get the new response
        response = chat.send_message(last_message)
        
        return jsonify({
            "role": "model",
            "parts": [response.text]
        })

    except Exception as e:
        print(f"Error in /chat-with-ai: {e}")
        return jsonify({'error': str(e)}), 500


# --- 5. HELPER & RUNNER ---
def get_user_id_from_token(request, allow_no_token=False):
    # ... (This function is unchanged) ...
    try:
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            if allow_no_token: return None, None
            return None, (jsonify({'error': 'No authorization token provided'}), 401)
        id_token = auth_header.split(' ')[1]
        decoded_token = auth.verify_id_token(id_token)
        return decoded_token['uid'], None
    except Exception as e:
        print(f"Error verifying token: {e}")
        if allow_no_token: return None, None
        return None, (jsonify({'error': 'Invalid or expired token'}), 401)

if __name__ == '__main__':
    print("--- Starting Food Tracker API ---")
    load_models()
    app.run(debug=True, port=5000, host='0.0.0.0')