// src/pages/FileUpload.jsx
import React, { useState, useEffect } from "react";
import axios from "axios";
import forge from "node-forge";
import CryptoJS from "crypto-js";
import { useNavigate } from "react-router-dom";

const FileUpload = ({ axiosInstance }) => {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [publicKey, setPublicKey] = useState(null);
  const [uploading, setUploading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchPublicKey = async () => {
      try {
        const response = await axiosInstance.get("/get-public-key");
        setPublicKey(response.data.publicKey);
      } catch (error) {
        console.error("Error fetching public key:", error);
        alert("Failed to fetch encryption key.");
      }
    };
    fetchPublicKey();
  }, [axiosInstance]);

  const handleFileChange = (e) => {
    setSelectedFiles(e.target.files);
  };

  const handleUpload = async () => {
    if (!publicKey) {
      alert("Encryption key not available.");
      return;
    }

    if (selectedFiles.length === 0) {
      alert("Please select at least one file to upload.");
      return;
    }

    setUploading(true);

    try {
      // Generate a random AES key
      const aesKey = CryptoJS.lib.WordArray.random(32).toString(
        CryptoJS.enc.Hex
      ); // 256-bit key

      // Encrypt the AES key with the server's public RSA key
      const rsa = forge.pki.publicKeyFromPem(publicKey);
      const encryptedAesKey = forge.util.encode64(
        rsa.encrypt(aesKey, "RSA-OAEP")
      );

      // Prepare FormData
      const formData = new FormData();
      formData.append("encryptedAesKey", encryptedAesKey);

      // Encrypt each file and append to FormData
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const encryptedFile = await encryptFile(file, aesKey);
        formData.append("files", encryptedFile, file.name + ".enc");
      }

      // Send the encrypted files and encrypted AES key to the backend
      const response = await axiosInstance.post("/upload", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      alert("Files uploaded successfully!");
      navigate("/"); // Redirect to home or desired page
    } catch (error) {
      console.error("Error uploading files:", error);
      alert("File upload failed.");
    } finally {
      setUploading(false);
    }
  };

  // Function to encrypt a file using AES
  const encryptFile = (file, aesKey) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = function (e) {
        try {
          const binaryStr = e.target.result;
          const wordArray = CryptoJS.lib.WordArray.create(binaryStr);
          const encrypted = CryptoJS.AES.encrypt(wordArray, aesKey).toString();
          const encryptedBlob = new Blob([encrypted], {
            type: "application/octet-stream",
          });
          resolve(encryptedBlob);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = function (err) {
        reject(err);
      };
      reader.readAsArrayBuffer(file);
    });
  };

  return (
    <div>
      <h2>Upload Files</h2>
      <input
        type="file"
        multiple
        onChange={handleFileChange}
        accept="image/*,video/*"
      />
      <button onClick={handleUpload} disabled={uploading}>
        {uploading ? "Uploading..." : "Upload"}
      </button>
    </div>
  );
};

export default FileUpload;
