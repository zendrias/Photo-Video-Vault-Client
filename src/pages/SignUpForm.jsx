import React, { useState, useEffect } from "react";
import forge from "node-forge";
import { useNavigate } from "react-router-dom";
import "./SignUpForm.css"; // Importing external CSS for styling

const SignUpForm = ({ axiosInstance, onSignupSuccess }) => {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchPublicKey() {
      try {
        const response = await axiosInstance.get("/get-public-key");
        setPublicKey(response.data.publicKey);
      } catch (error) {
        console.error("Error fetching public key", error);
      }
    }
    fetchPublicKey();
  }, [axiosInstance]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!publicKey) {
      alert("Public key is not loaded.");
      return;
    }

    try {
      const rsa = forge.pki.publicKeyFromPem(publicKey);

      // Generate a random AES key (256-bit = 32 bytes)
      const aesKey = forge.random.getBytesSync(32);
      const iv = forge.random.getBytesSync(16);

      // Encrypt the password with AES-CBC
      const cipher = forge.cipher.createCipher("AES-CBC", aesKey);
      cipher.start({ iv });
      cipher.update(forge.util.createBuffer(password, "utf8"));
      cipher.finish();

      const encryptedPasswordHex = cipher.output.toHex();
      const ivHex = forge.util.bytesToHex(iv);

      // Encrypt the AES key with RSA (OAEP if needed)
      const encryptedAesKey = rsa.encrypt(aesKey, "RSA-OAEP");
      const encryptedAesKeyHex = forge.util.bytesToHex(encryptedAesKey);

      // Note: The server code you've provided doesn't currently handle encrypted AES keys/passwords for registration.
      // You'll need to adjust your server code if you intend to encrypt the password during signup.
      // For now, this shows how you'd send encrypted data if desired.
      // If the server doesn't expect this encryption at signup, just send plain text for username/email/password.
      // For maximum security, you might want the same encryption logic as login.

      const response = await axiosInstance.post("/register", {
        username,
        email,
        password, // Or consider sending encrypted if the backend supports it at registration
      });

      console.log(response.data);

      if(response.data.message === "User created") {
        onSignupSuccess()
        navigate("/");
      }
    } catch (error) {
      console.error("Error registering user:", error);
    }
  };

  return (
    <div className="form-container">
      <h1 className="form-heading">Sign Up</h1>
      <form onSubmit={handleSubmit} className="form" autoComplete="off">
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
          <label htmlFor="email" className="input-label">
            Email
          </label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="input-field"
            autoComplete="email"
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
            autoComplete="new-password"
          />
        </div>
        <button type="submit" className="submit-btn">
          Register
        </button>
      </form>
    </div>
  );
};

export default SignUpForm;
