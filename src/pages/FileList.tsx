import React, { useState, useEffect } from "react";
import Modal from "react-modal";
import type { AxiosInstance } from "axios";
import { FaTimes, FaPlay, FaEye, FaEyeSlash } from "react-icons/fa";
import EncryptedVideoPlayer from "./EncryptedVideoPlayer";
import "./FileGallery.css";

Modal.setAppElement("#root");

const PAGE_SIZE = 10;

type FileItem = {
  id: string | number;
  filename: string;
  mimetype: string;
};

type FileListProps = {
  axiosInstance: AxiosInstance;
};

const FileList: React.FC<FileListProps> = ({ axiosInstance }) => {
  const [allFiles, setAllFiles] = useState<FileItem[]>([]);
  const [page, setPage] = useState<number>(0);
  const [hasMore, setHasMore] = useState<boolean>(true);

  const [loading, setLoading] = useState<boolean>(true);
  const [loadingThumbnails, setLoadingThumbnails] = useState<boolean>(false);
  const [mediaRemaining, setMediaRemaining] = useState<number>(0);

  const [error, setError] = useState<string>("");

  const [modalIsOpen, setModalIsOpen] = useState<boolean>(false);
  const [activeFile, setActiveFile] = useState<FileItem | null>(null);

  const [thumbnailsVisible, setThumbnailsVisible] = useState<boolean>(true);

  const currentPageFiles = allFiles.slice(0, (page + 1) * PAGE_SIZE);

  const fetchFiles = async (pageIndex: number): Promise<void> => {
    setLoading(true);
    try {
      const offset = pageIndex * PAGE_SIZE;
      const limit = PAGE_SIZE;
      const res = await axiosInstance.get<FileItem[]>(
        `/files?offset=${offset}&limit=${limit}`
      );
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

  useEffect(() => {
    fetchFiles(0);
  }, [axiosInstance]);

  useEffect(() => {
    if (page > 0) {
      fetchFiles(page);
    }
  }, [page]);

  useEffect(() => {
    if (currentPageFiles.length === 0) {
      setLoadingThumbnails(false);
      setMediaRemaining(0);
      return;
    }

    const mediaItems = currentPageFiles.filter(
      (f) => f.mimetype.startsWith("image/") || f.mimetype.startsWith("video/")
    );

    if (mediaItems.length === 0) {
      setLoadingThumbnails(false);
      setMediaRemaining(0);
    } else {
      setLoadingThumbnails(true);
      setMediaRemaining(mediaItems.length);
    }
  }, [currentPageFiles]);

  const handleThumbnailLoad = (): void => {
    setMediaRemaining((prev) => {
      const newVal = prev - 1;
      if (newVal <= 0) {
        setLoadingThumbnails(false);
        return 0;
      }
      return newVal;
    });
  };

  const toggleVisibility = (): void => {
    setThumbnailsVisible((prev) => !prev);
  };

  const openModal = (file: FileItem): void => {
    setActiveFile(file);
    setModalIsOpen(true);
  };
  const closeModal = (): void => {
    setActiveFile(null);
    setModalIsOpen(false);
  };

  if (loading && page === 0) {
    return <div className="loader-container">Loading files...</div>;
  }
  if (error) {
    return <div className="error-message">{error}</div>;
  }
  if (!allFiles || allFiles.length === 0) {
    return <div className="empty-gallery">No files in vault. Upload some!</div>;
  }

  const baseUrl = (import.meta as any).env.VITE_BASE_URL as string;

  return (
    <div className="gallery-container">
      <div className="eye-toggle-container">
        <button className="eye-toggle-btn" onClick={toggleVisibility}>
          {thumbnailsVisible ? <FaEyeSlash /> : <FaEye />}
          {thumbnailsVisible ? " Hide" : " Show"}
        </button>
      </div>

      <div className="gallery">
        {currentPageFiles.map((file) => {
          const isImage = file.mimetype.startsWith("image/");
          const isVideo = file.mimetype.startsWith("video/");

          const previewUrl = isVideo
            ? `${baseUrl}/thumbnail/${file.id}`
            : `${baseUrl}/image/${file.id}`;

          const itemClass = thumbnailsVisible
            ? "gallery-item"
            : "gallery-item frosted";

          return (
            <div
              key={file.id}
              className={itemClass}
              onClick={() => openModal(file)}
              onKeyPress={(e: React.KeyboardEvent<HTMLDivElement>) =>
                e.key === "Enter" && openModal(file)
              }
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

      {hasMore && !loading && (
        <div className="see-more-container">
          <button className="see-more-btn" onClick={() => setPage(page + 1)}>
            See More
          </button>
        </div>
      )}

      <Modal
        isOpen={modalIsOpen}
        onRequestClose={closeModal}
        className="modal"
        overlayClassName="overlay-modal"
      >
        <button onClick={closeModal} className="close-button">
          <FaTimes />
        </button>

        {activeFile?.mimetype?.startsWith("video/") ? (
          <EncryptedVideoPlayer
            file={activeFile}
            axiosInstance={axiosInstance}
          />
        ) : activeFile?.mimetype?.startsWith("image/") ? (
          <img
            src={`${baseUrl}/image/${activeFile.id}`}
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
