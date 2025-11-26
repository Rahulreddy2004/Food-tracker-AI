import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebaseConfig';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword 
} from "firebase/auth";
import { Coffee } from 'lucide-react'; // Icon

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    try {
      if (isRegistering) {
        // Create new user
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        // Sign in existing user
        await signInWithEmailAndPassword(auth, email, password);
      }
      // On success, Firebase automatically handles the session
      // We just need to go to the home page
      navigate('/');
    } catch (err) {
      setError(err.message); // Show Firebase errors to the user
    }
  };

  return (
    <div className="container login-container">
      <div className="login-box">
        <Coffee size={48} className="login-icon" />
        <h2>{isRegistering ? 'Register Account' : 'Welcome Back'}</h2>
        <p>Log in to your AI Food Tracker</p>

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="input-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength="6"
            />
          </div>
          
          {error && <p className="error-message">{error}</p>}

          <button type="submit" className="login-button">
            {isRegistering ? 'Register' : 'Login'}
          </button>
        </form>

        <p className="toggle-auth">
          {isRegistering ? 'Already have an account?' : "Don't have an account?"}
          <span onClick={() => setIsRegistering(!isRegistering)}>
            {isRegistering ? 'Login' : 'Register'}
          </span>
        </p>
      </div>
    </div>
  );
};

export default Login;