// FileList.jsx
import React, { useEffect, useState } from "react";
import axios from "axios";

const FileList = ({ axiosInstance }) => {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFiles = async () => {
      try {
        const response = await axiosInstance.get("/files"); // Implement this endpoint to list files
        setFiles(response.data.files);
      } catch (error) {
        console.error("Error fetching files:", error);
        alert("Failed to fetch files.");
      } finally {
        setLoading(false);
      }
    };

    fetchFiles();
  }, [axiosInstance]);

  if (loading) {
    return <div>Loading files...</div>;
  }

  if (files.length === 0) {
    return <div>No files uploaded yet.</div>;
  }

  return (
    <div>
      <h2>Your Files</h2>
      <ul>
        {files.map((file) => (
          <li key={file.id}>
            {file.filename} - {file.mimetype} - {file.size} bytes
            <a href={`/api/files/${file.id}`} download={file.filename}>
              Download
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default FileList;
