let activeStream: MediaStream | null = null;

export async function startWebcam(
  videoEl: HTMLVideoElement
): Promise<MediaStream> {
  if (activeStream) return activeStream;
  const stream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: false,
  });
  videoEl.srcObject = stream;
  activeStream = stream;
  return stream;
}

export function stopWebcam() {
  if (activeStream) {
    activeStream.getTracks().forEach((t) => t.stop());
    activeStream = null;
  }
}

export function captureFrame(videoEl: HTMLVideoElement): Blob | null {
  if (!videoEl.videoWidth) return null;
  const canvas = document.createElement("canvas");
  const w = Math.min(videoEl.videoWidth, 640);
  const h = Math.round((w / videoEl.videoWidth) * videoEl.videoHeight);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(videoEl, 0, 0, w, h);

  // Synchronous toDataURL → Blob conversion
  const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
  const bin = atob(dataUrl.split(",")[1]);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: "image/jpeg" });
}

export function isWebcamActive(): boolean {
  return activeStream !== null;
}
