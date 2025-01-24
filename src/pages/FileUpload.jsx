import React, { useState, useEffect } from "react";
import forge from "node-forge";
import "./FileUpload.css";

const FileUpload = ({ axiosInstance }) => {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [checkedIndices, setCheckedIndices] = useState([]); // track which files are checked

  const [publicKey, setPublicKey] = useState(null);

  // Upload states
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [jobIds, setJobIds] = useState([]);
  const [uploadComplete, setUploadComplete] = useState(false);

  // Drag & Drop
  const [isDragging, setIsDragging] = useState(false);

  // Toggles
  const [useE2EE, setUseE2EE] = useState(false);
  const [addToAlbum, setAddToAlbum] = useState(false);

  // Shared album logic
  const [albumList, setAlbumList] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedAlbum, setSelectedAlbum] = useState("create_new");

  useEffect(() => {
    // Fetch RSA public key
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

    // Fetch shared albums
    const fetchSharedAlbums = async () => {
      try {
        const res = await axiosInstance.get("/shared-albums");
        setAlbumList(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error("Error fetching shared albums:", err);
      }
    };
    fetchSharedAlbums();
  }, [axiosInstance]);

  // ======== File Handling ========
  const handleFileChange = (e) => {
    setSelectedFiles(e.target.files);
    setCheckedIndices([]); // reset checks
    setError(null);
    setUploadComplete(false);
  };

  // ======== Drag & Drop ========
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
      setCheckedIndices([]);
      setError(null);
      setUploadComplete(false);
    }
  };

  // Clicking the card triggers file input
  const handleCardClick = (e) => {
    // If user clicked something inside the card that is interactive, skip
    if (e.target.tagName.toLowerCase() === "button") return;
    document.getElementById("file-input").click();
  };

  // ======== Toggle file checks ========
  const handleCheckFile = (index) => {
    if (checkedIndices.includes(index)) {
      // uncheck
      setCheckedIndices(checkedIndices.filter((i) => i !== index));
    } else {
      // check
      setCheckedIndices([...checkedIndices, index]);
    }
  };

  const allFilesSelected = checkedIndices.length === selectedFiles.length && selectedFiles.length > 0;

  const handleCheckAll = () => {
    if (allFilesSelected) {
      // uncheck all
      setCheckedIndices([]);
    } else {
      // check all
      const indices = Array.from(selectedFiles).map((_, idx) => idx);
      setCheckedIndices(indices);
    }
  };

  const handleRemoveSelected = () => {
    if (checkedIndices.length === 0) return;
    // Convert FileList to array => filter out checked
    const filesArr = Array.from(selectedFiles);
    const filtered = filesArr.filter((_, idx) => !checkedIndices.includes(idx));
    // Create a new FileList from filtered? Easiest is to store them in state as an array of file objects
    // We'll just store as array in selectedFiles so we can reassign
    const dataTransfer = new DataTransfer();
    filtered.forEach((f) => dataTransfer.items.add(f));
    setSelectedFiles(dataTransfer.files); // new FileList
    setCheckedIndices([]);
  };

  // ======== Upload Logic ========
  const handleUpload = async () => {
    setError(null);
    setUploadComplete(false);

    // Basic checks
    if (selectedFiles.length === 0) {
      setError("Please select at least one file to upload.");
      return;
    }
    if (useE2EE && !publicKey) {
      setError("Public key not available for E2EE. Please try again.");
      return;
    }

    setUploading(true);
    setProgress(0);

    try {
      const formData = new FormData();

      // If E2EE => generate random AES key & RSA-encrypt it
      if (useE2EE) {
        const randomKey = forge.random.getBytesSync(32);
        const aesKeyHex = forge.util.bytesToHex(randomKey);

        const rsa = forge.pki.publicKeyFromPem(publicKey);
        const encryptedAesKeyBase64 = forge.util.encode64(
          rsa.encrypt(aesKeyHex, "RSA-OAEP")
        );
        formData.append("encryptedAesKey", encryptedAesKeyBase64);
      } else {
        // indicate server-side encryption
        formData.append("encryptedAesKey", "SERVER_SIDE_ENCRYPTION");
      }

      // Add files
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        formData.append("files", file, file.name);
      }

      // Shared album info
      if (addToAlbum) {
        formData.append("addToAlbum", "true");
        if (selectedAlbum !== "create_new") {
          formData.append("albumId", selectedAlbum);
        } else {
          // create new album from searchTerm
          if (searchTerm.trim().length > 0) {
            formData.append("newAlbumName", searchTerm.trim());
          } else {
            formData.append("newAlbumName", "Untitled Album");
          }
        }
      } else {
        formData.append("addToAlbum", "false");
      }

      // POST to /upload
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

  // Filter albums
  const filteredAlbums = Array.isArray(albumList)
    ? albumList.filter((album) =>
        album.name.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : [];

  return (
    <div className="file-upload-container">
      {/* Toggles + Upload Button at the top (outside the upload card) */}
      <div className="top-controls">
        {/* Toggle #1: E2EE */}
        <div className="toggle-group">
          <label className="switch">
            <input
              type="checkbox"
              checked={useE2EE}
              onChange={() => setUseE2EE(!useE2EE)}
            />
            <span className="slider"></span>
          </label>
          <span className="toggle-text">
            {useE2EE ? "End-to-End Encryption" : "Server-Side Encryption"}
          </span>
        </div>

        {/* Toggle #2: Shared Album */}
        <div className="toggle-group">
          <label className="switch">
            <input
              type="checkbox"
              checked={addToAlbum}
              onChange={() => setAddToAlbum(!addToAlbum)}
            />
            <span className="slider"></span>
          </label>
          <span className="toggle-text">
            {addToAlbum ? "Adding to Shared Album" : "Private Album"}
          </span>
        </div>

        {/* The Upload button */}
        <button
          onClick={handleUpload}
          disabled={uploading || selectedFiles.length === 0}
          className="upload-button-top"
        >
          {uploading ? "Uploading..." : "Upload"}
        </button>
      </div>

      {/* If user wants to add to an album => show search + select */}
      {addToAlbum && (
        <div className="album-select-container">
          <label htmlFor="album-search" className="album-label">
            Search or Create Album:
          </label>
          <input
            id="album-search"
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search existing albums or type a new name"
            className="album-search-input"
          />

          <select
            className="album-dropdown"
            value={selectedAlbum}
            onChange={(e) => setSelectedAlbum(e.target.value)}
          >
            <option value="create_new">-- Create New Album --</option>
            {filteredAlbums.map((album) => (
              <option key={album.id} value={album.id}>
                {album.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* The drop zone card */}
      <div
        className={`upload-card ${isDragging ? "drag-over" : ""}`}
        onClick={handleCardClick}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="upload-form">
          {/* Hidden file input */}
          <input
            id="file-input"
            type="file"
            multiple
            onChange={handleFileChange}
            // accept="image/*,video/*"
            className="file-input"
          />

          <label htmlFor="file-input" className="file-label">
            <span className="file-label-icon">📂</span>
            <span className="file-label-text">
              {isDragging ? "Drop files here" : "Click / Drag & Drop files"}
            </span>
          </label>

          {/* Show selected files with checkboxes */}
          {selectedFiles.length > 0 && (
            <div className="selected-files">
              <div className="file-list-header">
                <h4>Selected Files:</h4>

                {/* Master "select all" checkbox + Remove button */}
                <div className="file-list-actions">
                  <div className="checkbox-container">
                    <input
                      type="checkbox"
                      checked={allFilesSelected}
                      onChange={handleCheckAll}
                    />
                  </div>
                  {checkedIndices.length > 0 && (
                    <button className="remove-button" onClick={handleRemoveSelected}>
                      Remove Selected
                    </button>
                  )}
                </div>
              </div>

              <ul>
                {Array.from(selectedFiles).map((file, index) => (
                  <li key={index} className="file-list-item">
                    <div className="checkbox-container">
                      <input
                        type="checkbox"
                        checked={checkedIndices.includes(index)}
                        onChange={() => handleCheckFile(index)}
                      />
                    </div>
                    <span className="file-info">
                      {file.name} - {(file.size / (1024 * 1024)).toFixed(2)} MB
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Errors */}
          {error && <div className="error-message">{error}</div>}

          {/* Progress bar */}
          {uploading && (
            <div className="progress-bar">
              <div className="progress" style={{ width: `${progress}%` }}></div>
              <span className="progress-text">{progress}%</span>
            </div>
          )}

          {/* Success message */}
          {uploadComplete && (
            <div className="success-message">
              <span className="success-icon">✔</span>
              Upload initiated successfully!
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FileUpload;
