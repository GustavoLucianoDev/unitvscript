import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const PORT = 3000;

// CONFIGURAÇÃO
const BASE_URL = "http://lhkes.eug2hdnj.com/live/pt_ZXD22101FF080BC39_720p/";
const FILE_PREFIX = "pt_ZXD22101FF080BC39_720p_shisui_";

// Estado dinâmico
let currentId = null;
let mediaSequence = 1;
let segments = [];
const WINDOW_SIZE = 8;

let intervalId = null;

// ----------------------------------------

function buildTsUrl(id) {
  return `${BASE_URL}${FILE_PREFIX}${id}.ts`;
}

// testa se URL existe
async function testUrl(id) {
  const url = buildTsUrl(id);
  try {
    await axios.head(url, { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

// tenta descobrir próximo segmento
async function discoverNextSegment() {
  if (!currentId) return null;

  const base = currentId + 5000;

  const candidates = [
    base,
    base - 1,
    base + 1,
    base - 2,
    base + 2,
  ];

  for (let id of candidates) {
    const ok = await testUrl(id);
    if (ok) return id;
    else console.log(`Segmento ${id} não encontrado.`);
  }

  return null;
}

// atualização da playlist
async function updatePlaylist() {
  const nextId = await discoverNextSegment();

  if (!nextId) {
    return;
  }

  currentId = nextId;

  segments.push({
    id: nextId,
    url: buildTsUrl(nextId),
  });

  if (segments.length > WINDOW_SIZE) {
    segments.shift();
    mediaSequence++;
  }

  console.log("Novo segmento:", nextId);
}

// ----------------------------------------
// ROTAS DE CONTROLE
// ----------------------------------------

// definir currentId
app.post("/set-current-id", (req, res) => {
  const { id } = req.body;

  if (!id || isNaN(id)) {
    return res.status(400).json({ error: "ID inválido" });
  }

  currentId = Number(id);
  mediaSequence = 1;
  segments = [];

  res.json({
    message: "currentId atualizado",
    currentId,
  });
});

// iniciar intervalo
app.post("/start", (req, res) => {
  if (!currentId) {
    return res.status(400).json({ error: "Defina o currentId primeiro" });
  }

  if (intervalId) {
    return res.json({ message: "Intervalo já está rodando" });
  }

  intervalId = setInterval(updatePlaylist, 1000);

  res.json({ message: "Intervalo iniciado" });
});

// parar intervalo
app.post("/stop", (req, res) => {
  if (!intervalId) {
    return res.json({ message: "Intervalo não está rodando" });
  }

  clearInterval(intervalId);
  intervalId = null;

  res.json({ message: "Intervalo parado" });
});

// status
app.get("/status", (req, res) => {
  res.json({
    running: !!intervalId,
    currentId,
    mediaSequence,
    segmentsCount: segments.length,
  });
});

// ----------------------------------------
// ROTAS HLS
// ----------------------------------------

app.get("/master.m3u8", (req, res) => {
  res.setHeader("Content-Type", "application/vnd.apple.mpegurl");

  const master = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720
/live.m3u8
`;

  res.send(master);
});

app.get("/live.m3u8", (req, res) => {
  res.setHeader("Content-Type", "application/vnd.apple.mpegurl");

  let playlist = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:5
#EXT-X-MEDIA-SEQUENCE:${mediaSequence}
`;

  for (let seg of segments) {
    playlist += `#EXTINF:5.000,\n`;
    playlist += `${seg.url}\n`;
  }

  res.send(playlist);
});

// ----------------------------------------

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
