const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const gallery = document.getElementById("gallery");
const statusText = document.getElementById("status");
const photoCount = document.getElementById("photoCount");
const qrContainer = document.getElementById("qrContainer");
const qrCanvas = document.getElementById("qr");

const startCameraBtn = document.getElementById("startCameraBtn");
const captureBtn = document.getElementById("captureBtn");
const stopCameraBtn = document.getElementById("stopCameraBtn");
const generatePdfBtn = document.getElementById("generatePdfBtn");
const clearPhotosBtn = document.getElementById("clearPhotosBtn");

let stream = null;
let photos = [];
let peer = null;
let conn = null;

function setStatus(msg) {
  statusText.textContent = "Estado: " + msg;
}

function updateButtons() {
  const hasStream = !!stream;
  const hasPhotos = photos.length > 0;

  captureBtn.disabled = !hasStream;
  stopCameraBtn.disabled = !hasStream;
  generatePdfBtn.disabled = !hasPhotos;
  clearPhotosBtn.disabled = !hasPhotos;
}

function renderGallery() {
  gallery.innerHTML = "";
  photoCount.textContent = `${photos.length} foto${photos.length === 1 ? "" : "s"}`;

  if (!photos.length) {
    gallery.innerHTML = `<p style="grid-column:1/-1;color:#6b7280;margin:0;">No hay fotos todavía.</p>`;
    updateButtons();
    return;
  }

  photos.forEach((src, index) => {
    const div = document.createElement("div");
    div.className = "photo-item";

    const img = document.createElement("img");
    img.src = src;
    img.alt = `Foto ${index + 1}`;

    const meta = document.createElement("div");
    meta.className = "photo-meta";
    meta.textContent = `Foto ${index + 1}`;

    div.appendChild(img);
    div.appendChild(meta);
    gallery.appendChild(div);
  });

  updateButtons();
}

async function startCamera() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const hasCam = devices.some(d => d.kind === "videoinput");

    if (!hasCam) {
      activarQR();
      return;
    }

    stopCamera();

    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });

    video.srcObject = stream;
    await video.play();

    qrContainer.style.display = "none";
    setStatus("cámara del PC activa");
    updateButtons();
  } catch (e) {
    console.error(e);
    activarQR();
  }
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  video.srcObject = null;
  updateButtons();
}

function activarQR() {
  qrContainer.style.display = "block";
  setStatus("sin cámara en PC, escanea el QR con tu Android");

  if (peer) return;

  peer = new Peer();

  peer.on("open", async (id) => {
    const mobileUrl = `${location.origin}${location.pathname.replace("index.html", "")}mobile.html?peer=${encodeURIComponent(id)}`;
    await QRCode.toCanvas(qrCanvas, mobileUrl, { width: 220, margin: 2 });
    setStatus("QR listo, espera conexión del celular");
  });

  peer.on("connection", (c) => {
    conn = c;

    conn.on("open", () => {
      setStatus("celular conectado");
    });

    conn.on("data", (data) => {
      if (data?.type === "photo" && data.image) {
        photos.push(data.image);
        renderGallery();
        setStatus(`foto recibida desde celular (${photos.length})`);
      }
    });

    conn.on("close", () => {
      setStatus("celular desconectado");
    });

    conn.on("error", (err) => {
      console.error(err);
      setStatus("error en conexión con celular");
    });
  });

  peer.on("error", (err) => {
    console.error(err);
    setStatus("error creando conexión QR");
  });
}

function getCurrentLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
      },
      (error) => {
        console.warn("Geolocalización no disponible:", error);
        resolve(null);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  });
}

async function getPlaceName(latitude, longitude) {
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=es`;
    const response = await fetch(url);
    const data = await response.json();

    const city =
      data?.city ||
      data?.locality ||
      data?.principalSubdivision ||
      "Ubicación desconocida";

    const country = data?.countryName || "";

    return [city, country].filter(Boolean).join(", ");
  } catch (error) {
    console.error("Error lugar:", error);
    return "Ubicación no disponible";
  }
}

async function capturePhoto() {
  if (!stream) return;

  try {
    setStatus("obteniendo ubicación y capturando foto...");

    const location = await getCurrentLocation();
    let place = "Ubicación no disponible";

    if (location) {
      place = await getPlaceName(location.latitude, location.longitude);
    }

    const ctx = canvas.getContext("2d");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    ctx.drawImage(video, 0, 0);

    const now = new Date();
    const fecha = now.toLocaleDateString("es-CO");
    const hora = now.toLocaleTimeString("es-CO");

    const lines = [
      "WEFONE",
      `Fecha: ${fecha}`,
      `Hora: ${hora}`,
      `Lugar: ${place}`
    ];

    const baseFont = Math.max(20, Math.floor(canvas.width * 0.022));
    const lineHeight = baseFont + 10;
    const padding = 16;
    const boxWidth = Math.min(canvas.width * 0.72, 700);
    const boxHeight = lines.length * lineHeight + padding * 2;
    const boxX = 12;
    const boxY = canvas.height - boxHeight - 12;

    ctx.fillStyle = "rgba(0,0,0,0.62)";
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.fillStyle = "#fff";

    lines.forEach((line, index) => {
      ctx.font = index === 0
        ? `bold ${baseFont + 4}px Arial`
        : `bold ${baseFont}px Arial`;

      const x = boxX + padding;
      const y = boxY + padding + index * lineHeight;

      ctx.strokeText(line, x, y);
      ctx.fillText(line, x, y);
    });

    const img = canvas.toDataURL("image/jpeg", 0.9);
    photos.push(img);

    renderGallery();
    setStatus(`foto tomada en PC con ubicación (${photos.length})`);
  } catch (error) {
    console.error(error);
    setStatus("error al capturar foto");
    alert("No se pudo capturar la foto con ubicación.");
  }
}

function fitImage(imgWidth, imgHeight, pageWidth, pageHeight, margin = 10) {
  const maxWidth = pageWidth - margin * 2;
  const maxHeight = pageHeight - margin * 2;

  let width = maxWidth;
  let height = (imgHeight * width) / imgWidth;

  if (height > maxHeight) {
    height = maxHeight;
    width = (imgWidth * height) / imgHeight;
  }

  return {
    x: (pageWidth - width) / 2,
    y: (pageHeight - height) / 2,
    width,
    height
  };
}

async function generatePdf() {
  if (!photos.length) {
    alert("No hay fotos para generar el PDF.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  for (let i = 0; i < photos.length; i++) {
    const img = new Image();
    img.src = photos[i];

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });

    if (i > 0) pdf.addPage();

    const fitted = fitImage(img.width, img.height, pageWidth, pageHeight, 8);
    pdf.addImage(photos[i], "JPEG", fitted.x, fitted.y, fitted.width, fitted.height);
  }

  pdf.save(`wefone_fotos_${new Date().toISOString().slice(0,19).replace(/[:T]/g,"-")}.pdf`);
  setStatus("PDF generado correctamente");
}

function clearPhotos() {
  photos = [];
  renderGallery();
  setStatus("fotos eliminadas");
}

startCameraBtn.addEventListener("click", startCamera);
captureBtn.addEventListener("click", capturePhoto);
stopCameraBtn.addEventListener("click", () => {
  stopCamera();
  setStatus("cámara cerrada");
});
generatePdfBtn.addEventListener("click", generatePdf);
clearPhotosBtn.addEventListener("click", clearPhotos);

renderGallery();
setStatus("esperando acción");
updateButtons();