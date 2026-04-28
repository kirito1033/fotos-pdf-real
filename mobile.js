const video = document.getElementById("video");
const captureBtn = document.getElementById("captureBtn");
const statusText = document.getElementById("status");

const params = new URLSearchParams(location.search);
const peerId = params.get("peer");

let peer = null;
let conn = null;
let stream = null;

function setStatus(msg) {
  statusText.textContent = "Estado: " + msg;
}

async function startMobileCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    });

    video.srcObject = stream;
    await video.play();
    setStatus("cámara del celular activa");
  } catch (err) {
    console.error(err);
    setStatus("no se pudo abrir la cámara");
    alert("No se pudo abrir la cámara del celular.");
  }
}

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

function capture() {
  if (!conn || conn.open !== true) {
    alert("La conexión con el PC aún no está lista.");
    return;
  }

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0);

  const now = new Date();
  const text = "WEFONE " + now.toLocaleString("es-CO");

  ctx.font = `bold ${Math.max(20, Math.floor(canvas.width * 0.03))}px Arial`;
  const pad = 16;
  const textWidth = ctx.measureText(text).width;
  const boxWidth = textWidth + pad * 2;
  const boxHeight = 42;
  const boxX = 12;
  const boxY = canvas.height - boxHeight - 12;

  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

  ctx.fillStyle = "#fff";
  ctx.textBaseline = "middle";
  ctx.fillText(text, boxX + pad, boxY + boxHeight / 2);

  const img = canvas.toDataURL("image/jpeg", 0.9);

  conn.send({
    type: "photo",
    image: img
  });

  setStatus("foto enviada al PC");
}

captureBtn.addEventListener("click", capture);

initPeer();
startMobileCamera();
setStatus("iniciando...");