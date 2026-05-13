/* eslint-disable no-unused-vars */
'use client';

import { useEffect, useRef, useState } from 'react';

interface CameraModalProps {
  isOpen: boolean;
  onCapture: (capturedFile: File) => void;
  onClose: () => void;
  /** 카메라 실패 시 대체 갤러리 input의 id */
  galleryInputId: string;
}

export default function CameraModal({ isOpen, onCapture, onClose, galleryInputId }: CameraModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onCloseRef = useRef(onClose);
  const [ready, setReady] = useState(false);
  const [cameraError, setCameraError] = useState(false);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    setReady(false);
    setCameraError(false);

    let cancelled = false;

    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        if (!cancelled) setCameraError(true);
        return;
      }

      let stream: MediaStream | null = null;
      try {
        // 후면 카메라 강제 (exact)
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
          if (!cancelled) setCameraError(true);
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
      <canvas ref={canvasRef} className="hidden" />

      {cameraError ? (
        /* 카메라 접근 실패 → 갤러리 fallback */
        <div className="flex flex-col items-center justify-center flex-1 gap-6 px-8 text-center">
          <p className="text-5xl">📵</p>
          <p className="text-white text-lg font-semibold">카메라를 열 수 없습니다</p>
          <p className="text-slate-400 text-sm leading-relaxed">
            카메라 권한이 없거나 지원하지 않는 환경입니다.
            <br />갤러리에서 사진을 선택해주세요.
          </p>
          {/* label/htmlFor 로 programmatic click 없이 갤러리 열기 */}
          <label
            htmlFor={galleryInputId}
            onClick={handleClose}
            className="block w-full max-w-xs rounded-2xl bg-white text-black py-4 text-base font-semibold text-center cursor-pointer active:opacity-80"
          >
            🖼️ 갤러리에서 선택
          </label>
          <button
            type="button"
            onClick={handleClose}
            className="text-slate-500 text-sm"
          >
            닫기
          </button>
        </div>
      ) : (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="flex-1 w-full object-cover"
          />
          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <p className="text-white text-sm bg-black/60 px-4 py-2 rounded-full">
                카메라 시작 중...
              </p>
            </div>
          )}
          <div className="flex items-center justify-between px-8 py-8 bg-black">
            <button
              type="button"
              onClick={handleClose}
              className="w-16 text-white text-base font-medium text-left"
            >
              취소
            </button>
            {/* 셔터 버튼 */}
            <button
              type="button"
              onClick={handleCapture}
              disabled={!ready}
              aria-label="사진 찍기"
              className="w-20 h-20 rounded-full border-4 border-white bg-white/20 disabled:opacity-40 active:scale-90 transition-transform"
            />
            <div className="w-16" />
          </div>
        </>
      )}
    </div>
  );
}
