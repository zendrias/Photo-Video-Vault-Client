// File: FileList.jsx
import React, { useState, useEffect } from "react";
import Modal from "react-modal";
import { FaTimes, FaPlay } from "react-icons/fa";
import EncryptedVideoPlayer from "./EncryptedVideoPlayer";

Modal.setAppElement("#root");

const FileList = ({ axiosInstance }) => {
  const [files, setFiles] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [modalIsOpen, setModalIsOpen] = useState(false);
  const [activeFile, setActiveFile] = useState(null);

  useEffect(() => {
    const fetchFiles = async () => {
      try {
        const res = await axiosInstance.get("/files");
        setFiles(res.data);
      } catch (err) {
        console.error("Failed to fetch files:", err);
        setError("Failed to load files.");
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

  if (loading) return <div>Loading files...</div>;
  if (error) return <div style={{ color: "red" }}>{error}</div>;

  if (!files || files.length === 0) {
    return <div>No files in vault. Upload some!</div>;
  }

  return (
    <div className="file-list">
      <h2>Your Encrypted Files</h2>
      <div className="gallery">
        {files.map((file) => (
          <div
            key={file.id}
            className="gallery-item"
            onClick={() => openModal(file)}
            onKeyPress={(e) => e.key === "Enter" && openModal(file)}
            tabIndex={0}
            role="button"
          >
            {file.mimetype.startsWith("image/") ? (
              <div>
                <p>(Encrypted Image)</p>
                <p>{file.filename}</p>
              </div>
            ) : file.mimetype.startsWith("video/") ? (
              <div>
                <FaPlay size={30} />
                <p>{file.filename}</p>
              </div>
            ) : (
              <div>
                <p>Unknown: {file.filename}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      <Modal
        isOpen={modalIsOpen}
        onRequestClose={closeModal}
        className="modal"
        overlayClassName="overlay-modal"
      >
        <button onClick={closeModal} className="close-button">
          <FaTimes />
        </button>

        {activeFile?.mimetype.startsWith("video/") && (
          <EncryptedVideoPlayer
            file={activeFile}
            axiosInstance={axiosInstance}
          />
        )}
      </Modal>
    </div>
  );
};

export default FileList;
