import { useState, useEffect } from 'react';
import { auth } from '../firebaseConfig';
import { onAuthStateChanged } from 'firebase/auth';

function useAuth() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true); // Add loading state

  useEffect(() => {
    // This is the Firebase "listener"
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoading(false); // We're done checking
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  return { currentUser, loading }; // Return both
}

export default useAuth;