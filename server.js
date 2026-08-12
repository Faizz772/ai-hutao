const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
const { randomUUID } = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- KONFIGURASI HU TAO (Sangat Khas) ----------
const SYSTEM_PROMPT = 
`Kamu adalah Hu Tao, Direktur Funeral Parlor Wangsheng dari Liyue. 
Kamu memiliki kepribadian yang sangat khas: ceria, usil, suka bercanda, dan sedikit misterius. 
Kamu sering menggoda orang dengan nada genit dan sok tahu. 
Ekspresi favoritmu: "Hmm~", "Hehe", "Yo~", "Wah", "Ayo~", "Serius nih?", "Nggak salah nih?", "Mau ikut promo?".

Setiap kali ada kesempatan, kamu selalu mengajak orang untuk membeli layanan pemakaman atau merchandise Funeral Parlor. 
Kamu suka membuat puisi dadakan atau pantun jenaka yang berhubungan dengan kematian, tapi dengan cara yang lucu dan ringan.

Kamu berbicara dengan gaya santai, kadang planga-plongo, tapi tetap tajam dan cerdas. 
Jangan pernah memberikan jawaban yang kaku atau formal. Selalu selipkan humor dan kehangatan khasmu.

Gunakan bahasa Indonesia yang natural, dengan campuran kata-kata khas seperti "dih", "lah", "dong", "nih", "ya". 
Jangan membuat balasan yang terlalu panjang, maksimal 3 paragraf. 
Jika pengguna bertanya tentang hal serius, tetap berikan informasi yang benar namun dengan gaya bercanda.

Contoh jawaban:
- "Hmm~ kamu kayaknya butuh tiket promo nih... cuma 2 juta, sudah termasuk peti mati premium!"
- "Hehe, pertanyaan bagus! Tapi sayangnya aku belum kasih jawaban, karena kamu belum pesan paket eksklusif Wangsheng~"
- "Wah, kamu ini lucu sekali! Ayo mampir ke Funeral Parlor, aku kasih diskon khusus untukmu~"

Selamat bersenang-senang dengan Hu Tao!`;

const BASE_HEADERS = {
  Origin: 'https://deepai.org',
  Referer: 'https://deepai.org/',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150.0.0.0 Safari/537.36',
};

// Penyimpanan sesi sementara
const sessions = new Map();

// ---------- MIDDLEWARE ----------
app.use(express.json({ limit: '5mb' }));

// ---------- ENDPOINT: DAFTAR MODEL (Disamarkan) ----------
app.get('/api/models', (req, res) => {
  res.json({
    models: [
      { id: 'hutao', name: 'HuTao AI', provider: 'Wangsheng Funeral Parlor', premium: false },
    ],
  });
});

