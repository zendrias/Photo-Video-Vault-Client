import React, { useEffect, useState } from "react";
import axios from "axios";

const FileGallery = ({ axiosInstance }) => {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Replace with your actual backend URL if different from frontend domain
  const backendURL = import.meta.env.VITE_BASE_URL; // e.g. "https://localhost:3443"

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

  if (loading) return <div>Loading your gallery...</div>;
  if (error) return <div>{error}</div>;
  if (files.length === 0)
    return <div>Your gallery is empty. Upload some files!</div>;

  return (
    <div>
      <h2>Your Photo and Video Gallery</h2>
      <div className="gallery">
        {files.map((file, index) => (
          <div key={file.id} className="gallery-item">
            {file.mimetype.startsWith("image/") ? (
              <img src={file.content} alt={file.filename} />
            ) : file.mimetype.startsWith("video/") ? (
              <video controls crossOrigin="use-credentials">
                <source
                  src={`${backendURL}/files/${file.id}/stream`}
                  type={file.mimetype}
                />
                Your browser does not support the video tag.
              </video>
            ) : (
              <p>Unsupported file type: {file.mimetype}</p>
            )}
            <p>{file.filename}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FileGallery;
