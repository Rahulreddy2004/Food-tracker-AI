import React from 'react';
import { Navigate } from 'react-router-dom';
import useAuth from '../hooks/useAuth';
import { Loader2 } from 'lucide-react'; // We'll use this for a loading spinner

const ProtectedRoute = ({ children }) => {
  const { currentUser, loading } = useAuth();

  if (loading) {
    // We are still checking if the user is logged in
    // Show a full-page loader
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Loader2 className="spinner" size={48} />
      </div>
    );
  }

  if (!currentUser) {
    // If we're done loading AND there's no user,
    // send them to the /login page
    return <Navigate to="/login" replace />;
  }

  // If we're done loading AND there is a user,
  // show the page they asked for (the "children")
  return children;
};

export default ProtectedRoute;