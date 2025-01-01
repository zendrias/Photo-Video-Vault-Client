import React, { useEffect } from "react";
import { Navigate } from "react-router-dom";

function Logout({ axiosInstance, onLogout }) {
  useEffect(() => {
    const performLogout = async () => {
      try {
        const logout = await axiosInstance.post("/logout");
        if (logout.status === 200 && logout.data.message === "Logged out") {
          console.log("Successfully logged out!");
          onLogout();
        }
      } catch (error) {
        console.error("Error logging out:", error);
      }
    };
    performLogout();
  }, [axiosInstance, onLogout]);

  // (2) This <Navigate> only works if your ProtectedRoute 
  //    sees that isAuthenticated = false
  return <Navigate to="/login" replace />;
}

export default Logout;
