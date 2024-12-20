// src/components/FileUpload.jsx
import React, { useState, useEffect } from "react";
import "./FileUpload.css";
import forge from "node-forge";

const FileUpload = ({ axiosInstance }) => {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [publicKey, setPublicKey] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);

  useEffect(() => {
    const fetchPublicKey = async () => {
      try {
        const response = await axiosInstance.get("/get-public-key");
        setPublicKey(response.data.publicKey);
      } catch (error) {
        console.error("Error fetching public key:", error);
        setError("Failed to fetch encryption key.");
      }
    };
    fetchPublicKey();
  }, [axiosInstance]);

  useEffect(() => {
    let interval = null;
    if (jobId) {
      interval = setInterval(async () => {
        try {
          const response = await axiosInstance.get(`/job-status/${jobId}`);
          setJobStatus(response.data.state);
          if (
            response.data.state === "completed" ||
            response.data.state === "failed"
          ) {
            clearInterval(interval);
            if (response.data.state === "completed") {
              alert("Files uploaded and processed successfully!");
            } else {
              setError("File processing failed. Please try again.");
            }
          }
        } catch (error) {
          console.error("Error fetching job status:", error);
          setError("Failed to fetch job status.");
          clearInterval(interval);
        }
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [jobId, axiosInstance]);

  const handleFileChange = (e) => {
    setSelectedFiles(e.target.files);
    setError(null);
  };

  const handleUpload = async () => {
    if (!publicKey) {
      setError("Encryption key not available.");
      return;
    }

    if (selectedFiles.length === 0) {
      setError("Please select at least one file to upload.");
      return;
    }

    setUploading(true);
    setProgress(0);
    setError(null);

    try {
      const randomKey = forge.random.getBytesSync(32);
      const aesKeyHex = forge.util.bytesToHex(randomKey);

      const rsa = forge.pki.publicKeyFromPem(publicKey);
      const encryptedAesKey = forge.util.encode64(
        rsa.encrypt(aesKeyHex, "RSA-OAEP")
      );

      const formData = new FormData();
      formData.append("encryptedAesKey", encryptedAesKey);

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        formData.append(`originalFileSize_${i}`, file.size);
        formData.append("files", file, file.name);
      }

      const response = await axiosInstance.post("/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          setProgress(percentCompleted);
        },
      });

      setJobId(response.data.jobId);
      alert(
        "Files are being processed in the background. You can continue browsing."
      );
      setSelectedFiles([]);
      document.getElementById("file-input").value = "";
    } catch (error) {
      console.error("Error uploading files:", error);
      setError("File upload failed. Please try again.");
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <div className="upload-container">
      <div className="upload-form">
        <label htmlFor="file-input" className="file-label">
          Select Files
        </label>
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
            <h3>Selected Files:</h3>
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
        {jobId && (
          <div className="conversion-message">Processing your files...</div>
        )}
        <button
          onClick={handleUpload}
          disabled={uploading}
          className={`upload-button ${uploading ? "disabled" : ""}`}
        >
          {uploading ? "Uploading..." : "Upload"}
        </button>
        {uploading && (
          <div className="progress-bar">
            <div className="progress" style={{ width: `${progress}%` }}></div>
            <span>{progress}%</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default FileUpload;
