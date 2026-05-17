const video = document.getElementById("video");
const captureBtn = document.getElementById("captureBtn");
const statusText = document.getElementById("status");

const params = new URLSearchParams(location.search);
const peerId = params.get("peer");

let peer = null;
let conn = null;
let stream = null;
let videoTrack = null;

let maxZoom = 1;
let minZoom = 1;
let currentZoom = 1;

let pinchStartDistance = null;
let pinchStartZoom = 1;
let focusBox = null;

/* ==========================================================
   UTILIDADES
========================================================== */

function setStatus(msg) {
  statusText.textContent = "Estado: " + msg;
}

function getTouchDistance(touch1, touch2) {
  const dx = touch2.clientX - touch1.clientX;
  const dy = touch2.clientY - touch1.clientY;
  return Math.hypot(dx, dy);
}

/* ==========================================================
   INDICADOR VISUAL DE ENFOQUE
========================================================== */

function showFocusIndicator(x, y) {
  if (!focusBox) {
    focusBox = document.createElement("div");
    focusBox.style.position = "fixed";
    focusBox.style.width = "72px";
    focusBox.style.height = "72px";
    focusBox.style.border = "2px solid #ffd54a";
    focusBox.style.borderRadius = "14px";
    focusBox.style.pointerEvents = "none";
    focusBox.style.transform = "translate(-50%, -50%) scale(1)";
    focusBox.style.transition = "transform 160ms ease, opacity 220ms ease";
    focusBox.style.zIndex = "9999";
    focusBox.style.boxShadow = "0 0 0 9999px rgba(0,0,0,0)";
    document.body.appendChild(focusBox);
  }

  focusBox.style.left = `${x}px`;
  focusBox.style.top = `${y}px`;
  focusBox.style.opacity = "1";
  focusBox.style.transform = "translate(-50%, -50%) scale(1.08)";

  setTimeout(() => {
    if (focusBox) {
      focusBox.style.transform = "translate(-50%, -50%) scale(1)";
    }
  }, 80);

  setTimeout(() => {
    if (focusBox) {
      focusBox.style.opacity = "0";
    }
  }, 700);
}

/* ==========================================================
   TAP TO FOCUS
========================================================== */

async function refocusAtPoint(clientX, clientY) {
  if (!videoTrack) return;

  const capabilities = videoTrack.getCapabilities
    ? videoTrack.getCapabilities()
    : null;

  const rect = video.getBoundingClientRect();
  const x = (clientX - rect.left) / rect.width;
  const y = (clientY - rect.top) / rect.height;

  const normalizedX = Math.min(Math.max(x, 0), 1);
  const normalizedY = Math.min(Math.max(y, 0), 1);

  try {
    if (capabilities?.focusMode) {
      const modes = Array.isArray(capabilities.focusMode)
        ? capabilities.focusMode
        : [];

      if (modes.includes("single-shot")) {
        const advanced = [{ focusMode: "single-shot" }];

        if (capabilities.pointsOfInterest) {
          advanced.push({
            pointsOfInterest: [{ x: normalizedX, y: normalizedY }],
          });
        }

        await videoTrack.applyConstraints({ advanced });
        return;
      }

      if (modes.includes("continuous")) {
        const advanced = [{ focusMode: "continuous" }];

        if (capabilities.pointsOfInterest) {
          advanced.push({
            pointsOfInterest: [{ x: normalizedX, y: normalizedY }],
          });
        }

        await videoTrack.applyConstraints({ advanced });
        return;
      }
    }

    await videoTrack.applyConstraints({
      advanced: [{ focusMode: "continuous" }],
    });
  } catch (err) {
    console.warn("No se pudo aplicar tap-to-focus:", err);
  }
}

/* ==========================================================
   ZOOM
========================================================== */

async function setZoom(newZoom) {
  if (!videoTrack) return;

  const capabilities = videoTrack.getCapabilities
    ? videoTrack.getCapabilities()
    : null;

  if (!capabilities || !("zoom" in capabilities)) {
    return;
  }

  const clamped = Math.min(Math.max(newZoom, minZoom), maxZoom);

  try {
    await videoTrack.applyConstraints({
      advanced: [{ zoom: clamped }],
    });

    currentZoom = clamped;
    setStatus(`cámara activa · zoom ${currentZoom.toFixed(1)}x`);
  } catch (err) {
    console.error("Error aplicando zoom:", err);
  }
}

/* ==========================================================
   GESTOS (PINCH ZOOM + TAP FOCUS)
========================================================== */

