import React, { useState, useRef } from "react";
import "./FileUpload.css";
import type { AxiosInstance, AxiosProgressEvent, AxiosResponse } from "axios";

type FileUploadProps = {
  axiosInstance: AxiosInstance;
};

type UploadResponse = {
  jobIds?: string[];
};

const FileUpload: React.FC<FileUploadProps> = ({ axiosInstance }) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedFiles, setSelectedFiles] = useState<FileList>(
    new DataTransfer().files
  );
  const [checkedIndices, setCheckedIndices] = useState<number[]>([]);

  const [uploading, setUploading] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [jobIds, setJobIds] = useState<string[]>([]);
  const [uploadComplete, setUploadComplete] = useState<boolean>(false);

  const [isDragging, setIsDragging] = useState<boolean>(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fl = e.target.files ?? new DataTransfer().files;
    setSelectedFiles(fl);
    setCheckedIndices([]);
    setError(null);
    setUploadComplete(false);
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
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

  const handleCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.tagName.toLowerCase() === "button") return;
    fileInputRef.current?.click();
  };

  const handleCheckFile = (index: number) => {
    setCheckedIndices((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  const allFilesSelected =
    selectedFiles.length > 0 && checkedIndices.length === selectedFiles.length;

  const handleCheckAll = () => {
    if (allFilesSelected) {
      setCheckedIndices([]);
    } else {
      const indices = Array.from(
        { length: selectedFiles.length },
        (_, idx) => idx
      );
      setCheckedIndices(indices);
    }
  };

  const handleRemoveSelected = () => {
    if (checkedIndices.length === 0) return;

    const filesArr = Array.from(selectedFiles);
    const filtered = filesArr.filter((_, idx) => !checkedIndices.includes(idx));

    const dt = new DataTransfer();
    filtered.forEach((f) => dt.items.add(f));
    setSelectedFiles(dt.files);
    setCheckedIndices([]);
  };

  const handleUpload = async () => {
    setError(null);
    setUploadComplete(false);

    if (selectedFiles.length === 0) {
      setError("Please select at least one file to upload.");
      return;
    }

    setUploading(true);
    setProgress(0);

    try {
      const formData = new FormData();
      formData.append("encryptedAesKey", "SERVER_SIDE_ENCRYPTION");

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles.item(i);
        if (file) formData.append("files", file, file.name);
      }

      const response = await axiosInstance.post<
        UploadResponse,
        AxiosResponse<UploadResponse>
      >("/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (progressEvent: AxiosProgressEvent) => {
          const total = progressEvent.total ?? 0;
          if (total > 0) {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / total
            );
            setProgress(percentCompleted);
          }
        },
      });

      if (response.data?.jobIds) {
        setJobIds(response.data.jobIds);
      }

      setUploadComplete(true);
      setSelectedFiles(new DataTransfer().files);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      console.error("Error uploading files:", err);
      setError("File upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="file-upload-container">
      <div className="top-controls">
        <button
          onClick={handleUpload}
          disabled={uploading || selectedFiles.length === 0}
          className="upload-button-top"
        >
          {uploading ? "Uploading..." : "Upload"}
        </button>
      </div>

      <div
        className={`upload-card ${isDragging ? "drag-over" : ""}`}
        onClick={handleCardClick}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="upload-form">
          <input
            id="file-input"
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileChange}
            className="file-input"
          />

          <label htmlFor="file-input" className="file-label">
            <span className="file-label-icon">📂</span>
            <span className="file-label-text">
              {isDragging ? "Drop files here" : "Click / Drag & Drop files"}
            </span>
          </label>

          {selectedFiles.length > 0 && (
            <div className="selected-files">
              <div className="file-list-header">
                <h4>Selected Files:</h4>

                <div className="file-list-actions">
                  <div className="checkbox-container">
                    <input
                      type="checkbox"
                      checked={allFilesSelected}
                      onChange={handleCheckAll}
                    />
                  </div>
                  {checkedIndices.length > 0 && (
                    <button
                      className="remove-button"
                      onClick={handleRemoveSelected}
                    >
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
        </div>
      </div>
    </div>
  );
};

export default FileUpload;
