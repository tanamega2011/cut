import {
  Input,
  ALL_FORMATS,
  BlobSource,
  VideoSampleSink,
} from "https://cdn.jsdelivr.net/npm/mediabunny@1.61.0/dist/bundles/mediabunny.mjs";
import JSZip from "https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm";

const $ = (id) => document.getElementById(id);
const fileInput = $("fileInput"), chooseBtn = $("chooseBtn"), dropzone = $("dropzone");
const video = $("video"), videoInfo = $("videoInfo"), controls = $("controls");
const gallery = $("gallery"), status = $("status"), progressWrap = $("progressWrap");
const progressBar = $("progressBar"), progressText = $("progressText");
const extractBtn = $("extractBtn"), stopBtn = $("stopBtn"), zipBtn = $("zipBtn");
const previewModal = $("previewModal"), previewImage = $("previewImage");
const previewCaption = $("previewCaption"), previewClose = $("previewClose");
const previewPrev = $("previewPrev"), previewNext = $("previewNext");
const previewBackdrop = $("previewBackdrop");

let objectUrl = null, frames = [], stopped = false, currentFile = null;
let currentInput = null, currentTrack = null, expectedFrameCount = null, previewIndex = -1;

function fmtTime(seconds) {
  if (!Number.isFinite(seconds)) return "—";
  const total = Math.max(0, seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = (total % 60).toFixed(2).padStart(5, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}
function setStatus(message) { status.textContent = message || ""; }
function setProgress(value) {
  const p = Math.max(0, Math.min(100, value));
  progressBar.style.width = `${p}%`;
  progressText.textContent = `${Math.round(p)}%`;
}
function updateZipButton() {
  zipBtn.disabled = frames.length === 0;
}
function resetGallery() {
  for (const frame of frames) URL.revokeObjectURL(frame.url);
  frames = [];
  gallery.innerHTML = "";
  updateZipButton();
}
function openPreview(index) {
  if (!frames[index]) return;
  previewIndex = index;
  previewImage.src = frames[index].url;
  previewCaption.textContent = `#${index + 1} · ${fmtTime(frames[index].time)}`;
  previewModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}
function closePreview() {
  previewModal.classList.add("hidden");
  document.body.style.overflow = "";
  previewImage.removeAttribute("src");
  previewIndex = -1;
}
function movePreview(delta) {
  if (!frames.length) return;
  openPreview((previewIndex + delta + frames.length) % frames.length);
}
function addFrame(url, timestamp, index, blob) {
  const card = document.createElement("article");
  card.className = "frame";
  const img = document.createElement("img");
  img.src = url; img.alt = `Frame ${index + 1}`; img.loading = "lazy";
  img.addEventListener("click", () => openPreview(index));
  const footer = document.createElement("footer");
  const label = document.createElement("span");
  label.textContent = `#${index + 1} · ${fmtTime(timestamp)}`;
  const link = document.createElement("a");
  link.href = url;
  link.download = `frame-${String(index + 1).padStart(5, "0")}.jpg`;
  link.textContent = "Download";
  footer.append(label, link); card.append(img, footer); gallery.append(card);
}
previewClose.onclick = closePreview;
previewBackdrop.onclick = closePreview;
previewPrev.onclick = () => movePreview(-1);
previewNext.onclick = () => movePreview(1);
previewImage.onclick = () => movePreview(1);

async function closeCurrentInput() {
  if (currentInput) { try { currentInput.dispose(); } catch {} }
  currentInput = null; currentTrack = null; expectedFrameCount = null;
}

async function inspectVideo(file) {
  await closeCurrentInput();
  setStatus("กำลังอ่านข้อมูลวิดีโอ…");
  $("duration").textContent = "กำลังอ่าน…";
  $("frameCount").textContent = "กำลังนับ…";
  $("fps").textContent = "กำลังตรวจ…";

  currentInput = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  currentTrack = await currentInput.getPrimaryVideoTrack();
  if (!currentTrack) throw new Error("ไม่พบ video track ในไฟล์นี้");
  if (!(await currentTrack.canDecode())) {
    throw new Error("เบราว์เซอร์นี้ไม่สามารถถอดรหัส codec ของวิดีโอนี้ได้");
  }

  const duration = await currentTrack.computeDuration();
  const metrics = await currentTrack.computeFrameRateMetrics();
  const packetStats = await currentTrack.computePacketStats(Infinity);

  // For a video track, each encoded packet represents one video frame.
  expectedFrameCount = packetStats.packetCount;

  $("duration").textContent = fmtTime(duration);
  const fpsValue = metrics.underlyingFrameRate ?? metrics.bestGuessFrameRate ?? metrics.averageFrameRate;
  $("fps").textContent = Number.isFinite(fpsValue)
    ? `${fpsValue.toFixed(fpsValue >= 10 ? 2 : 3).replace(/0+$/, "").replace(/\.$/, "")} FPS`
    : "ไม่สามารถตรวจได้";
  $("frameCount").textContent = `${expectedFrameCount.toLocaleString()} เฟรม`;
  setStatus(metrics.frameRateIsConstant
    ? "พร้อมดึงทุกเฟรมของวิดีโอ"
    : "พร้อมดึงทุกเฟรมของวิดีโอ (VFR)");
}

async function loadFile(file) {
  if (!file || (!file.type.startsWith("video/") &&
      !/\.(mp4|webm|mov|m4v|mkv|ts)$/i.test(file.name))) {
    setStatus("กรุณาเลือกไฟล์วิดีโอที่รองรับ"); return;
  }
  currentFile = file; stopped = false; resetGallery();
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(file);
  video.src = objectUrl; video.load();
  videoInfo.classList.remove("hidden"); controls.classList.remove("hidden");
  progressWrap.classList.add("hidden");
  try {
    await inspectVideo(file);
  } catch (error) {
    console.error(error);
    await closeCurrentInput();
    $("duration").textContent = "—"; $("frameCount").textContent = "—"; $("fps").textContent = "—";
    setStatus(`ไม่สามารถอ่านวิดีโอได้: ${error?.message || error}`);
  }
}
chooseBtn.onclick = () => fileInput.click();
dropzone.addEventListener("click", (event) => { if (event.target === dropzone) fileInput.click(); });
dropzone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") fileInput.click();
});
fileInput.onchange = () => loadFile(fileInput.files[0]);
for (const eventName of ["dragenter", "dragover"]) {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault(); dropzone.classList.add("drag");
  });
}
for (const eventName of ["dragleave", "drop"]) {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault(); dropzone.classList.remove("drag");
  });
}
dropzone.addEventListener("drop", (event) => loadFile(event.dataTransfer.files[0]));