function initPinchZoom() {
  // Click con mouse
  video.addEventListener("click", async (e) => {
    showFocusIndicator(e.clientX, e.clientY);
    await refocusAtPoint(e.clientX, e.clientY);
  });

  // Inicio del gesto de zoom
  video.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length === 2) {
        pinchStartDistance = getTouchDistance(
          e.touches[0],
          e.touches[1]
        );
        pinchStartZoom = currentZoom;
      }
    },
    { passive: false }
  );

  // Movimiento de zoom
  video.addEventListener(
    "touchmove",
    async (e) => {
      if (e.touches.length !== 2 || pinchStartDistance === null) return;

      e.preventDefault();

      const newDistance = getTouchDistance(
        e.touches[0],
        e.touches[1]
      );

      const scale = newDistance / pinchStartDistance;
      const zoomRange = maxZoom - minZoom;
      const sensitivity = 1.2;

      const newZoom =
        pinchStartZoom +
        (scale - 1) * zoomRange * sensitivity;

      await setZoom(newZoom);
    },
    { passive: false }
  );

  // Tap con un dedo para enfocar
  video.addEventListener(
    "touchend",
    async (e) => {
      if (
        e.changedTouches.length === 1 &&
        pinchStartDistance === null
      ) {
        const touch = e.changedTouches[0];
        showFocusIndicator(touch.clientX, touch.clientY);
        await refocusAtPoint(
          touch.clientX,
          touch.clientY
        );
      }
    },
    { passive: true }
  );

  // Finalizar gesto
  video.addEventListener(
    "touchend",
    () => {
      if (pinchStartDistance !== null) {
        pinchStartDistance = null;
      }
    },
    { passive: true }
  );

  video.addEventListener(
    "touchcancel",
    () => {
      pinchStartDistance = null;
    },
    { passive: true }
  );
}

/* ==========================================================
   CÁMARA DEL CELULAR
========================================================== */

async function startMobileCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });

    videoTrack = stream.getVideoTracks()[0];

    const capabilities = videoTrack.getCapabilities
      ? videoTrack.getCapabilities()
      : null;

    // Configurar zoom si está disponible
    if (capabilities && "zoom" in capabilities) {
      minZoom = capabilities.zoom.min ?? 1;
      maxZoom = capabilities.zoom.max ?? 1;
      currentZoom = minZoom;

      await videoTrack.applyConstraints({
        advanced: [{ zoom: currentZoom }],
      });
    }

    video.srcObject = stream;
    await video.play();

    initPinchZoom();

    setStatus(
      maxZoom > minZoom
        ? `cámara del celular activa · zoom ${currentZoom.toFixed(1)}x`
        : "cámara del celular activa"
    );
  } catch (err) {
    console.error(err);
    setStatus("no se pudo abrir la cámara");
    alert("No se pudo abrir la cámara del celular.");
  }
}

/* ==========================================================
   CONEXIÓN PEERJS
========================================================== */

function initPeer() {
  if (!peerId) {
    setStatus("falta peer id");
    return;
  }

  peer = new Peer();

  peer.on("open", () => {
    conn = peer.connect(peerId);

    conn.on("open", () => {
      setStatus("conectado al PC");
      captureBtn.disabled = false;
    });

    conn.on("data", async (data) => {
      if (data && data.type === "request-photo") {
        await capture();
      }
    });

    conn.on("close", () => {
      setStatus("conexión cerrada");
      captureBtn.disabled = true;
    });

    conn.on("error", (err) => {
      console.error(err);
      setStatus("error de conexión");
    });
  });

  peer.on("error", (err) => {
    console.error(err);
    setStatus("error inicializando Peer");
  });
}

/* ==========================================================
   CAPTURA DE FOTO CON MARCA DE AGUA
   (UBICACIÓN FIJA: BOGOTÁ - COLOMBIA)
========================================================== */

async function capture() {
  if (!conn || conn.open !== true) {
    alert("La conexión con el PC aún no está lista.");
    return;
  }

  try {
    setStatus("capturando foto...");

    // Ubicación fija para evitar demoras del GPS
    const place = "Bogotá - Colombia";

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
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

    const fontSize = Math.max(
      24,
      Math.floor(canvas.width * 0.03)
    );

    const lineHeight = fontSize + 10;
    const padding = 16;
    const boxWidth = Math.min(canvas.width * 0.78, 760);
    const boxHeight =
      lines.length * lineHeight + padding * 2;

    const boxX = 12;
    const boxY = canvas.height - boxHeight - 12;

    // Fondo de la marca de agua
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

    // Configuración del texto
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 2;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    // Dibujar texto
    lines.forEach((line, index) => {
      ctx.font =
        index === 0
          ? `bold ${fontSize + 4}px Arial`
          : `bold ${fontSize}px Arial`;

      const x = boxX + padding;
      const y = boxY + padding + index * lineHeight;

      ctx.strokeText(line, x, y);
      ctx.fillText(line, x, y);
    });

    // Convertir imagen a base64
    const img = canvas.toDataURL("image/jpeg", 0.95);

    // Enviar al PC
    conn.send({
      type: "photo",
      image: img
    });

    setStatus("foto enviada al PC");
  } catch (error) {
    console.error(error);
    setStatus("error al capturar foto");
    alert("No se pudo capturar la foto.");
  }
}

/* ==========================================================
   EVENTOS E INICIALIZACIÓN
========================================================== */

captureBtn.addEventListener("click", capture);

initPeer();
startMobileCamera();
setStatus("iniciando...");