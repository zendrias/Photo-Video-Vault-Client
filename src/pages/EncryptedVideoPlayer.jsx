import React, { useEffect, useRef, useState, useCallback } from "react";

/**
 * Usage:
 *   <EncryptedVideoPlayer file={someFileObject} axiosInstance={apiClient} />
 *
 * Changes:
 *   1) We only append the init segments + first media segments initially.
 *   2) Then we load the rest in a "background" loop so the user sees typical streaming behavior.
 *   3) We optionally skip calling endOfStream() until we truly have appended all segments.
 */
export default function EncryptedVideoPlayer({ file, axiosInstance }) {
  const videoRef = useRef(null);
  const mediaSourceRef = useRef(null);

  // For ensuring we only create buffers once
  const [buffersCreated, setBuffersCreated] = useState(false);

  const [manifest, setManifest] = useState(null);
  const [mpdXML, setMpdXML] = useState(null); // optional debug
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // 1) Load manifest
  useEffect(() => {
    if (!file) return;
    let cancel = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const resp = await axiosInstance.get(`/videos/${file.id}/manifest`);
        if (!cancel) setManifest(resp.data);
      } catch (err) {
        console.error("Manifest load error:", err);
        if (!cancel) setError("Failed to load manifest");
      } finally {
        if (!cancel) setLoading(false);
      }
    };
    load();

    return () => {
      cancel = true;
    };
  }, [file, axiosInstance]);

  // 2) (Optional) load raw MPD XML
  useEffect(() => {
    if (!manifest || !file) return;
    let cancel = false;

    const loadMPD = async () => {
      try {
        const resp = await axiosInstance.get(`/videos/${file.id}/mpd`, {
          responseType: "text",
        });
        if (!cancel) setMpdXML(resp.data);
      } catch (err) {
        console.warn("MPD load error (non-critical):", err);
      }
    };
    loadMPD();

    return () => {
      cancel = true;
    };
  }, [manifest, file, axiosInstance]);

  // 3) Create a single MediaSource if not already
  useEffect(() => {
    if (!manifest) return;
    if (!videoRef.current) return;

    if (!mediaSourceRef.current) {
      const ms = new MediaSource();
      mediaSourceRef.current = ms;
      videoRef.current.src = URL.createObjectURL(ms);
      console.log("[EncryptedVideoPlayer] Created new MediaSource");
    }
  }, [manifest]);

  // 4) On "sourceopen", create buffers + do partial appending
  useEffect(() => {
    const ms = mediaSourceRef.current;
    if (!ms || !manifest) return;

    if (buffersCreated) return; // skip if buffers are already created

    function handleSourceOpen() {
      if (ms.readyState !== "open") {
        console.warn("MediaSource not open even though sourceopen fired");
        return;
      }
      console.log(
        "[EncryptedVideoPlayer] MS is open; creating SourceBuffers..."
      );

      setBuffersCreated(true);

      const videoMime = 'video/mp4; codecs="avc1.640028"';
      const audioMime = 'audio/mp4; codecs="mp4a.40.5"';
      let videoBuffer, audioBuffer;
      try {
        videoBuffer = ms.addSourceBuffer(videoMime);
        audioBuffer = ms.addSourceBuffer(audioMime);
      } catch (err) {
        console.error("SourceBuffer creation error:", err);
        return;
      }

      // 4a) Append init segments + first 1–2 media segments => allow immediate playback
      appendInitialSegments(
        ms,
        manifest,
        videoBuffer,
        audioBuffer,
        file.id,
        axiosInstance
      ).catch((err) => console.error("appendInitialSegments error:", err));
    }

    ms.addEventListener("sourceopen", handleSourceOpen);
    return () => ms.removeEventListener("sourceopen", handleSourceOpen);
  }, [manifest, file, axiosInstance, buffersCreated]);

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {loading && <div style={{ color: "gray" }}>Loading manifest…</div>}
      {error && <div style={{ color: "red" }}>{error}</div>}
      <video
        ref={videoRef}
        controls
        autoPlay
        style={{
          width: "100%",
          maxHeight: "70vh",
          backgroundColor: "#000",
          border: "1px solid #ccc",
        }}
      />
      {mpdXML && (
        <div style={{ marginTop: 16, background: "#f5f5f5", padding: 10 }}>
          <h4>MPD XML Debug:</h4>
          <pre style={{ whiteSpace: "pre-wrap" }}>{mpdXML}</pre>
        </div>
      )}
    </div>
  );
}

