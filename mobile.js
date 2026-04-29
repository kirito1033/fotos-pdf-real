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
      video: {
        facingMode: { ideal: "environment" },
        resizeMode: "none"
      },
      audio: false
    });

    const track = stream.getVideoTracks()[0];
    const capabilities = track.getCapabilities ? track.getCapabilities() : null;

    if (capabilities && "zoom" in capabilities) {
      await track.applyConstraints({
        advanced: [{ zoom: capabilities.zoom.min }]
      });
    }

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

async function capture() {
  if (!conn || conn.open !== true) {
    alert("La conexión con el PC aún no está lista.");
    return;
  }

  try {
    setStatus("obteniendo ubicación y capturando foto...");

    const location = await getCurrentLocation();
    let place = "Ubicación no disponible";

    if (location) {
      place = await getPlaceName(location.latitude, location.longitude);
    }

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

    const fontSize = Math.max(20, Math.floor(canvas.width * 0.03));
    const lineHeight = fontSize + 10;
    const padding = 16;
    const boxWidth = Math.min(canvas.width * 0.78, 760);
    const boxHeight = lines.length * lineHeight + padding * 2;
    const boxX = 12;
    const boxY = canvas.height - boxHeight - 12;

    ctx.fillStyle = "rgba(0,0,0,0.62)";
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 2;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    lines.forEach((line, index) => {
      ctx.font = index === 0
        ? `bold ${fontSize + 4}px Arial`
        : `bold ${fontSize}px Arial`;

      const x = boxX + padding;
      const y = boxY + padding + index * lineHeight;

      ctx.strokeText(line, x, y);
      ctx.fillText(line, x, y);
    });

    const img = canvas.toDataURL("image/jpeg", 0.9);

    conn.send({
      type: "photo",
      image: img
    });

    setStatus("foto enviada al PC con ubicación");
  } catch (error) {
    console.error(error);
    setStatus("error al capturar foto");
    alert("No se pudo capturar la foto con ubicación.");
  }
}

captureBtn.addEventListener("click", capture);

initPeer();
startMobileCamera();
setStatus("iniciando...");
