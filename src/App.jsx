import { useEffect, useState } from "react";
import axios from "axios";
import { Route, Routes } from "react-router-dom";
import LoginForm from "./pages/LoginForm";
import SignUpForm from "./pages/SignUpForm";

// Create a reusable axios instance with secure defaults
const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_BASE_URL,
  withCredentials: true, // Always include cookies
});

const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const response = await axiosInstance.get("/check-auth");
        if (response.data.authenticated) {
          setIsAuthenticated(true);
        } else {
          setIsAuthenticated(false);
        }
      } catch (error) {
        console.error("Error checking authentication:", error);
        setIsAuthenticated(false);
      } finally {
        setLoading(false);
      }
    };

    checkAuthStatus();
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <main>
      <Routes>
        <Route
          element={
            isAuthenticated ? (
              <h1>You are authenticated</h1>
            ) : (
              <LoginForm axiosInstance={axiosInstance} />
            )
          }
          path="/"
        />
        <Route
          element={
            isAuthenticated ? (
              <h1>You are already signed in</h1>
            ) : (
              <SignUpForm axiosInstance={axiosInstance} />
            )
          }
          path="/signup"
        />
      </Routes>
    </main>
  );
};

export default App;