function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
}

async function extractAllFrames() {
  if (!currentFile || !currentTrack || !expectedFrameCount) return;

  stopped = false; stopBtn.disabled = false; extractBtn.disabled = true; zipBtn.disabled = true;
  progressWrap.classList.remove("hidden"); setProgress(0); resetGallery();

  const sink = new VideoSampleSink(currentTrack);
  const width = await currentTrack.getDisplayWidth();
  const height = await currentTrack.getDisplayHeight();
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });

  let extracted = 0, lastUiUpdate = 0;
  setStatus(`กำลังถอดรหัสและดึงเฟรม 0 / ${expectedFrameCount.toLocaleString()}…`);

  try {
    for await (const sample of sink.samples()) {
      if (stopped) { sample.close(); break; }

      // Mediabunny decodes actual video samples in presentation order.
      // draw() also applies the video's rotation/flip metadata.
      sample.draw(ctx, 0, 0, canvas.width, canvas.height);
      const timestamp = sample.timestamp;
      sample.close();

      const blob = await canvasToBlob(canvas);
      if (!blob) throw new Error("ไม่สามารถสร้างภาพจากเฟรมได้");

      const url = URL.createObjectURL(blob);
      frames.push({ url, time: timestamp, blob });
      addFrame(url, timestamp, extracted, blob);
      extracted++;

      const now = performance.now();
      if (now - lastUiUpdate > 50 || extracted === expectedFrameCount) {
        lastUiUpdate = now;
        setProgress((extracted / expectedFrameCount) * 100);
        setStatus(`กำลังถอดรหัสและดึงเฟรม ${extracted.toLocaleString()} / ${expectedFrameCount.toLocaleString()}…`);
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    }
  } catch (error) {
    console.error(error);
    setStatus(`เกิดข้อผิดพลาดระหว่างดึงเฟรม: ${error?.message || error}`);
  } finally {
    stopBtn.disabled = true; extractBtn.disabled = false;
    updateZipButton();
    setProgress((extracted / expectedFrameCount) * 100);

    if (stopped) {
      setStatus(`หยุดแล้ว: ได้ ${extracted.toLocaleString()} จาก ${expectedFrameCount.toLocaleString()} เฟรม`);
    } else if (extracted === expectedFrameCount) {
      setProgress(100);
      setStatus(`เสร็จแล้ว: ได้ครบ ${extracted.toLocaleString()} เฟรม`);
    } else {
      setStatus(`เสร็จแต่จำนวนไม่ตรง: ได้ ${extracted.toLocaleString()} จาก ${expectedFrameCount.toLocaleString()} เฟรม`);
    }
  }
}

async function downloadAllAsZip() {
  if (!frames.length) return;

  zipBtn.disabled = true;
  extractBtn.disabled = true;
  const originalText = zipBtn.textContent;
  zipBtn.textContent = "กำลังสร้าง ZIP…";
  setStatus(`กำลังสร้างไฟล์ ZIP (${frames.length.toLocaleString()} เฟรม)…`);

  try {
    const zip = new JSZip();
    for (let i = 0; i < frames.length; i++) {
      const name = `frame-${String(i + 1).padStart(5, "0")}.jpg`;
      zip.file(name, frames[i].blob);
    }

    const zipBlob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 }
    });

    const baseName = currentFile
      ? currentFile.name.replace(/\.[^.]+$/, "")
      : "stillcut-frames";
    const zipName = `${baseName}-frames.zip`;

    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = zipName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);

    setStatus(`ดาวน์โหลด ZIP เสร็จแล้ว: ${frames.length.toLocaleString()} เฟรม`);
  } catch (error) {
    console.error(error);
    setStatus(`เกิดข้อผิดพลาดในการสร้าง ZIP: ${error?.message || error}`);
  } finally {
    zipBtn.textContent = originalText;
    updateZipButton();
    extractBtn.disabled = false;
  }
}

extractBtn.onclick = extractAllFrames;
stopBtn.onclick = () => { stopped = true; };
zipBtn.onclick = downloadAllAsZip;

document.addEventListener("keydown", (event) => {
  if (!previewModal.classList.contains("hidden")) {
    if (event.key === "Escape") closePreview();
    else if (event.key === "ArrowRight") movePreview(1);
    else if (event.key === "ArrowLeft") movePreview(-1);
  }
});
window.addEventListener("beforeunload", () => {
  for (const frame of frames) URL.revokeObjectURL(frame.url);
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  if (currentInput) { try { currentInput.dispose(); } catch {} }
});
