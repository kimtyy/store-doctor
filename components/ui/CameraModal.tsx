'use client';

import { useEffect, useRef, useState } from 'react';

interface CameraModalProps {
  isOpen: boolean;
  onCapture: (file: File) => void;
  onClose: () => void;
  onFallback: () => void;
}

export default function CameraModal({ isOpen, onCapture, onClose, onFallback }: CameraModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onCloseRef = useRef(onClose);
  const onFallbackRef = useRef(onFallback);
  const [ready, setReady] = useState(false);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { onFallbackRef.current = onFallback; }, [onFallback]);

  useEffect(() => {
    if (!isOpen) return;
    setReady(false);

    let cancelled = false;

    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        console.warn('getUserMedia 미지원 — 파일 선택으로 대체');
        onFallbackRef.current();
        onCloseRef.current();
        return;
      }

      let stream: MediaStream | null = null;
      try {
        // 후면 카메라 강제
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { exact: 'environment' } },
        });
      } catch {
        try {
          // exact 실패 시 soft 요청
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' },
          });
        } catch {
          console.warn('카메라 접근 실패 — 파일 선택으로 대체');
          onFallbackRef.current();
          onCloseRef.current();
          return;
        }
      }

      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          if (!cancelled) setReady(true);
        };
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [isOpen]);

  function handleCapture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        onCapture(file);
        onClose();
      },
      'image/jpeg',
      0.92
    );
  }

  function handleClose() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onClose();
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="flex-1 w-full object-cover"
      />
      <canvas ref={canvasRef} className="hidden" />

      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-white text-sm bg-black/60 px-4 py-2 rounded-full">카메라 시작 중...</p>
        </div>
      )}

      <div className="flex items-center justify-between px-8 py-8 bg-black safe-area-bottom">
        <button
          type="button"
          onClick={handleClose}
          className="w-16 text-white text-base font-medium text-left"
        >
          취소
        </button>
        {/* 셔터 */}
        <button
          type="button"
          onClick={handleCapture}
          disabled={!ready}
          aria-label="사진 찍기"
          className="w-20 h-20 rounded-full border-4 border-white bg-white/20 disabled:opacity-40 active:scale-90 transition-transform"
        />
        <div className="w-16" />
      </div>
    </div>
  );
}
