import React, { useEffect } from "react";
import { Navigate } from "react-router-dom";
import type { AxiosInstance } from "axios";

type LogoutProps = {
  axiosInstance: AxiosInstance;
  onLogout: () => void | Promise<void>;
};

const Logout: React.FC<LogoutProps> = ({ axiosInstance, onLogout }) => {
  useEffect(() => {
    const performLogout = async () => {
      try {
        const res = await axiosInstance.post<{ message?: string }>("/logout");
        if (res.status === 200 && res.data?.message === "Logged out") {
          console.log("Successfully logged out!");
          await onLogout?.();
        }
      } catch (error) {
        console.error("Error logging out:", error);
      }
    };
    void performLogout();
  }, [axiosInstance, onLogout]);

  return <Navigate to="/login" replace />;
};

export default Logout;