/**
 * Append just enough data to start playback, then load the rest in background.
 */
async function appendInitialSegments(
  mediaSource,
  manifest,
  videoBuffer,
  audioBuffer,
  fileId,
  axiosInstance
) {
  // 1) Append init segments
  if (manifest.initSegmentVideo) {
    const initVidData = await fetchSegment(
      axiosInstance,
      fileId,
      manifest.initSegmentVideo.filename
    );
    await appendBufferAsync(videoBuffer, initVidData);
  }
  if (manifest.initSegmentAudio) {
    const initAudData = await fetchSegment(
      axiosInstance,
      fileId,
      manifest.initSegmentAudio.filename
    );
    await appendBufferAsync(audioBuffer, initAudData);
  }

  // 2) Append first segment(s) => e.g. first 1 or 2 from each track
  const firstVideoSegments = (manifest.segmentsVideo || []).slice(0, 2);
  for (const seg of firstVideoSegments) {
    if (mediaSource.readyState !== "open") break;
    const segData = await fetchSegment(axiosInstance, fileId, seg.filename);
    await appendBufferAsync(videoBuffer, segData);
  }

  const firstAudioSegments = (manifest.segmentsAudio || []).slice(0, 2);
  for (const seg of firstAudioSegments) {
    if (mediaSource.readyState !== "open") break;
    const segData = await fetchSegment(axiosInstance, fileId, seg.filename);
    await appendBufferAsync(audioBuffer, segData);
  }

  console.log(
    "[EncryptedVideoPlayer] Appended first few segments. Let the video play..."
  );

  // 3) Optionally set known duration
  if (
    typeof manifest.durationSec === "number" &&
    !Number.isNaN(manifest.durationSec)
  ) {
    try {
      mediaSource.duration = manifest.durationSec;
    } catch (err) {
      console.warn("Error setting duration:", err);
    }
  }

  // 4) Now do the rest in the background
  //    We'll do a short delay so playback can start. Then append all remaining.
  setTimeout(() => {
    console.log(
      "[EncryptedVideoPlayer] Background loading remaining segments..."
    );
    appendRemainingSegments(
      mediaSource,
      manifest,
      videoBuffer,
      audioBuffer,
      fileId,
      axiosInstance
    );
  }, 500); // half-second delay for demonstration
}

/**
 * Appends all the remaining segments in the background.
 * We'll do it sequentially to avoid overlapping SourceBuffer updates.
 * Once done, optionally call endOfStream().
 */
async function appendRemainingSegments(
  mediaSource,
  manifest,
  videoBuffer,
  audioBuffer,
  fileId,
  axiosInstance
) {
  try {
    // Start from the third segment onward
    const remainingVideo = (manifest.segmentsVideo || []).slice(2);
    for (const seg of remainingVideo) {
      if (mediaSource.readyState !== "open") break;
      const segData = await fetchSegment(axiosInstance, fileId, seg.filename);
      await appendBufferAsync(videoBuffer, segData);
    }

    const remainingAudio = (manifest.segmentsAudio || []).slice(2);
    for (const seg of remainingAudio) {
      if (mediaSource.readyState !== "open") break;
      const segData = await fetchSegment(axiosInstance, fileId, seg.filename);
      await appendBufferAsync(audioBuffer, segData);
    }

    // endOfStream once fully appended
    if (mediaSource.readyState === "open") {
      mediaSource.endOfStream();
      console.log(
        "[EncryptedVideoPlayer] endOfStream called after full append."
      );
    }
  } catch (err) {
    console.error("Error in background segment appending:", err);
  }
}

/** Utility to fetch a single .m4s from your server => returns Uint8Array. */
async function fetchSegment(axiosInstance, fileId, segFilename) {
  const resp = await axiosInstance.get(
    `/videos/${fileId}/segment/${segFilename}`,
    {
      responseType: "arraybuffer",
    }
  );
  return new Uint8Array(resp.data);
}

/**
 * Utility => waits for 'updateend' on the SourceBuffer before resolving.
 */
function appendBufferAsync(sourceBuffer, data) {
  return new Promise((resolve, reject) => {
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
