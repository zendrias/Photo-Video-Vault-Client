// App.jsx
import React, { useEffect, useState, useRef } from "react";
import axios from "axios";
import { Route, Routes, Navigate, useNavigate } from "react-router-dom";
import LoginForm from "./pages/LoginForm";
import SignUpForm from "./pages/SignUpForm";
import FileUpload from "./pages/FileUpload";
import FileList from "./pages/FileList";
import NavBar from "./components/Navbar/Navbar";
import Logout from "./components/Logout/Logout";
import "./App.css";

// Create a reusable axios instance with secure defaults
const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_BASE_URL,
  withCredentials: true, // Always include cookies
  validateStatus: (status) => status < 500,
});

// Protected Route Component
const ProtectedRoute = ({ isAuthenticated, children }) => {
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

// Public Route Component
const PublicRoute = ({ isAuthenticated, children }) => {
  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }
  return children;
};

const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null); // Store user info
  const [loading, setLoading] = useState(true);

  // NEW: Track session expiration popup
  const [sessionExpired, setSessionExpired] = useState(false);

  const navigate = useNavigate();
  const intervalRef = useRef(null);

  // Function to check authentication status
  const checkAuthStatus = async () => {
    try {
      const response = await axiosInstance.get("/check-auth");
      if (response.data.authenticated) {
        setIsAuthenticated(true);
        setUser(response.data.user); // Store the returned user data
      } else {
        setIsAuthenticated(false);
        setUser(null);
      }
    } catch (error) {
      console.error("Error checking authentication:", error);
      setIsAuthenticated(false);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUser(null);
  };

  // Initial authentication check on mount
  useEffect(() => {
    checkAuthStatus();
  }, []);

  // NEW: Periodic check every 20s
  useEffect(() => {
    // Only start the interval after we've done the initial load
    if (!loading) {
      intervalRef.current = setInterval(async () => {
        try {
          const res = await axiosInstance.get("/check-auth");
          if (!res.data.authenticated) {
            // If they're no longer authenticated => show popup
            setIsAuthenticated(false);
            setUser(null);
            setSessionExpired(true);
          }
        } catch (err) {
          console.error("Session check error:", err);
          setIsAuthenticated(false);
          setUser(null);
          setSessionExpired(true);
        }
      }, 20_000); // 20 seconds

      return () => clearInterval(intervalRef.current);
    }
  }, [loading]);

  if (loading) {
    return <div>Loading...</div>;
  }

  // On "Log Back In," user must be re-directed
  const handleLogBackIn = () => {
    setSessionExpired(false);
    navigate("/login");
  };

  return (
    <main>
      <NavBar isAuthenticated={isAuthenticated} />

      {/* 
         ========== Session Expired Popup ========== 
         You could style this as a modal or overlay 
      */}
      {sessionExpired && (
        <div className="session-expired-overlay">
          <div className="session-expired-popup">
            <h2>Session Expired</h2>
            <p>Your session has expired. Please log back in.</p>
            <button onClick={handleLogBackIn}>Log Back In</button>
          </div>
        </div>
      )}

      <Routes>
        {/* Public routes for login and signup */}
        <Route
          path="/login"
          element={
            <PublicRoute isAuthenticated={isAuthenticated}>
              <LoginForm
                axiosInstance={axiosInstance}
                onLoginSuccess={checkAuthStatus}
              />
            </PublicRoute>
          }
        />
        <Route
          path="/signup"
          element={
            <PublicRoute isAuthenticated={isAuthenticated}>
              <SignUpForm
                axiosInstance={axiosInstance}
                onSignupSuccess={checkAuthStatus}
              />
            </PublicRoute>
          }
        />

        {/* Protected route for the home page and file list */}
        <Route
          path="/"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              {/* <h1>You are authenticated as {user?.username}</h1> */}
              <FileList axiosInstance={axiosInstance} />
            </ProtectedRoute>
          }
        />

        {/* a separate route for file uploads */}
        <Route
          path="/upload"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <FileUpload axiosInstance={axiosInstance} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/logout"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <Logout axiosInstance={axiosInstance} onLogout={handleLogout} />
            </ProtectedRoute>
          }
        />

        {/* Catch-all route to redirect unknown paths */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </main>
  );
};

export default App;
