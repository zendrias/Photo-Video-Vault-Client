import React, { useState, useEffect } from "react";
import forge from "node-forge";
import "./FileUpload.css";

const FileUpload = ({ axiosInstance }) => {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [publicKey, setPublicKey] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [jobIds, setJobIds] = useState([]);
  const [uploadComplete, setUploadComplete] = useState(false);

  useEffect(() => {
    // Fetch the server's RSA public key to encrypt our AES key
    const fetchPublicKey = async () => {
      try {
        const response = await axiosInstance.get("/get-public-key");
        setPublicKey(response.data.publicKey);
      } catch (err) {
        console.error("Error fetching public key:", err);
        setError("Failed to fetch public key.");
      }
    };
    fetchPublicKey();
  }, [axiosInstance]);

  const handleFileChange = (e) => {
    setSelectedFiles(e.target.files);
    setError(null);
    setUploadComplete(false);
  };

  const handleUpload = async () => {
    if (!publicKey) {
      setError("No public key available for encryption.");
      return;
    }
    if (selectedFiles.length === 0) {
      setError("Please select at least one file to upload.");
      return;
    }
    setError(null);
    setUploading(true);
    setProgress(0);
    setUploadComplete(false);

    try {
      // 1) Generate a random 32-byte AES key
      const randomKey = forge.random.getBytesSync(32);
      const aesKeyHex = forge.util.bytesToHex(randomKey);

      // 2) Encrypt that key with RSA (server's public key)
      const rsa = forge.pki.publicKeyFromPem(publicKey);
      const encryptedAesKeyBase64 = forge.util.encode64(
        rsa.encrypt(aesKeyHex, "RSA-OAEP")
      );

      // 3) Build FormData
      const formData = new FormData();
      formData.append("encryptedAesKey", encryptedAesKeyBase64);

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        formData.append("files", file, file.name);
      }

      // 4) POST to /upload
      const response = await axiosInstance.post("/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            setProgress(percentCompleted);
          }
        },
      });

      // The server should respond with an array of jobIds
      if (response.data.jobIds) {
        setJobIds(response.data.jobIds);
      }
      setUploadComplete(true);
      setSelectedFiles([]);
      document.getElementById("file-input").value = "";
    } catch (err) {
      console.error("Error uploading files:", err);
      setError("File upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="upload-container">
      <h2>Upload Files</h2>
      <div className="upload-form">
        <input
          id="file-input"
          type="file"
          multiple
          onChange={handleFileChange}
          accept="image/*,video/*"
          className="file-input"
        />
        {selectedFiles.length > 0 && (
          <div className="selected-files">
            <ul>
              {Array.from(selectedFiles).map((file, index) => (
                <li key={index}>
                  {file.name} - {(file.size / (1024 * 1024)).toFixed(2)} MB
                </li>
              ))}
            </ul>
          </div>
        )}
        {error && <div className="error-message">{error}</div>}
        {uploading && (
          <div className="progress-bar">
            <div className="progress" style={{ width: `${progress}%` }}></div>
            <span>{progress}%</span>
          </div>
        )}
        {uploadComplete && (
          <div className="success-message">Upload initiated successfully!</div>
        )}
        <button
          onClick={handleUpload}
          disabled={uploading || selectedFiles.length === 0}
          className="upload-button"
        >
          {uploading ? "Uploading..." : "Upload"}
        </button>
      </div>
    </div>
  );
};

export default FileUpload;
