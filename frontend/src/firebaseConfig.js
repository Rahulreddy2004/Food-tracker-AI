// Import the functions you need from the SDKs
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// TODO: Add your Web App's Firebase configuration
// This is the code you copied from the Firebase console
const firebaseConfig = {
  apiKey: "AIzaSyBUarYRU-vHYtWqU8NtN_EUCZn57gZfmcs",
  authDomain: "food-tracker-8baa9.firebaseapp.com",
  projectId: "food-tracker-8baa9",
  storageBucket: "food-tracker-8baa9.firebasestorage.app",
  messagingSenderId: "126329290553",
  appId: "1:126329290553:web:748efcd7232a77a70d72e8",
  measurementId: "G-JTZZHKKZX4"
};


// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export the services you need
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;