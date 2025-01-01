// File: FileList.jsx
import React, { useState, useEffect } from "react";
import Modal from "react-modal";
import { FaTimes, FaPlay, FaEye, FaEyeSlash } from "react-icons/fa";
import EncryptedVideoPlayer from "./EncryptedVideoPlayer";
import "./FileGallery.css";

Modal.setAppElement("#root");

const PAGE_SIZE = 10; // 10 files per page

const FileList = ({ axiosInstance }) => {
  // Data & Pagination
  const [allFiles, setAllFiles] = useState([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  // Loading states
  const [loading, setLoading] = useState(true);          // For initial or subsequent fetch
  const [loadingThumbnails, setLoadingThumbnails] = useState(false); // For images on a page
  const [mediaRemaining, setMediaRemaining] = useState(0); // How many images/videos left to load?

  // Errors
  const [error, setError] = useState("");

  // Modal
  const [modalIsOpen, setModalIsOpen] = useState(false);
  const [activeFile, setActiveFile] = useState(null);

  // Eye toggle (frosted/unfrosted)
  const [thumbnailsVisible, setThumbnailsVisible] = useState(true);

  // Current “slice” for the shown page (page+1) * PAGE_SIZE
  const currentPageFiles = allFiles.slice(0, (page + 1) * PAGE_SIZE);

  // ==========================
  // FETCH PAGINATED FILES
  // ==========================
  const fetchFiles = async (pageIndex) => {
    setLoading(true);
    try {
      // If your backend supports offset & limit
      const offset = pageIndex * PAGE_SIZE;
      const limit = PAGE_SIZE;
      const res = await axiosInstance.get(`/files?offset=${offset}&limit=${limit}`);
      const newPageFiles = res.data;

      if (newPageFiles.length < PAGE_SIZE) {
        setHasMore(false);
      }
      setAllFiles((prev) => [...prev, ...newPageFiles]);
    } catch (err) {
      console.error("Failed to fetch files:", err);
      setError("Failed to load files.");
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  };

  // Initial load (page 0)
  useEffect(() => {
    fetchFiles(0);
    // eslint-disable-next-line
  }, [axiosInstance]);

  // When page changes, fetch next chunk
  useEffect(() => {
    if (page > 0) {
      fetchFiles(page);
    }
    // eslint-disable-next-line
  }, [page]);

  // ==========================
  // THUMBNAIL LOADING LOGIC
  // ==========================
  useEffect(() => {
    if (currentPageFiles.length === 0) {
      // No files => no spinner needed
      setLoadingThumbnails(false);
      setMediaRemaining(0);
      return;
    }

    // Filter out only the items that are images or videos => those produce thumbnails
    const mediaItems = currentPageFiles.filter(
      (f) => f.mimetype.startsWith("image/") || f.mimetype.startsWith("video/")
    );

    if (mediaItems.length === 0) {
      // If no images/videos, no spinner
      setLoadingThumbnails(false);
      setMediaRemaining(0);
    } else {
      // We have N media items => they each must load (or error)
      setLoadingThumbnails(true);
      setMediaRemaining(mediaItems.length);
    }
  }, [currentPageFiles]);

  const handleThumbnailLoad = () => {
    // Each successful or error load => decrement
    setMediaRemaining((prev) => {
      const newVal = prev - 1;
      if (newVal <= 0) {
        // All done => hide spinner
        setLoadingThumbnails(false);
        return 0;
      }
      return newVal;
    });
  };

  // ==========================
  // EYE (VISIBILITY) TOGGLE
  // ==========================
  const toggleVisibility = () => {
    setThumbnailsVisible((prev) => !prev);
  };

  // ==========================
  // MODAL FUNCTIONS
  // ==========================
  const openModal = (file) => {
    setActiveFile(file);
    setModalIsOpen(true);
  };
  const closeModal = () => {
    setActiveFile(null);
    setModalIsOpen(false);
  };

  // ==========================
  // RENDER LOGIC
  // ==========================
  // If loading first page => big spinner
  if (loading && page === 0) {
    return <div className="loader-container">Loading files...</div>;
  }
  if (error) {
    return <div className="error-message">{error}</div>;
  }
  if (!allFiles || allFiles.length === 0) {
    return <div className="empty-gallery">No files in vault. Upload some!</div>;
  }

  return (
    <div className="gallery-container">
      {/* Eye Toggle */}
      <div className="eye-toggle-container">
        <button className="eye-toggle-btn" onClick={toggleVisibility}>
          {thumbnailsVisible ? <FaEyeSlash /> : <FaEye />}
          {thumbnailsVisible ? " Hide" : " Show"}
        </button>
      </div>

      {/* Spinner while thumbnails loading */}
      {/* {loadingThumbnails && (
        <div className="thumbnails-loader">Loading Thumbnails...</div>
      )} */}

      <div className="gallery">
        {currentPageFiles.map((file) => {
          const isImage = file.mimetype.startsWith("image/");
          const isVideo = file.mimetype.startsWith("video/");

          // Build the correct URL
          const baseUrl = import.meta.env.VITE_BASE_URL
          const previewUrl = isVideo
            ? `${baseUrl}/thumbnail/${file.id}`
            : `${baseUrl}/image/${file.id}`;

          const itemClass = thumbnailsVisible ? "gallery-item" : "gallery-item frosted";

          return (
            <div
              key={file.id}
              className={itemClass}
              onClick={() => openModal(file)}
              onKeyPress={(e) => e.key === "Enter" && openModal(file)}
              tabIndex={0}
              role="button"
            >
              {isImage ? (
                <img
                  src={previewUrl}
                  alt={file.filename}
                  className="gallery-media"
                  onLoad={handleThumbnailLoad}
                  onError={handleThumbnailLoad}
                />
              ) : isVideo ? (
                <div className="video-thumbnail">
                  <img
                    src={previewUrl}
                    alt={file.filename}
                    className="gallery-media"
                    onLoad={handleThumbnailLoad}
                    onError={handleThumbnailLoad}
                  />
                  <FaPlay className="play-icon" size={30} />
                </div>
              ) : (
                // Non-media => no onLoad needed
                <div className="unsupported-file">
                  <p>Unknown file type: {file.filename}</p>
                </div>
              )}

              <div className="overlay">
                <span className="filename">{file.filename}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* "See More" */}
      {hasMore && !loading && (
        <div className="see-more-container">
          <button className="see-more-btn" onClick={() => setPage(page + 1)}>
            See More
          </button>
        </div>
      )}

      {/* Modal */}
      <Modal
        isOpen={modalIsOpen}
        onRequestClose={closeModal}
        className="modal"
        overlayClassName="overlay-modal"
      >
        <button onClick={closeModal} className="close-button">
          <FaTimes />
        </button>

        {activeFile?.mimetype.startsWith("video/") ? (
          <EncryptedVideoPlayer file={activeFile} axiosInstance={axiosInstance} />
        ) : activeFile?.mimetype.startsWith("image/") ? (
          <img
            src={`${import.meta.env.VITE_BASE_URL}/image/${activeFile.id}`}
            alt={activeFile.filename}
            className="modal-media"
          />
        ) : (
          <div className="unsupported-file">
            <p>Unsupported file type: {activeFile?.filename}</p>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default FileList;
