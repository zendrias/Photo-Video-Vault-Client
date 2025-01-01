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
  const [isDragging, setIsDragging] = useState(false);

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

  // ========= DRAG & DROP HANDLERS =========
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles.length > 0) {
      setSelectedFiles(droppedFiles);
      setError(null);
      setUploadComplete(false);
    }
  };
  // ========================================

  // Trigger hidden input when clicking the card (except for the Upload button)
  const handleCardClick = (e) => {
    // If the user clicked the Upload button, don't open the file dialog
    if (e.target.tagName.toLowerCase() === "button") return;
    document.getElementById("file-input").click();
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
    <div
      className={`upload-card ${isDragging ? "drag-over" : ""}`}
      onClick={handleCardClick}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* <h2 className="upload-title">Secure File Upload</h2> */}

      <div className="upload-form">
        {/* Hidden input for selecting files */}
        <input
          id="file-input"
          type="file"
          multiple
          onChange={handleFileChange}
          accept="image/*,video/*"
          className="file-input"
        />

        {/* Display instructions in a label (but no pointer events) */}
        <label htmlFor="file-input" className="file-label">
          <span className="file-label-icon">📂</span>
          <span className="file-label-text">
            {isDragging ? "Drop files here" : "Click / Drag & Drop files"}
          </span>
        </label>

        {selectedFiles.length > 0 && (
          <div className="selected-files">
            <h4>Selected Files:</h4>
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
            <span className="progress-text">{progress}%</span>
          </div>
        )}

        {uploadComplete && (
          <div className="success-message">
            <span className="success-icon">✔</span>
            Upload initiated successfully!
          </div>
        )}

        {/* Stop event propagation so clicking the button does NOT open file dialog */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleUpload();
          }}
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