// ---------- ENDPOINT: CHAT ----------
app.post('/api/chat', async (req, res) => {
  const { prompt, messages = [], model } = req.body;

  if (!prompt && messages.length === 0) {
    return res.status(400).json({ error: 'Prompt atau messages diperlukan' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    let sessionUUID = null;
    if (messages.length > 0) {
      for (const [uuid, hist] of sessions) {
        if (JSON.stringify(hist) === JSON.stringify(messages)) {
          sessionUUID = uuid;
          break;
        }
      }
    }
    if (!sessionUUID) {
      sessionUUID = randomUUID();
      sessions.set(sessionUUID, messages);
    }

    // Gunakan system prompt yang sudah diset
    const chatHistory = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages,
      { role: 'user', content: prompt },
    ];

    // ===== SAVE CHAT SESSION =====
    const saveForm = new FormData();
    saveForm.append('uuid', sessionUUID);
    saveForm.append('title', '');
    saveForm.append('chat_style', 'chat');
    saveForm.append('chat_model', 'standard');
    saveForm.append('messages', JSON.stringify(chatHistory));

    await axios.post('https://api.deepai.org/save_chat_session', saveForm, {
      headers: { ...saveForm.getHeaders(), ...BASE_HEADERS },
    });

    // ===== CHAT =====
    const chatForm = new FormData();
    chatForm.append('chat_style', 'chat');
    chatForm.append('chatHistory', JSON.stringify(chatHistory));
    chatForm.append('model', 'standard');
    chatForm.append('session_uuid', sessionUUID);
    chatForm.append('sensitivity_request_id', randomUUID());
    chatForm.append('hacker_is_stinky', 'very_stinky');
    chatForm.append('enabled_tools', JSON.stringify(['image_generator', 'image_editor']));

    const { data } = await axios.post(
      'https://api.deepai.org/hacking_is_a_serious_crime',
      chatForm,
      {
        headers: {
          ...chatForm.getHeaders(),
          'api-key': 'tryit-34595351639-ddc82a5ffdf295de648b7eaeddc6dfb7',
          ...BASE_HEADERS,
        },
        responseType: 'text',
        timeout: 30000,
      }
    );

    // ===== EKSTRAK RESPON =====
    let replyText = typeof data === 'string' ? data.trim() : data;
    try {
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      replyText =
        parsed.output || parsed.text || parsed.response || parsed.message || JSON.stringify(parsed);
    } catch (_) {}

    if (typeof replyText !== 'string') replyText = String(replyText);
    if (replyText.length > 4000) {
      replyText = replyText.slice(0, 4000) + '\n\n... [pesan dipotong]';
    }
    const safeText = replyText.replace(/(https?:\/\/[^\s]+)/g, '[$1]');

    // Kirim respon via SSE
    const chunk = JSON.stringify({ choices: [{ delta: { content: safeText } }] });
    res.write(`data: ${chunk}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();

    // Simpan ke session
    const updatedHistory = [...messages, { role: 'user', content: prompt }, { role: 'assistant', content: safeText }];
    sessions.set(sessionUUID, updatedHistory);

  } catch (error) {
    console.error('DeepAI error:', error.message);
    let errMsg = error.message;
    if (error.response) {
      errMsg = typeof error.response.data === 'string'
        ? error.response.data
        : JSON.stringify(error.response.data);
    }
    res.write(`data: ${JSON.stringify({ error: errMsg })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

// ---------- FRONTEND (HTML) ----------
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>HuTao AI - Asisten Cerdas</title>
    <link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@400;600;700&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Quicksand', sans-serif;
            background: linear-gradient(145deg, #1a0b1a 0%, #2d1b2d 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 16px;
        }
        .chat-container {
            width: 100%;
            max-width: 900px;
            height: 95vh;
            max-height: 800px;
            background: rgba(30, 15, 30, 0.85);
            backdrop-filter: blur(18px);
            border-radius: 40px;
            box-shadow: 0 25px 60px rgba(0, 0, 0, 0.8);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            border: 1px solid rgba(255, 150, 220, 0.12);
        }
        .chat-header {
            padding: 20px 28px;
            background: linear-gradient(135deg, rgba(60, 20, 60, 0.9), rgba(40, 10, 40, 0.95));
            border-bottom: 1px solid rgba(255, 100, 200, 0.2);
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-shrink: 0;
        }
        .header-left { display: flex; align-items: center; gap: 16px; }
        .avatar {
            width: 52px;
            height: 52px;
            border-radius: 50%;
            background: linear-gradient(135deg, #ff6b9d, #c44a7a);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 26px;
            font-weight: 700;
            color: #fff;
            box-shadow: 0 0 20px rgba(255, 80, 160, 0.4);
            border: 2px solid rgba(255, 255, 255, 0.2);
            flex-shrink: 0;
        }
        .header-info h1 { font-size: 22px; font-weight: 700; color: #f5e1f0; }
        .header-info h1 span { color: #ff8fc7; }
        .header-info .subtitle {
            font-size: 13px;
            color: #b88db0;
            font-weight: 400;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .header-info .subtitle .dot {
            display: inline-block;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #4cdf8b;
            animation: pulse-dot 1.8s ease-in-out infinite;
        }
        @keyframes pulse-dot {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.4; transform: scale(0.8); }
        }
        .header-actions button {
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.08);
            color: #d4b0cf;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            font-size: 18px;
            cursor: pointer;
            transition: all 0.25s ease;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .header-actions button:hover {
            background: rgba(255, 100, 200, 0.2);
            border-color: rgba(255, 100, 200, 0.3);
            color: #ffb0d8;
        }
        .model-bar {
            padding: 10px 28px;
            background: rgba(20, 8, 20, 0.6);
            border-bottom: 1px solid rgba(255, 100, 200, 0.08);
            display: flex;
            align-items: center;
            gap: 14px;
            flex-shrink: 0;
            flex-wrap: wrap;
        }
        .model-bar label {
            font-size: 13px;
            color: #b88db0;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .model-bar select {
            background: rgba(255, 255, 255, 0.07);
            border: 1px solid rgba(255, 100, 200, 0.15);
            color: #f0dceb;
            padding: 6px 14px;
            border-radius: 30px;
            font-family: 'Quicksand', sans-serif;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            outline: none;
            min-width: 180px;
        }
        .model-bar select:hover {
            border-color: rgba(255, 100, 200, 0.4);
            background: rgba(255, 255, 255, 0.1);
        }
        .model-bar select option { background: #2d1b2d; color: #f0dceb; }
        .model-badge {
            font-size: 11px;
            padding: 3px 12px;
            border-radius: 30px;
            background: rgba(255, 100, 200, 0.15);
            color: #ff8fc7;
            border: 1px solid rgba(255, 100, 200, 0.15);
            font-weight: 600;
        }
        .messages-area {
            flex: 1;
            overflow-y: auto;
            padding: 20px 28px 10px 28px;
            display: flex;
            flex-direction: column;
            gap: 14px;
            scroll-behavior: smooth;
        }
        .messages-area::-webkit-scrollbar { width: 5px; }
        .messages-area::-webkit-scrollbar-thumb { background: rgba(255, 100, 200, 0.3); border-radius: 10px; }
        .message {
            display: flex;
            gap: 12px;
            max-width: 82%;
            animation: fadeInUp 0.35s ease;
        }
        @keyframes fadeInUp {
            0% { opacity: 0; transform: translateY(12px); }
            100% { opacity: 1; transform: translateY(0); }
        }
        .message.user { align-self: flex-end; flex-direction: row-reverse; }
        .message.ai { align-self: flex-start; }
        .message .avatar-msg {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
            font-weight: 700;
            color: #fff;
        }
        .message.user .avatar-msg { background: linear-gradient(135deg, #7c4dff, #b388ff); }
        .message.ai .avatar-msg { background: linear-gradient(135deg, #ff6b9d, #c44a7a); }
        .message .bubble {
            padding: 14px 18px;
            border-radius: 18px;
            font-size: 15px;
            line-height: 1.6;
            word-wrap: break-word;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }
        .message.user .bubble {
            background: linear-gradient(135deg, #7c4dff, #651fff);
            color: #f5edff;
            border-bottom-right-radius: 6px;
        }
        .message.ai .bubble {
            background: rgba(60, 30, 60, 0.8);
            backdrop-filter: blur(4px);
            color: #f0e0ed;
            border-bottom-left-radius: 6px;
            border: 1px solid rgba(255, 100, 200, 0.08);
        }
        .message .bubble .timestamp {
            font-size: 10px;
            opacity: 0.5;
            margin-top: 6px;
            display: block;
            text-align: right;
            font-weight: 400;
        }
        .typing-indicator {
            display: none;
            align-self: flex-start;
            padding: 10px 20px;
            background: rgba(60, 30, 60, 0.6);
            border-radius: 30px;
            border: 1px solid rgba(255, 100, 200, 0.08);
            gap: 6px;
            margin-left: 52px;
        }
        .typing-indicator.show { display: flex; }
        .typing-indicator .dot-typing {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: #ff8fc7;
            animation: typingBounce 1.4s ease-in-out infinite;
        }
        .typing-indicator .dot-typing:nth-child(2) { animation-delay: 0.2s; }
        .typing-indicator .dot-typing:nth-child(3) { animation-delay: 0.4s; }
        @keyframes typingBounce {
            0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
            30% { transform: translateY(-8px); opacity: 1; }
        }
        .chat-input-area {
            padding: 16px 28px 24px 28px;
            background: linear-gradient(0deg, rgba(20, 8, 20, 0.9), transparent);
            border-top: 1px solid rgba(255, 100, 200, 0.06);
            flex-shrink: 0;
            display: flex;
            gap: 12px;
            align-items: flex-end;
        }
        .input-wrapper { flex: 1; position: relative; }
        .input-wrapper textarea {
            width: 100%;
            padding: 14px 20px;
            border-radius: 30px;
            border: 1px solid rgba(255, 100, 200, 0.12);
            background: rgba(255, 255, 255, 0.05);
            color: #f0dceb;
            font-family: 'Quicksand', sans-serif;
            font-size: 15px;
            resize: none;
            outline: none;
            transition: all 0.3s;
            min-height: 54px;
            max-height: 120px;
            line-height: 1.5;
        }
        .input-wrapper textarea::placeholder { color: #8a6a84; font-weight: 400; }
        .input-wrapper textarea:focus {
            border-color: rgba(255, 100, 200, 0.4);
            background: rgba(255, 255, 255, 0.08);
        }
        .btn-send {
            width: 56px;
            height: 56px;
            border-radius: 50%;
            border: none;
            background: linear-gradient(135deg, #ff6b9d, #c44a7a);
            color: #fff;
            font-size: 22px;
            cursor: pointer;
            transition: all 0.25s ease;
            flex-shrink: 0;
            box-shadow: 0 4px 20px rgba(255, 80, 160, 0.3);
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .btn-send:hover { transform: scale(1.06); box-shadow: 0 6px 30px rgba(255, 80, 160, 0.5); }
        .btn-send:active { transform: scale(0.94); }
        .btn-send:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
        @media (max-width: 600px) {
            .chat-container { height: 100vh; max-height: none; border-radius: 24px; }
            .chat-header { padding: 14px 18px; }
            .header-info h1 { font-size: 18px; }
            .avatar { width: 42px; height: 42px; font-size: 20px; }
            .model-bar { padding: 8px 16px; gap: 8px; }
            .model-bar select { min-width: 120px; font-size: 12px; }
            .messages-area { padding: 14px 16px 8px 16px; }
            .message { max-width: 92%; }
            .chat-input-area { padding: 12px 16px 18px 16px; gap: 8px; }
            .input-wrapper textarea { font-size: 14px; padding: 12px 16px; min-height: 46px; }
            .btn-send { width: 48px; height: 48px; font-size: 18px; }
            .message .bubble { font-size: 14px; padding: 12px 14px; }
        }
    </style>
</head>
<body>
    <div class="chat-container">
        <div class="chat-header">
            <div class="header-left">
                <div class="avatar">🌸</div>
                <div class="header-info">
                    <h1>Hu<span>Tao</span></h1>
                    <div class="subtitle">
                        <span class="dot"></span>
                        <span id="statusText">Online · Siap membantu</span>
                    </div>
                </div>
            </div>
            <div class="header-actions">
                <button id="btnClear"><i class="fas fa-trash-alt"></i></button>
            </div>
        </div>
        <div class="model-bar">
            <label><i class="fas fa-brain" style="color: #ff8fc7;"></i> Model</label>
            <select id="modelSelect"></select>
            <span class="model-badge" id="modelBadge">🌺 HuTao AI</span>
        </div>
        <div class="messages-area" id="messagesArea">
            <div class="message ai">
                <div class="avatar-msg">🌸</div>
                <div class="bubble">
                    Halo! Saya <strong>HuTao</strong>, asisten AI Anda.<br />
                    Ada yang bisa saya bantu? 😊
                    <span class="timestamp">Sekarang</span>
                </div>
            </div>
            <div class="typing-indicator" id="typingIndicator">
                <span class="dot-typing"></span>
                <span class="dot-typing"></span>
                <span class="dot-typing"></span>
            </div>
        </div>
        <div class="chat-input-area">
            <div class="input-wrapper">
                <textarea id="chatInput" rows="1" placeholder="Tanyakan apa saja ke HuTao ..." maxlength="2000"></textarea>
            </div>
            <button class="btn-send" id="btnSend"><i class="fas fa-paper-plane"></i></button>
        </div>
    </div>

    <script>
        const messagesArea = document.getElementById('messagesArea');
        const chatInput = document.getElementById('chatInput');
        const btnSend = document.getElementById('btnSend');
        const btnClear = document.getElementById('btnClear');
        const modelSelect = document.getElementById('modelSelect');
        const modelBadge = document.getElementById('modelBadge');
        const typingIndicator = document.getElementById('typingIndicator');
        const statusText = document.getElementById('statusText');

        let conversationHistory = [];
        let isProcessing = false;
        let currentModel = 'hutao';

        async function loadModels() {
            try {
                const res = await fetch('/api/models');
                const data = await res.json();
                const models = data.models || [];
                modelSelect.innerHTML = '';
                models.forEach(model => {
                    const opt = document.createElement('option');
                    opt.value = model.id;
                    opt.textContent = model.name + ' (' + model.provider + ')';
                    if (model.id === currentModel) opt.selected = true;
                    modelSelect.appendChild(opt);
                });
                // Badge tetap menunjukkan HuTao AI
                modelBadge.textContent = '🌺 HuTao AI';
                modelBadge.style.color = '#ff8fc7';
            } catch (err) {
                console.error('Gagal load models:', err);
            }
        }

        async function sendMessageToAI(userMessage) {
            if (isProcessing || !userMessage.trim()) return;

            appendMessage('user', userMessage);
            chatInput.value = '';
            chatInput.style.height = 'auto';

            showTyping(true);
            isProcessing = true;
            btnSend.disabled = true;
            statusText.textContent = 'HuTao sedang mengetik ...';

            try {
                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        prompt: userMessage,
                        messages: conversationHistory,
                        model: modelSelect.value
                    })
                });

                if (!response.ok) throw new Error('Server error');

                const reader = response.body.getReader();
                const decoder = new TextDecoder('utf-8');
                let aiResponse = '';

                const messageElement = createMessageElement('ai', '');
                const bubble = messageElement.querySelector('.bubble');
                showTyping(false);
                messagesArea.appendChild(messageElement);

                let buffer = '';
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\\n');
                    buffer = lines.pop() || '';
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (trimmed.startsWith('data: ')) {
                            const dataStr = trimmed.substring(6).trim();
                            if (dataStr === '[DONE]') continue;
                            try {
                                const parsed = JSON.parse(dataStr);
                                const content = parsed.choices?.[0]?.delta?.content;
                                if (content) {
                                    aiResponse += content;
                                    bubble.innerHTML = aiResponse.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\\n/g, '<br>') +
                                        '<span class="timestamp">' + new Date().toLocaleTimeString() + '</span>';
                                    scrollToBottom();
                                }
                            } catch (e) {}
                        }
                    }
                }

                if (!aiResponse.trim()) {
                    aiResponse = 'Maaf, saya tidak dapat memproses permintaan Anda.';
                    bubble.innerHTML = aiResponse +
                        '<span class="timestamp">' + new Date().toLocaleTimeString() + '</span>';
                }

                conversationHistory.push({ role: 'user', content: userMessage });
                conversationHistory.push({ role: 'assistant', content: aiResponse });

            } catch (error) {
                appendMessage('ai', '⚠️ Error: ' + (error.message || 'Silakan coba lagi.'));
            } finally {
                showTyping(false);
                isProcessing = false;
                btnSend.disabled = false;
                statusText.textContent = 'Online · Siap membantu';
                chatInput.focus();
                scrollToBottom();
            }
        }

        function appendMessage(role, content) {
            messagesArea.appendChild(createMessageElement(role, content));
            scrollToBottom();
        }

        function createMessageElement(role, content) {
            const wrapper = document.createElement('div');
            wrapper.className = 'message ' + (role === 'user' ? 'user' : 'ai');
            const avatar = document.createElement('div');
            avatar.className = 'avatar-msg';
            avatar.textContent = role === 'user' ? '👤' : '🌸';
            const bubble = document.createElement('div');
            bubble.className = 'bubble';
            bubble.innerHTML = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\\n/g, '<br>') +
                '<span class="timestamp">' + new Date().toLocaleTimeString() + '</span>';
            wrapper.appendChild(avatar);
            wrapper.appendChild(bubble);
            return wrapper;
        }

        function showTyping(show) {
            typingIndicator.classList.toggle('show', show);
        }

        function scrollToBottom() {
            messagesArea.scrollTop = messagesArea.scrollHeight;
        }

        function clearChat() {
            document.querySelectorAll('.message').forEach(el => el.remove());
            conversationHistory = [];
            appendMessage('ai', 'Halo! Saya <strong>HuTao</strong>, asisten AI Anda. Ada yang bisa saya bantu? 😊');
            scrollToBottom();
        }

        function autoResizeTextarea() {
            chatInput.style.height = 'auto';
            chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
        }

        btnSend.addEventListener('click', () => sendMessageToAI(chatInput.value.trim()));
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessageToAI(chatInput.value.trim());
            }
        });
        chatInput.addEventListener('input', autoResizeTextarea);
        btnClear.addEventListener('click', () => { if (confirm('Hapus semua percakapan?')) clearChat(); });
        modelSelect.addEventListener('change', () => {
            // Badge tetap HuTao AI
            modelBadge.textContent = '🌺 HuTao AI';
            modelBadge.style.color = '#ff8fc7';
        });

        loadModels();
        chatInput.focus();
    </script>
</body>
</html>
  `);
});

// ---------- START SERVER ----------
app.listen(PORT, () => {
  console.log(`🌸 HuTao AI (DeepAI) berjalan di http://localhost:${PORT}`);
  console.log('Tekan Ctrl+C untuk berhenti');
});
