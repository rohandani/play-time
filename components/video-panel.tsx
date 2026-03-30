"use client";

import { useState, useRef, useEffect } from "react";

export function VideoPanel() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState("");

  const toggleCamera = async () => {
    if (active) {
      // Stop
      const stream = videoRef.current?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((t) => t.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
      setActive(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setActive(true);
      setError("");
    } catch {
      setError("Camera not available 😅");
    }
  };

  useEffect(() => {
    return () => {
      const stream = videoRef.current?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="border-b border-gray-100">
      <div className="px-3 py-2 flex items-center justify-between">
        <span className="font-bold text-sm text-gray-500">📹 Video</span>
        <button
          onClick={toggleCamera}
          className={`text-xs font-bold px-2 py-1 rounded-lg transition-colors ${
            active
              ? "bg-red-100 text-red-500 hover:bg-red-200"
              : "bg-teal-100 text-teal-600 hover:bg-teal-200"
          }`}
        >
          {active ? "Stop" : "Start"}
        </button>
      </div>
      <div className="px-3 pb-3">
        <div className="relative aspect-video bg-gray-100 rounded-xl overflow-hidden">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
          {!active && !error && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-300 text-sm font-semibold">
              Tap Start to see your friend 🎥
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center text-red-400 text-sm font-semibold">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
