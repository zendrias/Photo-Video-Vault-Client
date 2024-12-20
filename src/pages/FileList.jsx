// src/components/FileGallery.jsx

import React, { useEffect, useState } from "react";
import Modal from "react-modal";
import { FaTimes, FaPlay } from "react-icons/fa";
import "./FileGallery.css"; // Ensure this path matches your project structure

// Bind modal to your appElement (for accessibility)
// Replace '#root' with the actual ID of your root element if different
Modal.setAppElement("#root");

const FileGallery = ({ axiosInstance }) => {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalIsOpen, setModalIsOpen] = useState(false);
  const [activeFile, setActiveFile] = useState(null);

  // Backend URL from environment variables
  const backendURL = import.meta.env.VITE_BASE_URL || "https://localhost:3443";

  useEffect(() => {
    const fetchFiles = async () => {
      try {
        const response = await axiosInstance.get("/files", {
          withCredentials: true,
        });
        setFiles(response.data.files);
      } catch (err) {
        console.error("Error fetching files:", err);
        setError("Failed to fetch files. Please try again.");
      } finally {
        setLoading(false);
      }
    };
    fetchFiles();
  }, [axiosInstance]);

  const openModal = (file) => {
    setActiveFile(file);
    setModalIsOpen(true);
  };

  const closeModal = () => {
    setActiveFile(null);
    setModalIsOpen(false);
  };

  if (loading)
    return (
      <div className="loader-container">
        <div className="loader"></div>
        <p>Loading your gallery...</p>
      </div>
    );

  if (error)
    return (
      <div className="error-message">
        <p>{error}</p>
      </div>
    );

  if (files.length === 0)
    return (
      <div className="empty-gallery">
        <p>Your gallery is empty. Upload some files!</p>
      </div>
    );

  return (
    <div className="gallery-container">
      {/* <h2>Your Vault is Unlocked 🔓</h2> */}
      <div className="gallery">
        {files.map((file) => (
          <div
            key={file.id}
            className="gallery-item"
            onClick={() => openModal(file)}
            role="button"
            tabIndex={0}
            onKeyPress={(e) => {
              if (e.key === "Enter") openModal(file);
            }}
            aria-label={`Open ${file.filename}`}
          >
            {file.mimetype.startsWith("image/") ? (
              <img
                src={file.content}
                alt={file.filename}
                className="gallery-media"
                loading="lazy"
              />
            ) : file.mimetype.startsWith("video/") ? (
              <div className="video-thumbnail">
                <video
                  className="gallery-media"
                  muted
                  loop
                  crossOrigin="use-credentials"
                >
                  <source
                    src={`${backendURL}/files/${file.id}/stream`}
                    type={file.mimetype}
                  />
                  Your browser does not support the video tag.
                </video>
                <div className="play-icon">
                  <FaPlay />
                </div>
              </div>
            ) : (
              <div className="unsupported-file">
                <p>Unsupported file type: {file.mimetype}</p>
              </div>
            )}
            <div className="overlay">
              <p className="filename">{file.filename}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Modal for Viewing Files */}
      <Modal
        isOpen={modalIsOpen}
        onRequestClose={closeModal}
        contentLabel="File Viewer"
        className="modal"
        overlayClassName="overlay-modal"
        shouldCloseOnOverlayClick={true}
        shouldCloseOnEsc={true}
      >
        <button
          onClick={closeModal}
          className="close-button"
          aria-label="Close Modal"
        >
          <FaTimes size={24} />
        </button>
        {activeFile && activeFile.mimetype.startsWith("image/") ? (
          <img
            src={activeFile.content}
            alt={activeFile.filename}
            className="modal-media"
          />
        ) : activeFile && activeFile.mimetype.startsWith("video/") ? (
          <video
            controls
            crossOrigin="use-credentials"
            className="modal-media"
            muted
            loop
            preload="metadata"
          >
            <source
              src={`${backendURL}/files/${activeFile.id}/stream`}
              type={activeFile.mimetype}
            />
            Your browser does not support the video tag.
          </video>
        ) : null}
      </Modal>
    </div>
  );
};

export default FileGallery;
