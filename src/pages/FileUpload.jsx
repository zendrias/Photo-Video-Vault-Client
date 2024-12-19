import React, { useState, useEffect } from "react";
import CryptoJS from "crypto-js";
import forge from "node-forge";

const FileUpload = ({ axiosInstance }) => {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [publicKey, setPublicKey] = useState(null);
  const [uploading, setUploading] = useState(false);

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

  const wordArrayToUint8Array = (wordArray) => {
    const words = wordArray.words;
    const sigBytes = wordArray.sigBytes;
    const u8 = new Uint8Array(sigBytes);
    let i = 0,
      offset = 0;
    while (offset < sigBytes) {
      let word = words[i++];
      u8[offset++] = (word >> 24) & 0xff;
      u8[offset++] = (word >> 16) & 0xff;
      u8[offset++] = (word >> 8) & 0xff;
      u8[offset++] = word & 0xff;
    }
    return u8;
  };

  const encryptFile = (file, aesKeyHex) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = function (e) {
        try {
          const arrayBuffer = e.target.result;
          const u8 = new Uint8Array(arrayBuffer);
          const wordArray = CryptoJS.lib.WordArray.create(u8);

          const aesKeyWA = CryptoJS.enc.Hex.parse(aesKeyHex);
          const ivWA = CryptoJS.lib.WordArray.random(16);

          const encrypted = CryptoJS.AES.encrypt(wordArray, aesKeyWA, {
            iv: ivWA,
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7,
          });

          const ivBytes = wordArrayToUint8Array(ivWA);
          const ctBytes = wordArrayToUint8Array(encrypted.ciphertext);

          const combined = new Uint8Array(ivBytes.length + ctBytes.length);
          combined.set(ivBytes, 0);
          combined.set(ctBytes, ivBytes.length);

          // The blob is now encrypted, but its size differs from original.
          // We need the original size for the server. We'll send it separately.
          resolve(new Blob([combined], { type: "application/octet-stream" }));
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
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
      // Generate a random 32-byte key in hex
      const aesKeyHex = CryptoJS.lib.WordArray.random(32).toString(
        CryptoJS.enc.Hex
      );

      // RSA encrypt the AES key
      const rsa = forge.pki.publicKeyFromPem(publicKey);
      const encryptedAesKey = forge.util.encode64(
        rsa.encrypt(aesKeyHex, "RSA-OAEP")
      );

      const formData = new FormData();
      formData.append("encryptedAesKey", encryptedAesKey);

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        // Send original plaintext file size
        formData.append(`originalFileSize_${i}`, file.size);
        const encryptedFileBlob = await encryptFile(file, aesKeyHex);
        formData.append("files", encryptedFileBlob, file.name);
      }

      await axiosInstance.post("/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      alert("Files uploaded successfully!");
      window.location.reload();
    } catch (error) {
      console.error("Error uploading files:", error);
      alert("File upload failed.");
    } finally {
      setUploading(false);
    }
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
