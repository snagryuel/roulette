/**
 * 치지직 연동 프록시 서버
 * - Chzzk REST API를 서버 사이드에서 호출 (CORS 우회)
 * - 채팅 구독을 SSE(Server-Sent Events)로 프론트엔드에 중계
 */

const express = require('express');
const cors    = require('cors');
const { ChzzkClient } = require('chzzk');

const app  = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const client = new ChzzkClient();

/** channelId -> ChzzkChat instance */
const chatConnections = new Map();

/* ─────────────────────────────────────────────
   GET /chzzk/search?keyword=<검색어>
   채널 검색 (이름 또는 URL 슬러그)
───────────────────────────────────────────── */
app.get('/chzzk/search', async (req, res) => {
  const { keyword } = req.query;
  if (!keyword) return res.status(400).json({ error: 'keyword 파라미터가 필요합니다.' });

  try {
    const result = await client.search.channels(String(keyword), { size: 6, offset: 0 });
    // Channel: { channelId, channelName, channelImageUrl, openLive, followerCount }
    res.json({
      channels: result.channels.map(ch => ({
        channelId:   ch.channelId,
        channelName: ch.channelName,
        openLive:    ch.openLive,
        followerCount: ch.followerCount,
        channelImageUrl: ch.channelImageUrl,
      })),
    });
  } catch (e) {
    console.error('[search error]', e.message);
    res.status(500).json({ error: e.message });
  }
});

/* ─────────────────────────────────────────────
   GET /chzzk/live?channelId=<채널 ID>
   현재 방송 정보 조회
───────────────────────────────────────────── */
app.get('/chzzk/live', async (req, res) => {
  const { channelId } = req.query;
  if (!channelId) return res.status(400).json({ error: 'channelId 파라미터가 필요합니다.' });

  try {
    const detail = await client.live.detail(String(channelId));
    if (!detail) return res.json({ live: null });
    res.json({
      live: {
        liveTitle: detail.liveTitle,
        concurrentUserCount: detail.concurrentUserCount,
        categoryValue: detail.liveCategoryValue,
        chatChannelId: detail.chatChannelId,
      },
    });
  } catch (e) {
    console.error('[live error]', e.message);
    res.status(500).json({ error: e.message });
  }
});

/* ─────────────────────────────────────────────
   GET /chzzk/chat?channelId=<채널 ID>&command=!참여
   채팅 연결 후 SSE로 이벤트 스트리밍
   - type: connected   → 채팅 서버에 연결됨
   - type: participant → 참여 명령어 입력자
   - type: disconnected
   - type: error
───────────────────────────────────────────── */
app.get('/chzzk/chat', async (req, res) => {
  const channelId = String(req.query.channelId || '').trim();
  const command   = String(req.query.command   || '!참여').trim();

  if (!channelId) return res.status(400).json({ error: 'channelId 파라미터가 필요합니다.' });

  /* SSE 헤더 설정 */
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.flushHeaders();

  const send = (type, data = {}) => {
    try { res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`); } catch (_) {}
  };

  /* 기존 연결이 있으면 먼저 끊기 */
  const existing = chatConnections.get(channelId);
  if (existing) {
    try { existing.disconnect(); } catch (_) {}
    chatConnections.delete(channelId);
  }

  let chat;
  try {
    chat = client.chat({ channelId });

    chat.on('connect', (chatChannelId) => {
      console.log(`[✅ 연결됨] channelId=${channelId}, chatChannelId=${chatChannelId}`);
      console.log(`[명령어 감지 중] "${command}"`);
      send('connected', { channelId, chatChannelId });
    });

    chat.on('chat', (event) => {
      const msg      = (event.message || '').trim();
      const nickname = event.profile?.nickname ?? '?';
      // 모든 채팅을 콘솔 출력 (디버그용)
      console.log(`[채팅] ${nickname}: "${msg}" | 일치=${msg === command}`);
      if (msg === command) {
        const uid = event.profile?.userIdHash ?? nickname;
        console.log(`[🎉 참여] ${nickname}`);
        send('participant', { nickname, uid });
      }
    });

    // 연결 자체 확인용
    chat.on('raw', (json) => {
      if (json.cmd === 10100) console.log('[raw] CONNECTED 패킷 수신됨');
    });

    chat.on('disconnect', () => {
      console.log(`[❌ 연결 해제] channelId=${channelId}`);
      send('disconnected', { channelId });
    });

    await chat.connect();
    chatConnections.set(channelId, chat);

    /* 클라이언트가 SSE 연결을 끊으면 채팅도 끊기 */
    req.on('close', () => {
      console.log(`[SSE close] disconnecting chat: ${channelId}`);
      try { chat.disconnect(); } catch (_) {}
      chatConnections.delete(channelId);
    });

  } catch (e) {
    console.error('[chat error]', e.message);
    send('error', { message: e.message });
    res.end();
  }
});

/* ─────────────────────────────────────────────
   POST /chzzk/disconnect  { channelId }
   채팅 연결 강제 해제
───────────────────────────────────────────── */
app.post('/chzzk/disconnect', (req, res) => {
  const { channelId } = req.body;
  const chat = chatConnections.get(String(channelId || ''));
  if (chat) {
    try { chat.disconnect(); } catch (_) {}
    chatConnections.delete(channelId);
  }
  res.json({ success: true });
});

/* ─────────────────────────────────────────────
   서버 시작
───────────────────────────────────────────── */
app.listen(PORT, () => {
  console.log('\n========================================');
  console.log('  🎮 구슬룰렛 × 치지직 연동 서버');
  console.log(`  ✅ http://localhost:${PORT}`);
  console.log('----------------------------------------');
  console.log('  프론트엔드는 별도로:');
  console.log('  npm run dev  →  http://localhost:1235');
  console.log('========================================\n');
});
