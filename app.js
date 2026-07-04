const gallery = document.getElementById("gallery");
const statusText = document.getElementById("status");
const photoCount = document.getElementById("photoCount");
const qrCanvas = document.getElementById("qr");
const pdfFileNameInput = document.getElementById("pdfFileName");

const startPeerBtn = document.getElementById("startPeerBtn");
const captureBtn = document.getElementById("captureBtn");
const stopPeerBtn = document.getElementById("stopPeerBtn");
const generatePdfBtn = document.getElementById("generatePdfBtn");
const clearPhotosBtn = document.getElementById("clearPhotosBtn");

let photos = [];
let peer = null;
let conn = null;

function setStatus(msg) {
  statusText.textContent = "Estado: " + msg;
}

function updateButtons() {
  const hasPhotos = photos.length > 0;
  const hasConn = !!conn && conn.open === true;

  captureBtn.disabled = !hasConn;
  stopPeerBtn.disabled = !hasConn;
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
    div.style.position = "relative";

    const img = document.createElement("img");
    img.src = src;
    img.alt = `Foto ${index + 1}`;
    img.style.width = "100%";
    img.style.borderRadius = "8px";

    const meta = document.createElement("div");
    meta.className = "photo-meta";
    meta.textContent = `Foto ${index + 1}`;
    meta.style.position = "absolute";
    meta.style.bottom = "8px";
    meta.style.left = "8px";
    meta.style.background = "rgba(0,0,0,0.7)";
    meta.style.color = "#fff";
    meta.style.padding = "4px 8px";
    meta.style.borderRadius = "4px";
    meta.style.fontSize = "12px";

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "🗑️";
    deleteBtn.title = "Eliminar esta foto";
    deleteBtn.style.position = "absolute";
    deleteBtn.style.top = "8px";
    deleteBtn.style.right = "8px";
    deleteBtn.style.background = "#ef4444";
    deleteBtn.style.color = "#fff";
    deleteBtn.style.border = "none";
    deleteBtn.style.borderRadius = "50%";
    deleteBtn.style.width = "32px";
    deleteBtn.style.height = "32px";
    deleteBtn.style.cursor = "pointer";
    deleteBtn.style.fontSize = "16px";
    deleteBtn.style.display = "flex";
    deleteBtn.style.alignItems = "center";
    deleteBtn.style.justifyContent = "center";
    deleteBtn.style.boxShadow = "0 2px 4px rgba(0,0,0,0.3)";

    deleteBtn.addEventListener("click", () => {
      if (confirm("¿Eliminar esta foto?")) {
        photos.splice(index, 1);
        renderGallery();
        setStatus(`foto eliminada (${photos.length} restantes)`);
      }
    });

    div.appendChild(img);
    div.appendChild(meta);
    div.appendChild(deleteBtn);
    gallery.appendChild(div);
  });

  updateButtons();
}

function initPeer() {
  if (peer) {
    peer.destroy();
    peer = null;
  }

  conn = null;
  peer = new Peer();

  peer.on("open", async (id) => {
    const basePath = location.pathname.replace("index.html", "");
    const mobileUrl = `${location.origin}${basePath}mobile.html?peer=${encodeURIComponent(id)}`;

    await QRCode.toCanvas(qrCanvas, mobileUrl, { width: 220, margin: 2 });

    setStatus("QR listo, espera conexión del celular");
    updateButtons();
  });

  peer.on("connection", (c) => {
    conn = c;

    conn.on("open", () => {
      setStatus("celular conectado, listo para recibir fotos");
      captureBtn.disabled = false;
      stopPeerBtn.disabled = false;
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
      conn = null;
      updateButtons();
    });

    conn.on("error", (err) => {
      console.error(err);
      setStatus("error en conexión con celular");
    });
  });

  peer.on("error", (err) => {
    console.error(err);
    setStatus("error creando Peer / QR");
  });
}

function getDefaultPdfName() {
  return `wefone_fotos_${new Date()
    .toISOString()
    .slice(0, 19)
    .replace(/[:T]/g, "-")}.pdf`;
}

function sanitizeFileName(name) {
  return name
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "_");
}

async function generatePdf() {
  if (!photos.length) {
    alert("No hay fotos para generar el PDF.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const fitImage = (imgWidth, imgHeight, margin = 8) => {
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
      height,
    };
  };

  for (let i = 0; i < photos.length; i++) {
    const img = new Image();
    img.src = photos[i];

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });

    if (i > 0) pdf.addPage();

    const fitted = fitImage(img.width, img.height, 8);
    pdf.addImage(photos[i], "JPEG", fitted.x, fitted.y, fitted.width, fitted.height);
  }

  const userFileName = sanitizeFileName(pdfFileNameInput.value || "");
  const finalFileName = userFileName ? `${userFileName}.pdf` : getDefaultPdfName();

  pdf.save(finalFileName);
  setStatus(`PDF generado correctamente: ${finalFileName}`);
}

function clearPhotos() {
  if (!photos.length) return;

  if (confirm("¿Eliminar TODAS las fotos?")) {
    photos = [];
    renderGallery();
    setStatus("fotos eliminadas");
  }
}

startPeerBtn.addEventListener("click", initPeer);

stopPeerBtn.addEventListener("click", () => {
  if (peer) {
    peer.destroy();
    peer = null;
    conn = null;
    setStatus("conexión cerrada");
    updateButtons();
  }
});

captureBtn.addEventListener("click", () => {
  if (conn && conn.open) {
    conn.send({ type: "request-photo" });
  }
});

generatePdfBtn.addEventListener("click", generatePdf);
clearPhotosBtn.addEventListener("click", clearPhotos);

renderGallery();
setStatus("haz clic en 'Nuevo QR' para iniciar");
updateButtons();
initPeer();
