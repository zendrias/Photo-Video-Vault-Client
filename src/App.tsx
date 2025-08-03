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

const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_BASE_URL,
  withCredentials: true,
  validateStatus: (status) => status < 500,
});

const ProtectedRoute = ({ isAuthenticated, children }) => {
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

const PublicRoute = ({ isAuthenticated, children }) => {
  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }
  return children;
};

const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const [sessionExpired, setSessionExpired] = useState(false);

  const navigate = useNavigate();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const checkAuthStatus = async () => {
    try {
      const response = await axiosInstance.get("/check-auth");
      if (response.data.authenticated) {
        setIsAuthenticated(true);
        setUser(response.data.user);
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

  useEffect(() => {
    checkAuthStatus();
  }, []);

  useEffect(() => {
    if (!loading) {
      intervalRef.current = setInterval(async () => {
        try {
          if (!user) return;
          const res = await axiosInstance.get("/check-auth");
          if (!res.data.authenticated) {
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
      }, 20_000);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    }
  }, [loading]);

  if (loading) {
    return <div>Loading...</div>;
  }

  const handleLogBackIn = () => {
    setSessionExpired(false);
    navigate("/login");
  };

  return (
    <main>
      <NavBar isAuthenticated={isAuthenticated} />
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

        <Route
          path="/"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <FileList axiosInstance={axiosInstance} />
            </ProtectedRoute>
          }
        />

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

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </main>
  );
};

export default App;
