import React, { useEffect, useRef, useState } from "react";

/**
 * Constants:
 */
const INITIAL_SEGMENTS_TO_APPEND = 4;
const MAX_BUFFER_BYTES_VIDEO = 100 * 1024 * 1024;
const MAX_BUFFER_BYTES_AUDIO = 50 * 1024 * 1024;
const LAZY_BUFFER_THRESHOLD_SEC = 10;

export default function EncryptedVideoPlayer({ file, axiosInstance }) {
  const videoRef = useRef(null);
  const mediaSourceRef = useRef(null);

  const [manifest, setManifest] = useState(null);
  const [error, setError] = useState(null);
  const [loadingManifest, setLoadingManifest] = useState(false);
  const [buffersCreated, setBuffersCreated] = useState(false);

  const [mpdXML, setMpdXML] = useState(null);

  // Ranges: each is { start, end, bytes }
  const videoRangesRef = useRef([]);
  const audioRangesRef = useRef([]);

  // Track how many segments we have appended so far:
  const [videoNextIndex, setVideoNextIndex] = useState(0);
  const [audioNextIndex, setAudioNextIndex] = useState(0);

  // Our SourceBuffer references
  const videoSBRef = useRef(null);
  const audioSBRef = useRef(null);

  // A guard to prevent multiple simultaneous fetch calls
  const fetchInProgressRef = useRef(false);

  /************************************************************
   * 1) Load the manifest
   ************************************************************/
  useEffect(() => {
    if (!file) return;
    let canceled = false;

    (async () => {
      setLoadingManifest(true);
      setError(null);
      console.log("[EncryptedVideoPlayer] Loading manifest...");

      try {
        const resp = await axiosInstance.get(`/videos/${file.id}/manifest`);
        if (!canceled) {
          console.log("[EncryptedVideoPlayer] Manifest loaded:", resp.data);
          setManifest(resp.data);
        }
      } catch (err) {
        console.error("[EncryptedVideoPlayer] Manifest load error:", err);
        if (!canceled) setError("Failed to load manifest");
      } finally {
        if (!canceled) setLoadingManifest(false);
      }
    })();

    return () => {
      canceled = true;
    };
  }, [file, axiosInstance]);

  /************************************************************
   * 2) Optional: load MPD for debug
   ************************************************************/
  useEffect(() => {
    if (!manifest || !file) return;
    let canceled = false;

    (async () => {
      console.log("[EncryptedVideoPlayer] Loading MPD for debug...");
      try {
        const resp = await axiosInstance.get(`/videos/${file.id}/mpd`, {
          responseType: "text",
        });
        if (!canceled) {
          console.log("[EncryptedVideoPlayer] MPD loaded successfully.");
          setMpdXML(resp.data);
        }
      } catch (err) {
        console.warn("[EncryptedVideoPlayer] MPD load error:", err);
      }
    })();

    return () => {
      canceled = true;
    };
  }, [manifest, file, axiosInstance]);

  /************************************************************
   * 3) Create MediaSource, set video src
   ************************************************************/
  useEffect(() => {
    if (!manifest) return;
    if (!videoRef.current) return;

    if (!mediaSourceRef.current) {
      const ms = new MediaSource();
      mediaSourceRef.current = ms;
      videoRef.current.src = URL.createObjectURL(ms);
      console.log("[EncryptedVideoPlayer] Created MediaSource and set src.");
    }
  }, [manifest]);

  /************************************************************
   * 4) On "sourceopen", create SourceBuffers + do initial appends
   ************************************************************/
  useEffect(() => {
    const ms = mediaSourceRef.current;
    if (!ms || !manifest) return;
    if (buffersCreated) return;

    function onSourceOpen() {
      if (ms.readyState !== "open") {
        console.warn("[EncryptedVideoPlayer] MediaSource not open?");
        return;
      }
      setBuffersCreated(true);
      console.log(
        "[EncryptedVideoPlayer] sourceopen => creating SourceBuffers."
      );

      try {
        const videoSB = ms.addSourceBuffer('video/mp4; codecs="avc1.640028"');
        const audioSB = ms.addSourceBuffer('audio/mp4; codecs="mp4a.40.5"');
        videoSBRef.current = videoSB;
        audioSBRef.current = audioSB;

        // Also set the known duration
        if (manifest.durationSec) {
          console.log(
            "[EncryptedVideoPlayer] Setting MSE duration =>",
            manifest.durationSec
          );
          ms.duration = manifest.durationSec;
        }

        // Append init segments + first few
        appendInitSegments()
          .then(() => {
            console.log(
              "[EncryptedVideoPlayer] Init segments appended successfully."
            );
          })
          .catch((err) => {
            console.error("[EncryptedVideoPlayer] init append error:", err);
          });
      } catch (err) {
        console.error(
          "[EncryptedVideoPlayer] SourceBuffer creation error:",
          err
        );
      }
    }

    ms.addEventListener("sourceopen", onSourceOpen);
    return () => ms.removeEventListener("sourceopen", onSourceOpen);
  }, [manifest, buffersCreated]);

  /************************************************************
   * 5) timeupdate => maybe fetch next segment
   ************************************************************/
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    function onTimeUpdate() {
      const currentTime = videoEl.currentTime;
      console.log(
        `[EncryptedVideoPlayer] timeupdate => currentTime: ${currentTime.toFixed(
          2
        )}`
      );

      const vidLastEnd = getLastEndTime(videoRangesRef.current).toFixed(2);
      const audLastEnd = getLastEndTime(audioRangesRef.current).toFixed(2);
      console.log(
        `[EncryptedVideoPlayer] timeupdate => appended video up to ${vidLastEnd}, audio up to ${audLastEnd}`
      );

      console.log(
        "currentManifest: ",
        manifest === null ? " null" : " not null"
      );

      maybeFetchNextSegment();
    }

    videoEl.addEventListener("timeupdate", onTimeUpdate);
    return () => videoEl.removeEventListener("timeupdate", onTimeUpdate);
  }, [manifest]);

  /************************************************************
   * RENDER
   ************************************************************/
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {loadingManifest && (
        <div style={{ color: "#666" }}>Loading manifest…</div>
      )}
      {error && <div style={{ color: "red" }}>{error}</div>}
      <video
        ref={videoRef}
        controls
        style={{ width: "100%", maxHeight: "70vh", background: "#000" }}
      />
      {mpdXML && (
        <div style={{ marginTop: 16, background: "#eee", padding: 10 }}>
          <h4>MPD Debug:</h4>
          <pre style={{ whiteSpace: "pre-wrap" }}>{mpdXML}</pre>
        </div>
      )}
    </div>
  );

  /************************************************************
   * FUNCTIONS
   ************************************************************/

  async function appendInitSegments() {
    if (!manifest) {
      console.warn("[EncryptedVideoPlayer] No manifest in appendInitSegments?");
      return;
    }

    // 1) Video init
    if (manifest.initSegmentVideo) {
      console.log("[EncryptedVideoPlayer] Fetching video init segment...");
      const data = await fetchSegment(manifest.initSegmentVideo.filename);
      await appendBufferAsync(videoSBRef.current, data, true);
      videoRangesRef.current.push({ start: 0, end: 0, bytes: data.byteLength });
      console.log("[EncryptedVideoPlayer] Appended video init segment.");
    }

    // 2) Audio init
    if (manifest.initSegmentAudio) {
      console.log("[EncryptedVideoPlayer] Fetching audio init segment...");
      const data = await fetchSegment(manifest.initSegmentAudio.filename);
      await appendBufferAsync(audioSBRef.current, data, false);
      audioRangesRef.current.push({ start: 0, end: 0, bytes: data.byteLength });
      console.log("[EncryptedVideoPlayer] Appended audio init segment.");
    }

    // 3) Append first X segments so playback can start
    console.log(
      `[EncryptedVideoPlayer] Appending first ${INITIAL_SEGMENTS_TO_APPEND} segments for each track...`
    );

    // Video
    const firstVidSegs = (manifest.segmentsVideo || []).slice(
      0,
      INITIAL_SEGMENTS_TO_APPEND
    );
    for (let i = 0; i < firstVidSegs.length; i++) {
      await appendOneSegment(
        true,
        firstVidSegs[i],
        videoRangesRef,
        videoSBRef.current,
        videoNextIndex + i
      );
    }
    setVideoNextIndex((prev) => prev + firstVidSegs.length);

    // Audio
    const firstAudSegs = (manifest.segmentsAudio || []).slice(
      0,
      INITIAL_SEGMENTS_TO_APPEND
    );
    for (let i = 0; i < firstAudSegs.length; i++) {
      await appendOneSegment(
        false,
        firstAudSegs[i],
        audioRangesRef,
        audioSBRef.current,
        audioNextIndex + i
      );
    }
    setAudioNextIndex((prev) => prev + firstAudSegs.length);

    console.log("[EncryptedVideoPlayer] Finished appending initial segments.");
  }

  function maybeFetchNextSegment() {
    const currentManifest = manifest;
    const vEl = videoRef.current;
    const ms = mediaSourceRef.current;
    if (!currentManifest || !vEl || !ms) {
      console.log(
        "[EncryptedVideoPlayer] maybeFetchNextSegment => missing refs?"
      );
      return;
    }

    const totalVid = (currentManifest.segmentsVideo || []).length;
    const totalAud = (currentManifest.segmentsAudio || []).length;

    // If all appended
    if (videoNextIndex >= totalVid && audioNextIndex >= totalAud) {
      console.log(
        "[EncryptedVideoPlayer] All segments appended => check endOfStream..."
      );
      if (ms.readyState === "open") {
        console.log("[EncryptedVideoPlayer] Calling endOfStream()...");
        try {
          ms.endOfStream();
        } catch (err) {
          console.warn("[EncryptedVideoPlayer] endOfStream error:", err);
        }
      }
      return;
    }

    // If either SourceBuffer is updating, skip
    if (videoSBRef.current?.updating || audioSBRef.current?.updating) {
      console.log("[EncryptedVideoPlayer] SB updating => skip for now");
      return;
    }

    const currentTime = vEl.currentTime;
    const vidLastEnd = getLastEndTime(videoRangesRef.current);
    const audLastEnd = getLastEndTime(audioRangesRef.current);

    const distanceVideo = vidLastEnd - currentTime;
    const distanceAudio = audLastEnd - currentTime;

    console.log(
      `[EncryptedVideoPlayer] maybeFetchNextSegment => currentTime=${currentTime.toFixed(
        2
      )}, vidLastEnd=${vidLastEnd.toFixed(2)}, audLastEnd=${audLastEnd.toFixed(
        2
      )}, ` +
        `distanceVideo=${distanceVideo.toFixed(
          2
        )}, distanceAudio=${distanceAudio.toFixed(
          2
        )}, videoNextIndex=${videoNextIndex}, audioNextIndex=${audioNextIndex}`
    );

    // If either track is below threshold
    if (
      distanceVideo <= LAZY_BUFFER_THRESHOLD_SEC ||
      distanceAudio <= LAZY_BUFFER_THRESHOLD_SEC
    ) {
      console.log(
        "[EncryptedVideoPlayer] => distance <= threshold => fetchNextSegments()"
      );
      fetchNextSegments().catch((err) => {
        console.error("[EncryptedVideoPlayer] lazy fetch error:", err);
      });
    } else {
      console.log("[EncryptedVideoPlayer] => no fetch needed yet");
    }
  }

  async function fetchNextSegments() {
    const currentManifest = manifest;
    if (!currentManifest) {
      console.warn("[EncryptedVideoPlayer] No manifest in fetchNextSegments?");
      return;
    }
    if (!mediaSourceRef.current) {
      console.warn(
        "[EncryptedVideoPlayer] No mediaSource in fetchNextSegments?"
      );
      return;
    }

    // concurrency guard
    if (fetchInProgressRef.current) {
      console.log(
        "[EncryptedVideoPlayer] fetchNextSegments => inFlight => skip"
      );
      return;
    }
    fetchInProgressRef.current = true;

    try {
      // Capture the old indexes in local vars so we fetch the correct segments
      let oldVideoIndex, oldAudioIndex;

      setVideoNextIndex((prev) => {
        oldVideoIndex = prev;
        return prev; // We'll increment only if we actually fetch
      });
      setAudioNextIndex((prev) => {
        oldAudioIndex = prev;
        return prev; // We'll increment only if we actually fetch
      });

      const totalVid = (currentManifest.segmentsVideo || []).length;
      const totalAud = (currentManifest.segmentsAudio || []).length;

      console.log(
        `[EncryptedVideoPlayer] fetchNextSegments => videoNextIndex=${oldVideoIndex}, ` +
          `audioNextIndex=${oldAudioIndex}, totalVidSegments=${totalVid}, totalAudSegments=${totalAud}`
      );

      // Next video seg if remain
      if (oldVideoIndex < totalVid) {
        const segV = currentManifest.segmentsVideo[oldVideoIndex];
        console.log(
          `[EncryptedVideoPlayer] => Next video seg index=${oldVideoIndex}, filename=${segV.filename}`
        );
        await appendOneSegment(
          true,
          segV,
          videoRangesRef,
          videoSBRef.current,
          oldVideoIndex
        );
        // Now increment the state
        setVideoNextIndex((prev) => prev + 1);
      }

      // Next audio seg if remain
      if (oldAudioIndex < totalAud) {
        const segA = currentManifest.segmentsAudio[oldAudioIndex];
        console.log(
          `[EncryptedVideoPlayer] => Next audio seg index=${oldAudioIndex}, filename=${segA.filename}`
        );
        await appendOneSegment(
          false,
          segA,
          audioRangesRef,
          audioSBRef.current,
          oldAudioIndex
        );
        setAudioNextIndex((prev) => prev + 1);
      }
    } catch (err) {
      console.error("[EncryptedVideoPlayer] fetchNextSegments error:", err);
    } finally {
      fetchInProgressRef.current = false;
    }
  }

  async function appendOneSegment(isVideo, segObj, rangesRef, sb, segIndex) {
    const currentManifest = manifest;
    if (!currentManifest) {
      console.warn("[EncryptedVideoPlayer] No manifest in appendOneSegment?");
      return;
    }
    if (!segObj) {
      console.warn(
        `[EncryptedVideoPlayer] No segment object at index=${segIndex}`
      );
      return;
    }
    if (!sb) {
      console.warn(
        `[EncryptedVideoPlayer] No sourceBuffer for ${
          isVideo ? "video" : "audio"
        }?`
      );
      return;
    }

    console.log(
      `[EncryptedVideoPlayer] appendOneSegment => ${
        isVideo ? "video" : "audio"
      } segIndex=${segIndex}, ` + `filename=${segObj.filename}`
    );

    // 1) Fetch
    console.log(
      `[EncryptedVideoPlayer] Fetching segment ${segObj.filename}...`
    );
    const data = await fetchSegment(segObj.filename);

    // 2) Possibly remove older data
    maybeRemoveByteOverLimit(sb, rangesRef, data.byteLength, isVideo);

    // 3) Append
    await appendBufferAsync(sb, data, isVideo);

    // 4) Compute segDuration
    let segDuration = 1; // fallback
    if (isVideo && currentManifest.segmentDurationsVideo) {
      segDuration =
        currentManifest.segmentDurationsVideo[segIndex] ?? segDuration;
    } else if (!isVideo && currentManifest.segmentDurationsAudio) {
      segDuration =
        currentManifest.segmentDurationsAudio[segIndex] ?? segDuration;
    }

    // 5) Update timeline
    const lastEnd = getLastEndTime(rangesRef.current);
    const segStart = lastEnd;
    const segEnd = segStart + segDuration;

    rangesRef.current.push({
      start: segStart,
      end: segEnd,
      bytes: data.byteLength,
    });

    console.log(
      `[EncryptedVideoPlayer] Appended ${
        isVideo ? "video" : "audio"
      } seg #${segIndex}, ` +
        `segDuration=${segDuration.toFixed(3)}, range=(${segStart.toFixed(
          3
        )}..${segEnd.toFixed(3)}), bytes=${data.byteLength}`
    );
  }

  function maybeRemoveByteOverLimit(
    sourceBuffer,
    rangesRef,
    newBytes,
    isVideo
  ) {
    const maxBytes = isVideo ? MAX_BUFFER_BYTES_VIDEO : MAX_BUFFER_BYTES_AUDIO;
    const ranges = rangesRef.current;

    const currentUsage = ranges.reduce((acc, r) => acc + r.bytes, 0);
    if (currentUsage + newBytes <= maxBytes) {
      return; // no removal needed
    }

    console.log(
      `[EncryptedVideoPlayer] Exceeding buffer limit for ${
        isVideo ? "VIDEO" : "AUDIO"
      }: currentUsage=${currentUsage}, newBytes=${newBytes}, max=${maxBytes}`
    );

    let removeIndex = 0;
    let usageTemp = currentUsage;

    while (usageTemp + newBytes > maxBytes && removeIndex < ranges.length) {
      const oldest = ranges[removeIndex];
      console.log(
        `[EncryptedVideoPlayer] Removing older ${
          isVideo ? "VIDEO" : "AUDIO"
        } chunk [${oldest.start}, ${oldest.end}] => ${oldest.bytes} bytes`
      );
      try {
        sourceBuffer.remove(oldest.start, oldest.end);
      } catch (err) {
        console.warn(
          "[EncryptedVideoPlayer] sourceBuffer.remove() error:",
          err
        );
      }
      usageTemp -= oldest.bytes;
      removeIndex++;
    }

    if (removeIndex > 0) {
      ranges.splice(0, removeIndex);
      console.log(
        `[EncryptedVideoPlayer] Removed ${removeIndex} older chunk(s) from ${
          isVideo ? "video" : "audio"
        } buffer.`
      );
    }
  }

  function getLastEndTime(ranges) {
    if (!ranges.length) return 0;
    return ranges[ranges.length - 1].end;
  }

  async function fetchSegment(filename) {
    console.log(`[EncryptedVideoPlayer] Requesting segment ${filename}...`);
    let resp;
    try {
      resp = await axiosInstance.get(`/videos/${file.id}/segment/${filename}`, {
        responseType: "arraybuffer",
      });
    } catch (err) {
      console.error("[EncryptedVideoPlayer] fetchSegment error:", err);
      throw err;
    }
    console.log(
      `[EncryptedVideoPlayer] Segment ${filename} fetched (${resp.data.byteLength} bytes).`
    );
    return new Uint8Array(resp.data);
  }

  function appendBufferAsync(sourceBuffer, data, isVideo) {
    return new Promise((resolve, reject) => {
      if (!sourceBuffer) {
        return reject(
          new Error("[EncryptedVideoPlayer] No sourceBuffer to append to.")
        );
      }

      const onUpdateEnd = () => {
        sourceBuffer.removeEventListener("updateend", onUpdateEnd);
        sourceBuffer.removeEventListener("error", onError);
        console.log(
          `[EncryptedVideoPlayer] appendBufferAsync -> updateend for ${
            isVideo ? "video" : "audio"
          }`
        );
        resolve();
      };
      const onError = (e) => {
        sourceBuffer.removeEventListener("updateend", onUpdateEnd);
        sourceBuffer.removeEventListener("error", onError);
        console.error(
          `[EncryptedVideoPlayer] SourceBuffer error for ${
            isVideo ? "video" : "audio"
          }:`,
          e
        );
        reject(e || new Error("SourceBuffer error"));
      };
      sourceBuffer.addEventListener("updateend", onUpdateEnd);
      sourceBuffer.addEventListener("error", onError);

      try {
        sourceBuffer.appendBuffer(data);
        console.log(
          `[EncryptedVideoPlayer] appending ${data.byteLength} bytes to ${
            isVideo ? "video" : "audio"
          } buffer...`
        );
      } catch (err) {
        sourceBuffer.removeEventListener("updateend", onUpdateEnd);
        sourceBuffer.removeEventListener("error", onError);
        console.error("[EncryptedVideoPlayer] appendBuffer error:", err);
        reject(err);
      }
    });
  }
}
