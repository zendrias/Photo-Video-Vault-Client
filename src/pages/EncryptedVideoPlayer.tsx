import React, { useEffect, useRef, useState } from "react";
import type { AxiosInstance } from "axios";
import "./EncryptedVideoPlayer.css";

const INITIAL_SEGMENTS_TO_APPEND = 7;
const MAX_BUFFER_BYTES_VIDEO = 250 * 1024 * 1024;
const MAX_BUFFER_BYTES_AUDIO = 100 * 1024 * 1024;
const LAZY_BUFFER_THRESHOLD_SEC = 15;

type Manifest = {
  durationSec: number;
  videoCodec: string;
  audioCodec: string;
  initSegmentVideo: { filename: string } | null;
  initSegmentAudio: { filename: string } | null;
  segmentsVideo: Array<{ filename: string }>;
  segmentsAudio: Array<{ filename: string }>;
  segmentDurationsVideo: number[];
  segmentDurationsAudio: number[];
};

type AudioVideoRange = {
  start: number;
  end: number;
  bytes: number;
};

type EncryptedVideoPlayerProps = {
  file: { id: string | number };
  axiosInstance: AxiosInstance;
};

export default function EncryptedVideoPlayer({
  file,
  axiosInstance,
}: EncryptedVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaSourceRef = useRef<MediaSource | null>(null);

  // Track the last network call to avoid dups
  const videoLastIndexRef = useRef<number | null>(null);
  const audioLastIndexRef = useRef<number | null>(null);

  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingManifest, setLoadingManifest] = useState(false);
  const [buffersCreated, setBuffersCreated] = useState(false);

  // Ranges: each is { start, end, bytes }
  const videoRangesRef = useRef<Array<AudioVideoRange>>([]);
  const audioRangesRef = useRef<Array<AudioVideoRange>>([]);

  // Track how many segments we have appended so far:
  const [videoNextIndex, setVideoNextIndex] = useState<number>(0);
  const [audioNextIndex, setAudioNextIndex] = useState<number>(0);

  // Our SourceBuffer references
  const videoSBRef = useRef<SourceBuffer | null>(null);
  const audioSBRef = useRef<SourceBuffer | null>(null);

  let videoQueue: Promise<unknown> = Promise.resolve();
  let audioQueue: Promise<unknown> = Promise.resolve();

  useEffect(() => {
    if (!file) return;
    let canceled = false;

    (async () => {
      setLoadingManifest(true);
      setError(null);
      try {
        const resp = await axiosInstance.get<Manifest>(
          `/videos/${file.id}/manifest`
        );
        if (!canceled) setManifest(resp.data);
      } catch {
        if (!canceled) setError("Failed to load manifest");
      } finally {
        if (!canceled) setLoadingManifest(false);
      }
    })();

    return () => {
      canceled = true;
    };
  }, [file, axiosInstance]);

  useEffect(() => {
    if (!manifest) return;
    if (!videoRef.current) return;

    if (!mediaSourceRef.current) {
      const ms = new MediaSource();
      mediaSourceRef.current = ms;
      videoRef.current.src = URL.createObjectURL(ms);
    }
  }, [manifest]);

  useEffect(() => {
    const ms = mediaSourceRef.current;
    if (!ms || !manifest) return;
    if (buffersCreated) return;

    function onSourceOpen() {
      if (!mediaSourceRef.current || !manifest || !ms) return;
      if (ms.readyState !== "open") {
        console.warn("[EncryptedVideoPlayer] MediaSource not open?");
        return;
      }

      setBuffersCreated(true);

      try {
        const videoSB = ms.addSourceBuffer('video/mp4; codecs="avc1.640028"');
        const audioSB = ms.addSourceBuffer('audio/mp4; codecs="mp4a.40.5"');

        videoSBRef.current = videoSB;
        audioSBRef.current = audioSB;

        // Also set the known duration
        if (manifest.durationSec) ms.duration = manifest.durationSec;

        // Append init segments + first few
        appendInitSegments().catch((err) =>
          console.error("[EncryptedVideoPlayer] init append error:", err)
        );
      } catch (err) {
        console.error(
          "[EncryptedVideoPlayer] SourceBuffer creation error: ",
          err
        );
      }
    }

    ms.addEventListener("sourceopen", onSourceOpen);
    return () => {
      ms.removeEventListener("sourceopen", onSourceOpen);
    };
  }, [manifest, buffersCreated]);

  useEffect(() => {
    if (!videoRef.current) return;

    function onTimeUpdate() {
      if (!videoRef.current) return;
      maybeFetchNextSegment();
    }

    function onSeeking() {
      if (!videoRef.current) return;
      handleSeeking().catch((e) =>
        console.error("[EncryptedVideoPlayer] handleSeeking error:", e)
      );
    }

    const el = videoRef.current;
    el.addEventListener("timeupdate", onTimeUpdate);
    el.addEventListener("seeking", onSeeking);
    return () => {
      el.removeEventListener("timeupdate", onTimeUpdate);
      el.removeEventListener("seeking", onSeeking);
    };
  }, [manifest]);

  return (
    <div className="video-player-container">
      {loadingManifest && (
        <div className="player-message loading-message">Loading manifest…</div>
      )}
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

  async function appendInitSegments(): Promise<void> {
    if (!manifest) {
      console.warn("[EncryptedVideoPlayer] No manifest in appendInitSegments?");
      return;
    }

    if (!videoSBRef.current || !audioSBRef.current) {
      console.warn(
        "[EncryptedVideoPlayer] No source buffer in appendInitSegments?"
      );
      return;
    }

    if (manifest.initSegmentVideo) {
      const data = await fetchSegment(manifest.initSegmentVideo.filename);
      await appendBufferAsync(videoSBRef.current, data, true, videoRangesRef);
      videoRangesRef.current.push({ start: 0, end: 0, bytes: data.byteLength });
    }

    if (manifest.initSegmentAudio) {
      const data = await fetchSegment(manifest.initSegmentAudio.filename);
      await appendBufferAsync(audioSBRef.current, data, false, audioRangesRef);
      audioRangesRef.current.push({ start: 0, end: 0, bytes: data.byteLength });
    }

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
        i
      );
    }

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
        i
      );
    }
  }

  function maybeFetchNextSegment(): void {
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

    let updatedNextVideoIndex = videoNextIndex;
    let updatedNextAudioIndex = audioNextIndex;
    setVideoNextIndex((prev) => (updatedNextVideoIndex = prev));
    setAudioNextIndex((prev) => (updatedNextAudioIndex = prev));

    if (
      updatedNextVideoIndex >= totalVid &&
      updatedNextAudioIndex >= totalAud
    ) {
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

    const distanceVideo = vidLastEnd - currentTime;
    const distanceAudio = audLastEnd - currentTime;

    console.log(
      `The video has buffered ${distanceVideo} seconds over the the current time\n`
    );

    // If either track is below threshold
    if (
      distanceVideo <= LAZY_BUFFER_THRESHOLD_SEC ||
      distanceAudio <= LAZY_BUFFER_THRESHOLD_SEC
    ) {
      console.log("FETCHING MORE");
      // avoid duplicate fetch for same indices
      if (
        videoLastIndexRef.current === updatedNextVideoIndex ||
        audioLastIndexRef.current === updatedNextAudioIndex
      )
        return;

      videoLastIndexRef.current = updatedNextVideoIndex;
      audioLastIndexRef.current = updatedNextAudioIndex;

      fetchSegments(updatedNextVideoIndex, updatedNextAudioIndex).catch((err) =>
        console.error("lazy fetch error: ", err)
      );
    } else {
      console.log("[EncryptedVideoPlayer] => no fetch needed yet");
    }
  }

  async function fetchSegments(
    videoSegmentNumber: number,
    audioSegmentNumber: number
  ): Promise<void> {
    const currentManifest = manifest;

    if (
      !currentManifest ||
      !mediaSourceRef.current ||
      !videoSBRef.current ||
      !audioSBRef.current
    ) {
      console.warn("[EncryptedVideoPlayer] Missing values in fetchSegments()");
      return;
    }

    try {
      const totalVid = (currentManifest.segmentsVideo || []).length;
      const totalAud = (currentManifest.segmentsAudio || []).length;

      // append the next video segment if any more remain
      if (videoSegmentNumber < totalVid) {
        const segV = currentManifest.segmentsVideo[videoSegmentNumber];
        await appendOneSegment(
          true,
          segV,
          videoRangesRef,
          videoSBRef.current,
          videoSegmentNumber
        );
      }
      // Next the audio segment if any more remain
      if (audioSegmentNumber < totalAud) {
        const segA = currentManifest.segmentsAudio[audioSegmentNumber];
        await appendOneSegment(
          false,
          segA,
          audioRangesRef,
          audioSBRef.current,
          audioSegmentNumber
        );
      }
    } catch (err) {
      console.error("[EncryptedVideoPlayer] fetchSegments error:", err);
    }
  }

  async function appendOneSegment(
    isVideo: boolean,
    segObj: { filename: string } | undefined,
    rangesRef: React.MutableRefObject<Array<AudioVideoRange>>,
    sb: SourceBuffer | null,
    segIndex: number
  ): Promise<void> {
    const currentManifest = manifest;
    if (!currentManifest || !segObj || !sb) {
      console.warn(
        `[EncryptedVideoPlayer] !manifest || !segObj || !sb for ${
          isVideo ? "video" : "audio"
        } in appendOneSegment`
      );
      return;
    }

    const data = await fetchSegment(segObj.filename);
    await appendBufferAsync(sb, data, isVideo, rangesRef); // revisit this

    let segDuration = 2; // fallback
    if (isVideo) {
      segDuration =
        currentManifest.segmentDurationsVideo?.[segIndex] ?? segDuration;
      setVideoNextIndex(() => segIndex + 1);
    } else {
      segDuration =
        currentManifest.segmentDurationsAudio?.[segIndex] ?? segDuration;
      setAudioNextIndex(() => segIndex + 1);
    }

    const lastEnd = getLastEndTime(rangesRef.current);
    /* if the current time > 15 secs from the last end or , a seek has occurred*/
    const segStart = lastEnd;
    const segEnd = segStart + segDuration;

    rangesRef.current.push({
      start: segStart,
      end: segEnd,
      bytes: data.byteLength,
    });
  }

  async function maybeRemoveByteOverLimit(
    sourceBuffer: SourceBuffer,
    rangesRef: React.MutableRefObject<Array<AudioVideoRange>>,
    newBytes: number,
    isVideo: boolean
  ): Promise<void> {
    const maxBytes = isVideo ? MAX_BUFFER_BYTES_VIDEO : MAX_BUFFER_BYTES_AUDIO;
    const ranges = rangesRef.current;

    const currentUsage = ranges.reduce((acc, r) => acc + r.bytes, 0);

    console.log(`\nThe buffer currently has ${currentUsage} bytes in it\n`);
    console.log(
      `We are adding ${newBytes} new bytes, for a total of ${
        currentUsage + newBytes
      } / ${maxBytes}\n`
    );
    console.log(
      `That means we ${
        currentUsage + newBytes <= maxBytes ? "DO NOT NEED" : "NEED"
      } to remove bytes\n`
    );

    if (currentUsage + newBytes <= maxBytes) return;

    console.log(" - - - - - - REMOVING BYTES! - - - - - - ");
    let removeIndex = 0;
    let usageTemp = currentUsage;

    while (usageTemp + newBytes > maxBytes && removeIndex < ranges.length) {
      const oldest = ranges[removeIndex];
      try {
        await clearBufferAsync(sourceBuffer, oldest.start, oldest.end);
      } catch (err) {
        console.warn(
          "[EncryptedVideoPlayer] sourceBuffer.remove() error: ",
          err
        );
      }
      usageTemp -= oldest.bytes;
      removeIndex++;
    }

    if (removeIndex > 0) ranges.splice(0, removeIndex);
  }

  function getLastEndTime(ranges: Array<AudioVideoRange>): number {
    if (!ranges.length) return 0;
    return ranges[ranges.length - 1].end;
  }

  async function fetchSegment(filename: string): Promise<Uint8Array> {
    try {
      const resp = await axiosInstance.get<ArrayBuffer>(
        `/videos/${file.id}/segment/${filename}`,
        { responseType: "arraybuffer" }
      );
      return new Uint8Array(resp.data);
    } catch (err) {
      console.error("[EncryptedVideoPlayer] fetchSegment error:", err);
      throw err;
    }
  }

  function appendBufferAsync(
    sourceBuffer: SourceBuffer,
    data: Uint8Array,
    isVideo: boolean,
    rangesRef: React.MutableRefObject<Array<AudioVideoRange>>
  ): Promise<void> {
    return new Promise(async (resolve, reject) => {
      if (!sourceBuffer)
        return reject(
          new Error("[EncryptedVideoPlayer] No sourceBuffer to append to.")
        );

      const onUpdateEnd = async () => {
        sourceBuffer.removeEventListener("updateend", onUpdateEnd);
        sourceBuffer.removeEventListener("error", onError);
        await maybeRemoveByteOverLimit(
          sourceBuffer,
          rangesRef,
          data.byteLength,
          isVideo
        );
        resolve();
      };

      const onError = (e: Event) => {
        sourceBuffer.removeEventListener("updateend", onUpdateEnd);
        sourceBuffer.removeEventListener("error", onError);
        console.error(
          `[EncryptedVideoPlayer] SourceBuffer error for ${
            isVideo ? "video" : "audio"
          }: `,
          e
        );
        reject(e || new Error("SourceBuffer error"));
      };

      sourceBuffer.addEventListener("updateend", onUpdateEnd);
      sourceBuffer.addEventListener("error", onError);

      try {
        await waitForIdle(sourceBuffer);
        sourceBuffer.appendBuffer(data);
      } catch (err) {
        sourceBuffer.removeEventListener("updateend", onUpdateEnd);
        sourceBuffer.removeEventListener("error", onError);
        console.error("[EncryptedVideoPlayer] appendBuffer error:", err as any);
        reject(err);
      }
    });
  }

  async function handleSeeking(): Promise<void> {
    if (!manifest || !videoRef.current) return;
    const currentTime = videoRef.current.currentTime;

    const nextAudioSegments = getNextSegmentsNumbers(false);
    const nextVideoSegments = getNextSegmentsNumbers(true);
    if (
      nextAudioSegments == null ||
      nextVideoSegments == null ||
      nextAudioSegments < 0 ||
      nextVideoSegments < 0
    )
      return;

    const durV = manifest.segmentDurationsVideo[nextVideoSegments];
    const durA = manifest.segmentDurationsAudio[nextAudioSegments];
    const perSeg = Math.min(
      typeof durV === "number" ? durV : 2,
      typeof durA === "number" ? durA : 2
    );
    const numberOfSegmentsToFetch = Math.ceil(
      LAZY_BUFFER_THRESHOLD_SEC / perSeg
    );

    await clearBufferQueued(true, 0, Infinity);
    videoRangesRef.current = [
      { start: currentTime, end: currentTime, bytes: 0 },
    ];

    await clearBufferQueued(false, 0, Infinity);
    audioRangesRef.current = [
      { start: currentTime, end: currentTime, bytes: 0 },
    ];

    for (let i = 0; i < numberOfSegmentsToFetch; i += 1) {
      await fetchSegments(nextVideoSegments + i, nextAudioSegments + i);
    }
  }

  function getNextSegmentsNumbers(isVideo: boolean): number | undefined {
    if (!manifest || !videoRef.current) return;

    const manifestSegmentDurations = isVideo
      ? manifest.segmentDurationsVideo
      : manifest.segmentDurationsAudio;

    const { currentTime } = videoRef.current;
    let acc = 0;

    for (let i = 0; i < manifestSegmentDurations.length; i += 1) {
      acc += manifestSegmentDurations[i];
      if (acc >= currentTime) return i >= 1 ? i - 1 : 0;
    }

    return manifestSegmentDurations.length - 2;
  }

  // NOTE: this function previously expected a ref and would throw at runtime.
  // It now correctly accepts a SourceBuffer (matching all call sites).
  async function clearBufferAsync(
    sourceBuffer: SourceBuffer | null,
    start = 0,
    end = Infinity
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (
        !sourceBuffer ||
        !sourceBuffer.buffered ||
        sourceBuffer.buffered.length === 0
      ) {
        return resolve();
      }

      function onUpdateEnd() {
        if (!sourceBuffer) return;
        sourceBuffer.removeEventListener("updateend", onUpdateEnd);
        sourceBuffer.removeEventListener("error", onError);
        console.log("- - Buffer Cleared - -");
        resolve();
      }

      function onError(e: Event) {
        if (!sourceBuffer) return;

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

  async function waitForIdle(sourceBuffer: SourceBuffer): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!sourceBuffer.updating) {
        return resolve();
      }

      function onUpdateEnd() {
        if (!sourceBuffer.updating) {
          sourceBuffer.removeEventListener("updateend", onUpdateEnd);
          sourceBuffer.removeEventListener("error", onError);
          resolve();
        }
      }
      function onError(e: Event) {
        sourceBuffer.removeEventListener("updateend", onUpdateEnd);
        sourceBuffer.removeEventListener("error", onError);
        reject(e);
      }

      sourceBuffer.addEventListener("updateend", onUpdateEnd);
      sourceBuffer.addEventListener("error", onError);
    });
  }

  function queueSourceBufferOp(
    isVideo: boolean,
    op: () => Promise<unknown> | unknown
  ): Promise<unknown> {
    if (isVideo) {
      videoQueue = videoQueue
        .then(() => op())
        .catch((err) => {
          console.error("Video operation error:", err);
        });
      return videoQueue;
    } else {
      audioQueue = audioQueue
        .then(() => op())
        .catch((err) => {
          console.error("Audio operation error:", err);
        });
      return audioQueue;
    }
  }

  function clearBufferQueued(
    isVideo: boolean,
    start = 0,
    end = Infinity
  ): Promise<unknown> {
    return queueSourceBufferOp(isVideo, async () => {
      const sb = isVideo ? videoSBRef.current : audioSBRef.current;
      if (!sb) return;
      await waitForIdle(sb);
      await clearBufferAsync(sb, start, end);
    });
  }
}
