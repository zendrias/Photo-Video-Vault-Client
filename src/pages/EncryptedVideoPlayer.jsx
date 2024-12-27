// File: EncryptedVideoPlayer.jsx
import React, { useEffect, useRef, useState } from "react";

/**
 * Usage:
 *   <EncryptedVideoPlayer file={selectedFile} axiosInstance={apiClient} />
 *
 * This attempts to:
 *   1) Load the JSON manifest => { dashMPD, initSegmentVideo, initSegmentAudio, segmentsVideo, segmentsAudio }
 *   2) Optionally fetch the MPD XML just for debugging
 *   3) Create a MediaSource with two SourceBuffers: one for video, one for audio
 *   4) Append init segments + each media segment
 *   5) Mark the stream ended
 */
const EncryptedVideoPlayer = ({ file, axiosInstance }) => {
  const videoRef = useRef(null);

  const [mediaSource, setMediaSource] = useState(null);
  const [videoSourceBuffer, setVideoSourceBuffer] = useState(null);
  const [audioSourceBuffer, setAudioSourceBuffer] = useState(null);

  const [manifest, setManifest] = useState(null);
  const [mpdXML, setMpdXML] = useState(null); // optional, for debugging
  const [loading, setLoading] = useState(false); // basic "loading" state
  const [error, setError] = useState(null);

  // 1) Fetch JSON manifest
  useEffect(() => {
    if (!file) return;

    const loadManifest = async () => {
      setLoading(true);
      setError(null);
      try {
        const resp = await axiosInstance.get(`/videos/${file.id}/manifest`);
        setManifest(resp.data);
      } catch (err) {
        console.error("Failed to load manifest:", err);
        setError("Failed to load manifest");
      } finally {
        setLoading(false);
      }
    };

    loadManifest();
  }, [file, axiosInstance]);

  // 2) (Optional) fetch raw MPD XML for debugging
  useEffect(() => {
    if (!manifest || !file) return;

    const fetchMPD = async () => {
      try {
        const resp = await axiosInstance.get(`/videos/${file.id}/mpd`, {
          responseType: "text",
        });
        setMpdXML(resp.data);
      } catch (err) {
        console.error("Failed to load MPD XML:", err);
        // We won't treat this as a critical error; it's just for debugging.
      }
    };

    fetchMPD();
  }, [manifest, file, axiosInstance]);

  // 3) Setup MediaSource => create 2 SourceBuffers for video + audio
  useEffect(() => {
    if (!manifest) return;
    if (!videoRef.current) return;

    const ms = new MediaSource();
    setMediaSource(ms);

    // Listen for when the MediaSource is ready to accept SourceBuffers
    const onSourceOpen = () => {
      try {
        // For H.264 / AAC:
        // Example: 'video/mp4; codecs="avc1.640028"' and 'audio/mp4; codecs="mp4a.40.5"'
        const mimeVideo = 'video/mp4; codecs="avc1.640028"';
        const mimeAudio = 'audio/mp4; codecs="mp4a.40.5"';

        const vsb = ms.addSourceBuffer(mimeVideo);
        const asb = ms.addSourceBuffer(mimeAudio);

        setVideoSourceBuffer(vsb);
        setAudioSourceBuffer(asb);
      } catch (err) {
        console.error("Error creating SourceBuffers:", err);
      }
    };

    ms.addEventListener("sourceopen", onSourceOpen);

    // Assign object URL to the <video> element
    videoRef.current.src = URL.createObjectURL(ms);

    return () => {
      ms.removeEventListener("sourceopen", onSourceOpen);
    };
  }, [manifest]);

  // 4) Once we have 2 SourceBuffers => load init + media segments
  useEffect(() => {
    if (!manifest || !mediaSource) return;
    if (!videoSourceBuffer || !audioSourceBuffer) return;

    let canceled = false;

    // Helper to fetch a segment from your server
    const fetchSegment = async (filename) => {
      if (canceled) return null;
      try {
        const resp = await axiosInstance.get(
          `/videos/${file.id}/segment/${filename}`,
          { responseType: "arraybuffer" }
        );
        if (canceled) return null;
        return new Uint8Array(resp.data);
      } catch (err) {
        console.error("Segment fetch error =>", filename, err);
        return null;
      }
    };

    const loadAllSegments = async () => {
      if (mediaSource.readyState !== "open") {
        console.warn("MediaSource not open at start; aborting load.");
        return;
      }

      // ---- VIDEO track
      if (!manifest.initSegmentVideo) {
        console.error("Missing initSegmentVideo in manifest!");
      } else {
        // 4a) Video init
        const initVidData = await fetchSegment(
          manifest.initSegmentVideo.filename
        );
        if (initVidData) {
          try {
            await appendBufferAsync(videoSourceBuffer, initVidData);
          } catch (err) {
            console.error("Video init append error:", err);
            return;
          }
        }
        // 4b) Video media segments
        for (const seg of manifest.segmentsVideo || []) {
          if (canceled || mediaSource.readyState !== "open") break;
          const segData = await fetchSegment(seg.filename);
          if (!segData) break;
          try {
            await appendBufferAsync(videoSourceBuffer, segData);
          } catch (err) {
            console.error("Video seg append error =>", seg.filename, err);
            break;
          }
        }
      }

      // ---- AUDIO track
      if (!manifest.initSegmentAudio) {
        console.error("Missing initSegmentAudio in manifest!");
      } else {
        // 4c) Audio init
        const initAudData = await fetchSegment(
          manifest.initSegmentAudio.filename
        );
        if (initAudData) {
          try {
            await appendBufferAsync(audioSourceBuffer, initAudData);
          } catch (err) {
            console.error("Audio init append error:", err);
            return;
          }
        }
        // 4d) Audio media segments
        for (const seg of manifest.segmentsAudio || []) {
          if (canceled || mediaSource.readyState !== "open") break;
          const segData = await fetchSegment(seg.filename);
          if (!segData) break;
          try {
            await appendBufferAsync(audioSourceBuffer, segData);
          } catch (err) {
            console.error("Audio seg append error =>", seg.filename, err);
            break;
          }
        }
      }

      // 4e) Once we've appended everything, let the browser know the stream is done
      // This also helps the browser figure out the total duration for seeking, etc.
      if (!canceled) {
        try {
          if (mediaSource.readyState === "open") {
            mediaSource.endOfStream();
            // Optionally set mediaSource.duration to a known length (if you have it),
            // e.g. `mediaSource.duration = totalDurationInSeconds;`
          }
        } catch (err) {
          console.warn("Error calling endOfStream:", err);
        }
      }
    };

    loadAllSegments();

    return () => {
      canceled = true;
    };
  }, [
    manifest,
    mediaSource,
    videoSourceBuffer,
    audioSourceBuffer,
    file,
    axiosInstance,
  ]);

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {loading && (
        <div style={{ color: "gray", marginBottom: 10 }}>Loading manifest…</div>
      )}
      {error && <div style={{ color: "red" }}>{error}</div>}
      <video
        ref={videoRef}
        controls
        autoPlay
        muted
        style={{
          width: "100%",
          maxHeight: "70vh",
          backgroundColor: "#000",
          border: "1px solid #ccc",
        }}
      />
      {mpdXML && (
        <div style={{ marginTop: 16, background: "#f5f5f5", padding: 10 }}>
          <h4>Debug MPD XML:</h4>
          <pre style={{ whiteSpace: "pre-wrap" }}>{mpdXML}</pre>
        </div>
      )}
    </div>
  );
};

export default EncryptedVideoPlayer;

/**
 * Helper to append data to a SourceBuffer. Returns a Promise so we can
 * sequentially load segments without race conditions.
 */
function appendBufferAsync(sourceBuffer, data) {
  return new Promise((resolve, reject) => {
    if (!sourceBuffer) {
      return reject(new Error("No sourceBuffer available"));
    }

    const onUpdateEnd = () => {
      sourceBuffer.removeEventListener("updateend", onUpdateEnd);
      sourceBuffer.removeEventListener("error", onError);
      resolve();
    };

    const onError = (e) => {
      sourceBuffer.removeEventListener("updateend", onUpdateEnd);
      sourceBuffer.removeEventListener("error", onError);
      reject(e || new Error("SourceBuffer error"));
    };

    sourceBuffer.addEventListener("updateend", onUpdateEnd);
    sourceBuffer.addEventListener("error", onError);

    try {
      sourceBuffer.appendBuffer(data);
    } catch (err) {
      sourceBuffer.removeEventListener("updateend", onUpdateEnd);
      sourceBuffer.removeEventListener("error", onError);
      reject(err);
    }
  });
}
