// LoginForm.jsx
import React, { useState, useEffect } from "react";
import forge from "node-forge";
import CryptoJS from "crypto-js";
import { useNavigate } from "react-router-dom";

const LoginForm = ({ axiosInstance, onLoginSuccess }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [publicKey, setPublicKey] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchPublicKey = async () => {
      try {
        const response = await axiosInstance.get("/get-public-key");
        setPublicKey(response.data.publicKey);
      } catch (error) {
        console.error("Error fetching public key:", error);
      }
    };
    fetchPublicKey();
  }, [axiosInstance]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    if (!publicKey) {
      alert("Public key is not available");
      setLoading(false);
      return;
    }

    try {
      // Generate a random AES key
      const aesKey = CryptoJS.lib.WordArray.random(16).toString(
        CryptoJS.enc.Base64
      );

      // Encrypt the password using AES
      const encryptedPassword = CryptoJS.AES.encrypt(
        password,
        aesKey
      ).toString();

      // Encrypt the AES key using RSA-OAEP
      const rsa = forge.pki.publicKeyFromPem(publicKey);
      const encryptedAesKeyBytes = rsa.encrypt(aesKey, "RSA-OAEP");
      const encryptedAesKey = forge.util.encode64(encryptedAesKeyBytes);

      // Send encrypted data to the backend
      const response = await axiosInstance.post("/authenticate", {
        username,
        encryptedAesKey,
        encryptedPassword,
      });

      // If authentication is successful, update auth status and redirect
      if (response.data.message === "Authentication successful!") {
        await onLoginSuccess(); // Re-check auth status
        navigate("/"); // Redirect to home
      } else {
        // Handle other success messages if any
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
    <div>
      <h2>Login</h2>
      <form onSubmit={handleSubmit}>
        <div>
          <label>Username:</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="username"
          />
        </div>
        <div>
          <label>Password:</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>
        <button type="submit" disabled={loading}>
          {loading ? "Authenticating..." : "Login"}
        </button>
      </form>
    </div>
  );
};

export default LoginForm;
