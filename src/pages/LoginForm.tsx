// File: LoginForm.tsx
import React, { useState, useEffect } from "react";
import type { AxiosInstance } from "axios";
import forge from "node-forge";
import CryptoJS from "crypto-js";
import { useNavigate } from "react-router-dom";
import "./LoginForm.css";

type LoginFormProps = {
  axiosInstance: AxiosInstance;
  onLoginSuccess: () => Promise<void> | void;
};

type PublicKeyResponse = { publicKey: string };
type AuthResponse = { message: string };

const LoginForm: React.FC<LoginFormProps> = ({
  axiosInstance,
  onLoginSuccess,
}) => {
  const [username, setUsername] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchPublicKey = async () => {
      try {
        const response = await axiosInstance.get<PublicKeyResponse>(
          "/get-public-key"
        );
        setPublicKey(response.data.publicKey);
      } catch (error) {
        console.error("Error fetching public key:", error);
      }
    };
    fetchPublicKey();
  }, [axiosInstance]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    if (!publicKey) {
      alert("Public key is not available");
      setLoading(false);
      return;
    }

    try {
      // Generate a random AES key (128-bit) and encode as Base64
      const aesKey = CryptoJS.lib.WordArray.random(16).toString(
        CryptoJS.enc.Base64
      );

      // Encrypt the password using AES (preserves existing behavior)
      const encryptedPassword = CryptoJS.AES.encrypt(
        password,
        aesKey
      ).toString();

      // Encrypt the AES key using RSA-OAEP
      const rsa = forge.pki.publicKeyFromPem(publicKey);
      const encryptedAesKeyBytes = rsa.encrypt(aesKey, "RSA-OAEP");
      const encryptedAesKey = forge.util.encode64(encryptedAesKeyBytes);

      // Send encrypted data to the backend
      const response = await axiosInstance.post<AuthResponse>("/authenticate", {
        username,
        encryptedAesKey,
        encryptedPassword,
      });

      if (response.data.message === "Authentication successful!") {
        await onLoginSuccess?.();
        navigate("/");
      } else {
        alert(response.data.message);
      }
    } catch (error) {
      console.error("Error during authentication:", error);
      alert("Authentication failed!");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="form-container">
        <h2 className="form-heading">Login</h2>
        <form onSubmit={handleSubmit} className="form">
          <div className="input-group">
            <label htmlFor="username" className="input-label">
              Username
            </label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="input-field"
              autoComplete="username"
            />
          </div>
          <div className="input-group">
            <label htmlFor="password" className="input-label">
              Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="input-field"
              autoComplete="current-password"
            />
          </div>
          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? "Authenticating..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginForm;
