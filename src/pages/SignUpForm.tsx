import React, { useState, useEffect } from "react";
import type { AxiosInstance } from "axios";
import forge from "node-forge";
import { useNavigate } from "react-router-dom";
import "./SignUpForm.css";

type SignUpFormProps = {
  axiosInstance: AxiosInstance;
  onSignupSuccess: () => Promise<void> | void;
};

type PublicKeyResponse = { publicKey: string };
type RegisterResponse = { message: string };

const SignUpForm: React.FC<SignUpFormProps> = ({
  axiosInstance,
  onSignupSuccess,
}) => {
  const [username, setUsername] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [publicKey, setPublicKey] = useState<string>("");
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchPublicKey() {
      try {
        const response = await axiosInstance.get<PublicKeyResponse>(
          "/get-public-key"
        );
        setPublicKey(response.data.publicKey);
      } catch (error) {
        console.error("Error fetching public key", error);
      }
    }
    fetchPublicKey();
  }, [axiosInstance]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!publicKey) {
      alert("Public key is not loaded.");
      return;
    }

    try {
      const aesKey = forge.random.getBytesSync(32);
      const iv = forge.random.getBytesSync(16);

      const cipher = forge.cipher.createCipher("AES-CBC", aesKey);
      cipher.start({ iv });
      cipher.update(forge.util.createBuffer(password, "utf8"));
      cipher.finish();

      const response = await axiosInstance.post<RegisterResponse>("/register", {
        username,
        email,
        password,
      });

      if (response.data.message === "User created") {
        onSignupSuccess?.();
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
