import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const PORT = 3000;

const BASE_URL = "http://lhkes.eug2hdnj.com/live/pt_ZXD22101FF080BC39_720p/";
const FILE_PREFIX = "pt_ZXD22101FF080BC39_720p_shisui_";

let currentId = null;
let mediaSequence = 1;
let segments = [];
const WINDOW_SIZE = 8;

let intervalId = null;
let lastCheck = 0;

// -----------------------------

function buildTsUrl(id) {
  return `${BASE_URL}${FILE_PREFIX}${id}.ts`;
}

// agora usamos GET leve em vez de HEAD
async function testUrl(id) {
  const url = buildTsUrl(id);
  try {
    const res = await axios.get(url, {
      timeout: 2000,
      responseType: "stream", // não baixa tudo
      validateStatus: () => true
    });

    return res.status === 200;
  } catch {
    return false;
  }
}

// versão inteligente
async function discoverNextSegment() {
  if (!currentId) return null;

  const expected = currentId + 5000;

  // 🔥 1️⃣ testa apenas o esperado
  if (await testUrl(expected)) {
    return expected;
  }

  // 🔎 2️⃣ só se falhar testa variações
  const variations = [
    expected - 1,
    expected + 1,
    expected - 2,
    expected + 2,
  ];

  for (let id of variations) {
    if (await testUrl(id)) {
      return id;
    }
  }

  return null;
}

async function updatePlaylist() {
  const now = Date.now();

  // 🔥 garante 4 segundos entre testes reais
  if (now - lastCheck < 4000) return;
  lastCheck = now;

  const nextId = await discoverNextSegment();
  if (!nextId) {
    console.log("Nenhum novo segmento.");
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

// -----------------------------
// ROTAS DE CONTROLE
// -----------------------------

app.post("/set-current-id", (req, res) => {
  const { id } = req.body;

  if (!id || isNaN(id)) {
    return res.status(400).json({ error: "ID inválido" });
  }

  currentId = Number(id);
  mediaSequence = 1;
  segments = [];

  res.json({ message: "currentId atualizado", currentId });
});

app.post("/start", (req, res) => {
  if (!currentId) {
    return res.status(400).json({ error: "Defina o currentId primeiro" });
  }

  if (intervalId) {
    return res.json({ message: "Já está rodando" });
  }

  intervalId = setInterval(updatePlaylist, 1000);
  res.json({ message: "Sincronização iniciada" });
});

app.post("/stop", (req, res) => {
  if (!intervalId) {
    return res.json({ message: "Não está rodando" });
  }

  clearInterval(intervalId);
  intervalId = null;

  res.json({ message: "Sincronização parada" });
});

app.get("/status", (req, res) => {
  res.json({
    running: !!intervalId,
    currentId,
    segments: segments.length,
    mediaSequence
  });
});

// -----------------------------
// ROTAS HLS
// -----------------------------

app.get("/master.m3u8", (req, res) => {
  res.setHeader("Content-Type", "application/vnd.apple.mpegurl");

  res.send(`#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720
/live.m3u8
`);
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

// -----------------------------

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
