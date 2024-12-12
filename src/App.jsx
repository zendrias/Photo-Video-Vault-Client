// App.jsx
import React, { useEffect, useState } from "react";
import axios from "axios";
import { Route, Routes, Navigate } from "react-router-dom";
import LoginForm from "./pages/LoginForm";
import SignUpForm from "./pages/SignUpForm";
import FileUpload from "./pages/FileUpload";
import FileList from "./pages/FileList";

// Create a reusable axios instance with secure defaults
const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_BASE_URL,
  withCredentials: true, // Always include cookies
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

  // Initial authentication check on mount
  useEffect(() => {
    checkAuthStatus();
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <main>
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
              <SignUpForm axiosInstance={axiosInstance} />
            </PublicRoute>
          }
        />

        {/* Protected route for the home page and file upload */}
        <Route
          path="/"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <h1>You are authenticated as {user?.username}</h1>
              <FileUpload axiosInstance={axiosInstance} />{" "}
              {/* Include FileUpload */}
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

        {/* All Users Files Here */}
        <Route
          path="/files"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <FileList axiosInstance={axiosInstance} />
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
