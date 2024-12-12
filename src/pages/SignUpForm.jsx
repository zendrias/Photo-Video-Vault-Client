import { useState, useEffect } from "react";
import forge from "node-forge";

const SignUpForm = ({ axiosInstance }) => {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [publicKey, setPublicKey] = useState("");

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
      alert("User registered successfully!");
    } catch (error) {
      console.error("Error registering user:", error);
      alert("Registration failed.");
    }
  };

  return (
    <div>
      <h1>Signup</h1>
      <form onSubmit={handleSubmit} autoComplete="off">
        <div>
          <label>Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="username"
          />
        </div>
        <div>
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <div>
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
          />
        </div>
        <button type="submit">Register</button>
      </form>
    </div>
  );
};

export default SignUpForm;
