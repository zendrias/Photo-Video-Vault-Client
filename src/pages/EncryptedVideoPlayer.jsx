import React, { useEffect, useRef, useState } from "react";
import "./EncryptedVideoPlayer.css"
/**
* Constants:
*/
const INITIAL_SEGMENTS_TO_APPEND = 7;
const MAX_BUFFER_BYTES_VIDEO = 250 * 1024 * 1024;
const MAX_BUFFER_BYTES_AUDIO = 100 * 1024 * 1024;
const LAZY_BUFFER_THRESHOLD_SEC = 15;

export default function EncryptedVideoPlayer({ file, axiosInstance }) {
  const videoRef = useRef(null);
  const mediaSourceRef = useRef(null);

  // Track the last network call to avoid dups
  const videoLastIndexRef = useRef(null);
  const audioLastIndexRef = useRef(null);
  
  const [manifest, setManifest] = useState(null);
  const [error, setError] = useState(null);
  const [loadingManifest, setLoadingManifest] = useState(false);
  const [buffersCreated, setBuffersCreated] = useState(false);
  
  // Ranges: each is { start, end, bytes }
  const videoRangesRef = useRef([]);
  const audioRangesRef = useRef([]);
  
  // Track how many segments we have appended so far:
  const [videoNextIndex, setVideoNextIndex] = useState(0);
  const [audioNextIndex, setAudioNextIndex] = useState(0);


  // Our SourceBuffer references
  const videoSBRef = useRef(null);
  const audioSBRef = useRef(null);

  let videoQueue = Promise.resolve();
  let audioQueue = Promise.resolve();

  /************************************************************
  * 1) Load the manifest
  ************************************************************/
  useEffect(() => {
    if (!file) return;
    let canceled = false;
    
    (async () => {
      setLoadingManifest(true);
      setError(null);
      
      try {
        const resp = await axiosInstance.get(`/videos/${file.id}/manifest`);
        if (!canceled) setManifest(resp.data);
      } catch (err) {
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
  * 2) Create MediaSource, set video src
  ************************************************************/
  useEffect(() => {
    if (!manifest) return;
    if (!videoRef.current) return;
    
    if (!mediaSourceRef.current) {
      const ms = new MediaSource();
      mediaSourceRef.current = ms;
      videoRef.current.src = URL.createObjectURL(ms);
    }
  }, [manifest]);
  
  /************************************************************
  * 3) On "sourceopen", create SourceBuffers + do initial appends
  ************************************************************/
  useEffect(() => {
    const ms = mediaSourceRef.current;
    if (!ms || !manifest) return;
    if (buffersCreated) return;
    
    function onSourceOpen() {
      if (ms.readyState !== "open") return console.warn("[EncryptedVideoPlayer] MediaSource not open?");
      
      setBuffersCreated(true);
      
      try {
        const videoSB = ms.addSourceBuffer('video/mp4; codecs="avc1.640028"');
        const audioSB = ms.addSourceBuffer('audio/mp4; codecs="mp4a.40.5"');

        videoSBRef.current = videoSB;
        audioSBRef.current = audioSB;
        
        // Also set the known duration
        if (manifest.durationSec) ms.duration = manifest.durationSec;
        
        // Append init segments + first few
        appendInitSegments()
          .catch((err) => console.error("[EncryptedVideoPlayer] init append error:", err));

      } catch (err) {
        console.error("[EncryptedVideoPlayer] SourceBuffer creation error: ", err);
      }
    }
    
    ms.addEventListener("sourceopen", onSourceOpen);
    return () => ms && ms.removeEventListener("sourceopen", onSourceOpen);
  }, [manifest, buffersCreated]);
  
  /************************************************************
  * 5) timeupdate => maybe fetch next segment
  ************************************************************/
  useEffect(() => {
    if (!videoRef.current) return;

    function onTimeUpdate() {
      if (!videoRef.current) return;
      maybeFetchNextSegment();
    }

    function onSeeking() {
      if (!videoRef.current) return;
      handleSeeking();
    }

    videoRef.current.addEventListener("timeupdate", onTimeUpdate);
    videoRef.current.addEventListener("seeking", onSeeking)
    return () => {
      if (videoRef?.current != null) {
        videoRef.current.removeEventListener("timeupdate", onTimeUpdate);
        videoRef.current.removeEventListener("seeking", onSeeking)
      }
    }

  }, [manifest]);

/************************************************************
* RENDER
************************************************************/
return (
  <div className="video-player-container">
  {loadingManifest && <div className="player-message loading-message">Loading manifest…</div>}
  {error && <div className="player-message error-message">{error}</div>}

  <video
    ref={videoRef}
    className="encrypted-video"
    controls
    autoPlay={false}
    muted
    disableRemotePlayback
    preload="metadata"
  />
</div>
);

/************************************************************
* FUNCTIONS
************************************************************/

  async function appendInitSegments() {
    if (!manifest) return console.warn("[EncryptedVideoPlayer] No manifest in appendInitSegments?");
    
    // 1) Video init
    if (manifest.initSegmentVideo) {
      const data = await fetchSegment(manifest.initSegmentVideo.filename);
      await appendBufferAsync(videoSBRef.current, data, true, videoRangesRef);
      videoRangesRef.current.push({ start: 0, end: 0, bytes: data.byteLength });
    }
    
    // 2) Audio init
    if (manifest.initSegmentAudio) {
      const data = await fetchSegment(manifest.initSegmentAudio.filename);
      await appendBufferAsync(audioSBRef.current, data, false, audioRangesRef);
      audioRangesRef.current.push({ start: 0, end: 0, bytes: data.byteLength });
    }
    
    // 3) Append first X segments so playback can start
    // Video
    const firstVidSegs = (manifest.segmentsVideo || []).slice(0, INITIAL_SEGMENTS_TO_APPEND);
    for (let i = 0; i < firstVidSegs.length; i++) {
      await appendOneSegment(true, firstVidSegs[i], videoRangesRef, videoSBRef.current, i);
    }
    
    // Audio
    const firstAudSegs = (manifest.segmentsAudio || []).slice(0, INITIAL_SEGMENTS_TO_APPEND);
    for (let i = 0; i < firstAudSegs.length; i++) {
      await appendOneSegment(false, firstAudSegs[i], audioRangesRef, audioSBRef.current, i);
    }
  }

  function maybeFetchNextSegment() {
    const currentManifest = manifest;
    const vEl = videoRef.current;
    const ms = mediaSourceRef.current;

    if (!currentManifest || !vEl || !ms) return console.log("[EncryptedVideoPlayer] maybeFetchNextSegment => missing refs?");
    
    const totalVid = (currentManifest.segmentsVideo || []).length;
    const totalAud = (currentManifest.segmentsAudio || []).length;
    

    let updatedNextVideoIndex, updatedNextAudioIndex;
    setVideoNextIndex((prev) => updatedNextVideoIndex = prev)
    setAudioNextIndex((prev) =>  updatedNextAudioIndex = prev)
    
    if (updatedNextVideoIndex >= totalVid && updatedNextAudioIndex >= totalAud) {
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
    if (videoSBRef.current?.updating || audioSBRef.current?.updating) return;
    
    const currentTime = vEl.currentTime;
    const vidLastEnd = getLastEndTime(videoRangesRef.current);
    const audLastEnd = getLastEndTime(audioRangesRef.current);

    // console.log('video range: ', videoRangesRef.current)
    // console.log(`vidLastEnd ${vidLastEnd}`);
    
    const distanceVideo = vidLastEnd - currentTime;
    const distanceAudio = audLastEnd - currentTime;

    console.log(`The video has buffered ${distanceVideo} seconds over the the current time\n`)

  // If either track is below threshold
  if (distanceVideo <= LAZY_BUFFER_THRESHOLD_SEC || distanceAudio <= LAZY_BUFFER_THRESHOLD_SEC) {
    console.log('FETCHING MORE')
    // if we just made a network request for this content last time, don't do it again
    if(videoLastIndexRef.current === updatedNextVideoIndex || audioLastIndexRef.current === updatedNextAudioIndex) return

    videoLastIndexRef.current = updatedNextVideoIndex
    audioLastIndexRef.current = updatedNextAudioIndex
    
    fetchSegments(updatedNextVideoIndex, updatedNextAudioIndex)
      .catch((err) => console.error("lazy fetch error: ", err));
  } else {
    console.log("[EncryptedVideoPlayer] => no fetch needed yet");
  }
  }

  async function fetchSegments(videoSegmentNumber, audioSegmentNumber) {
    const currentManifest = manifest;

    if (!currentManifest || !mediaSourceRef.current) return console.warn("[EncryptedVideoPlayer] Missing values in fetchSegments()");
    
    try {
      const totalVid = (currentManifest.segmentsVideo || []).length;
      const totalAud = (currentManifest.segmentsAudio || []).length;
      
      // append the next video segment if any more remain
      if (videoSegmentNumber < totalVid) {
        const segV = currentManifest.segmentsVideo[videoSegmentNumber];
        await appendOneSegment(true, segV, videoRangesRef, videoSBRef.current, videoSegmentNumber);
      }
      // Next the audio segment if any more remain
      if (audioSegmentNumber < totalAud) {
        const segA = currentManifest.segmentsAudio[audioSegmentNumber];
        await appendOneSegment(false, segA, audioRangesRef, audioSBRef.current, audioSegmentNumber);
      }
    } catch (err) {
      console.error("[EncryptedVideoPlayer] fetchSegments error:", err);
    }
  }

  async function appendOneSegment(isVideo, segObj, rangesRef, sb, segIndex) {
    const currentManifest = manifest;
    if (!currentManifest || !segObj || !sb) {
      return console.warn(`[EncryptedVideoPlayer] !manifest || !segObj || !sb for ${isVideo ? "video" : "audio"} in appendOneSegment`);
    }
    
    // 1) Fetch
    const data = await fetchSegment(segObj.filename);

    // 3) Append
    await appendBufferAsync(sb, data, isVideo, rangesRef); // revisit this

    // 4) Compute segDuration
    let segDuration = 2; // fallback
    if (isVideo) {
      segDuration = currentManifest?.segmentDurationsVideo[segIndex] ?? segDuration;
      setVideoNextIndex(() => segIndex + 1);
    } else {
      segDuration = currentManifest?.segmentDurationsAudio[segIndex] ?? segDuration;
      setAudioNextIndex(() => segIndex + 1);
    }

    // 5) Update timeline
    const lastEnd = getLastEndTime(rangesRef.current);
    /* if the current time > 15 secs from the last end or , a seek has occurred*/
    const segStart = lastEnd;
    const segEnd = segStart + segDuration;
    
    rangesRef.current.push({ start: segStart, end: segEnd, bytes: data.byteLength });
  }

  async function maybeRemoveByteOverLimit(sourceBuffer, rangesRef, newBytes, isVideo) {
    const maxBytes = isVideo ? MAX_BUFFER_BYTES_VIDEO : MAX_BUFFER_BYTES_AUDIO;
    const ranges = rangesRef.current;
    
    const currentUsage = ranges.reduce((acc, r) => acc + r.bytes, 0);

    console.log(`\nThe buffer currently has ${currentUsage} bytes in it\n`)
    console.log(`We are adding ${newBytes} new bytes, for a total of ${currentUsage + newBytes} / ${maxBytes}\n`)
    console.log(`That means we ${currentUsage + newBytes <= maxBytes ? 'DO NOT NEED' : 'NEED'} to remove bytes\n`)

    if (currentUsage + newBytes <= maxBytes) return;
    
    console.log(' - - - - - - REMOVING BYTES! - - - - - - ')
    let removeIndex = 0;
    let usageTemp = currentUsage;

    while (usageTemp + newBytes > maxBytes && removeIndex < ranges.length) {
      const oldest = ranges[removeIndex];
      try {
        await clearBufferAsync(sourceBuffer, oldest.start, oldest.end)
      } catch (err) {
        console.warn("[EncryptedVideoPlayer] sourceBuffer.remove() error: ", err);
      }
      usageTemp -= oldest.bytes;
      removeIndex++;
    }

    if (removeIndex > 0) ranges.splice(0, removeIndex);
  }

  function getLastEndTime(ranges) {
    if (!ranges.length) return 0;
    return ranges[ranges.length - 1].end;
  }

  async function fetchSegment(filename) {
    let resp;
    try {
      resp = await axiosInstance.get(`/videos/${file.id}/segment/${filename}`, { responseType: "arraybuffer" });
    } catch (err) {
      console.error("[EncryptedVideoPlayer] fetchSegment error:", err);
      throw err;
    }
    return new Uint8Array(resp.data);
  }

  function appendBufferAsync(sourceBuffer, data, isVideo, rangesRef) {
    return new Promise(async (resolve, reject) => {
      if (!sourceBuffer) return reject(new Error("[EncryptedVideoPlayer] No sourceBuffer to append to."));
      
      const onUpdateEnd = async () => {
        sourceBuffer.removeEventListener("updateend", onUpdateEnd);
        sourceBuffer.removeEventListener("error", onError);
        await maybeRemoveByteOverLimit(sourceBuffer, rangesRef, data.byteLength, isVideo);
        resolve();
      };

      const onError = (e) => {
        sourceBuffer.removeEventListener("updateend", onUpdateEnd);
        sourceBuffer.removeEventListener("error", onError);
        console.error(`[EncryptedVideoPlayer] SourceBuffer error for ${isVideo ? "video" : "audio"}: `, e);
        reject(e || new Error("SourceBuffer error"));
      };

      sourceBuffer.addEventListener("updateend", onUpdateEnd);
      sourceBuffer.addEventListener("error", onError);

    try {
      await waitForIdle(sourceBuffer)
      sourceBuffer.appendBuffer(data);
    } catch (err) {
      sourceBuffer.removeEventListener("updateend", onUpdateEnd);
      sourceBuffer.removeEventListener("error", onError);
      console.error("[EncryptedVideoPlayer] appendBuffer error:", err);
      reject(err);
    }
  });
  }

  async function handleSeeking() {
    const { currentTime } = videoRef.current;

    const nextAudioSegments = getNextSegmentsNumbers(false)
    const nextVideoSegments = getNextSegmentsNumbers(true)
    const numberOfSegmentsToFetch = Math.ceil(LAZY_BUFFER_THRESHOLD_SEC / Math.min(manifest.segmentDurationsVideo[nextVideoSegments], manifest.segmentDurationsAudio[nextAudioSegments]))

    await clearBufferQueued(true, 0, Infinity);
    videoRangesRef.current = ([{ start: currentTime, end: currentTime, bytes: 0 }]);

    await clearBufferQueued(false, 0, Infinity);
    audioRangesRef.current = ([{ start: currentTime, end: currentTime, bytes: 0 }]);

    
    for(let i = 0; i < numberOfSegmentsToFetch; i += 1) {
      await fetchSegments(nextVideoSegments + i, nextAudioSegments + i)
    }
  }

  function getNextSegmentsNumbers(isVideo) {
    const manifestSegmentDurations = manifest[`segmentDurations${isVideo ? 'Video' : 'Audio'}`]
    const { currentTime } = videoRef.current;
    let acc = 0;

    for(let i = 0; i < manifestSegmentDurations.length; i += 1) {
      acc += manifestSegmentDurations[i]
      if (acc >= currentTime) return i >= 1 ? i - 1 : 0
    }

    return manifestSegmentDurations.length - 2
  }

  async function clearBufferAsync(sbRef, start = 0, end = Infinity) {
    return new Promise((resolve, reject) => {
      // if there's nothing buffered, just resolve
      if (!sbRef.current?.buffered || sbRef.current.buffered.length === 0) {
        return resolve();
      }

      const sourceBuffer = sbRef.current;

      function onUpdateEnd() {
        sourceBuffer.removeEventListener("updateend", onUpdateEnd);
        sourceBuffer.removeEventListener("error", onError);
        console.log('- - Buffer Cleared - -')
        resolve();
      }

      function onError(e) {
        sourceBuffer.removeEventListener("updateend", onUpdateEnd);
        sourceBuffer.removeEventListener("error", onError);
        console.error("[EncryptedVideoPlayer] Error clearing buffers:", e);
        reject(e);
      }

      try {
        sourceBuffer.addEventListener("updateend", onUpdateEnd);
        sourceBuffer.addEventListener("error", onError);

        sourceBuffer.remove(start, end);
      } catch (err) {
        console.error("[EncryptedVideoPlayer] remove() failed:", err);
        sourceBuffer.removeEventListener("updateend", onUpdateEnd);
        sourceBuffer.removeEventListener("error", onError);
        reject(err);
      }
    });
  }

  async function waitForIdle(sourceBuffer) {
    return new Promise((resolve, reject) => {
      // If it's already idle, we're done
      if (!sourceBuffer.updating) {
        return resolve();
      }

      function onUpdateEnd() {
        if (!sourceBuffer.updating) {
          sourceBuffer.removeEventListener('updateend', onUpdateEnd);
          sourceBuffer.removeEventListener('error', onError);
          resolve();
        }
      }
      function onError(e) {
        sourceBuffer.removeEventListener('updateend', onUpdateEnd);
        sourceBuffer.removeEventListener('error', onError);
        reject(e);
      }

      sourceBuffer.addEventListener('updateend', onUpdateEnd);
      sourceBuffer.addEventListener('error', onError);
    });
  }

  function queueSourceBufferOp(isVideo, op) {
    if (isVideo) {
      // chain onto videoQueue
      videoQueue = videoQueue
        .then(() => op())
        .catch((err) => {
          console.error("Video operation error:", err);
          // handle error or just continue
        });
      return videoQueue;
    } else {
      // chain onto audioQueue
      audioQueue = audioQueue
        .then(() => op())
        .catch((err) => {
          console.error("Audio operation error:", err);
        });
      return audioQueue;
    }
  }

  function clearBufferQueued(isVideo, start = 0, end = Infinity) {
    return queueSourceBufferOp(isVideo, async () => {
      // 1) wait for any current operation to end:
      const sb = isVideo ? videoSBRef.current : audioSBRef.current;
      await waitForIdle(sb);
      // 2) schedule remove
      await clearBufferAsync(sb, start, end);
    });
  }
  
}