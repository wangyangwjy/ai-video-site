const apiKey = ""; // 环境自动注入

const state = {
  layers: [],
  selectedId: null,
  scale: 1,
  pan: { x: 0, y: 0 },
  isSpacePressed: false,
  isPanning: false,
  isSelecting: false,
  selectionBox: null,
  history: [],
  historyIndex: -1,
  messages: [
    { role: 'bot', text: '你好！按住空格可平移画布，上传图片后可拖拽、缩放和旋转。' }
  ],
  chatOpen: true,
};

const canvas = document.getElementById('canvas');
const fileInput = document.getElementById('fileInput');
const scaleIndicator = document.getElementById('scaleIndicator');
const floatingToolbar = document.getElementById('floatingToolbar');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');
const splitBtn = document.getElementById('splitBtn');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendChat = document.getElementById('sendChat');
const closeChat = document.getElementById('closeChat');
const chatSidebar = document.getElementById('chatSidebar');
const chatImage = document.getElementById('chatImage');

const generateId = () => Math.random().toString(36).slice(2, 9);

function saveHistory(layers) {
  state.history = state.history.slice(0, state.historyIndex + 1);
  state.history.push(JSON.parse(JSON.stringify(layers)));
  if (state.history.length > 20) state.history.shift();
  state.historyIndex = state.history.length - 1;
  updateHistoryButtons();
}

function updateHistoryButtons() {
  undoBtn.disabled = state.historyIndex <= 0;
  redoBtn.disabled = state.historyIndex >= state.history.length - 1;
}

function setLayers(layers, save = true) {
  state.layers = layers;
  if (save) saveHistory(layers);
  renderLayers();
}

function addMessage(role, text) {
  state.messages.push({ role, text });
  renderChat();
}

function renderChat() {
  chatMessages.innerHTML = '';
  state.messages.forEach((msg) => {
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${msg.role === 'user' ? 'user' : 'bot'}`;
    bubble.textContent = msg.text;
    chatMessages.appendChild(bubble);
  });
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function renderLayers() {
  canvas.innerHTML = '';
  const content = document.createElement('div');
  content.style.transform = `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.scale})`;
  content.style.transformOrigin = '0 0';
  content.style.position = 'absolute';
  content.style.inset = '0';

  state.layers.forEach((layer) => {
    const el = document.createElement('div');
    el.className = 'layer';
    if (state.selectedId === layer.id) el.classList.add('selected');
    el.style.width = `${layer.width}px`;
    el.style.height = `${layer.height}px`;
    el.style.transform = `translate(${layer.x}px, ${layer.y}px) rotate(${layer.rotation || 0}deg)`;
    el.style.zIndex = state.selectedId === layer.id ? 1000 : layer.zIndex || 1;

    const img = document.createElement('img');
    img.src = layer.src;
    img.alt = 'layer';
    el.appendChild(img);

    el.addEventListener('mousedown', (e) => startDrag(e, layer.id));

    if (state.selectedId === layer.id) {
      addHandles(el, layer);
    }

    content.appendChild(el);
  });

  canvas.appendChild(content);

  if (state.isSelecting && state.selectionBox) {
    const box = document.createElement('div');
    box.className = 'selection-box';
    const { startX, startY, currentX, currentY } = state.selectionBox;
    const left = Math.min(startX, currentX);
    const top = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
    box.style.width = `${width}px`;
    box.style.height = `${height}px`;
    canvas.appendChild(box);
  }

  updateToolbar();
  scaleIndicator.textContent = `Scale: ${Math.round(state.scale * 100)}%`;
}

function addHandles(el, layer) {
  const directions = [
    ['nw', 0, 0],
    ['n', 50, 0],
    ['ne', 100, 0],
    ['e', 100, 50],
    ['se', 100, 100],
    ['s', 50, 100],
    ['sw', 0, 100],
    ['w', 0, 50],
  ];
  directions.forEach(([dir, x, y]) => {
    const handle = document.createElement('div');
    handle.className = 'handle';
    handle.style.left = `${x}%`;
    handle.style.top = `${y}%`;
    handle.style.cursor = `${dir}-resize`;
    handle.addEventListener('mousedown', (e) => startResize(e, layer.id, dir));
    el.appendChild(handle);
  });

  const rotate = document.createElement('div');
  rotate.className = 'rotate-handle';
  rotate.textContent = '⟳';
  rotate.addEventListener('mousedown', (e) => startRotate(e, layer.id));
  el.appendChild(rotate);
}

function startDrag(e, id) {
  if (state.isSpacePressed) return;
  e.stopPropagation();
  const layer = state.layers.find((l) => l.id === id);
  if (!layer) return;
  state.selectedId = id;
  renderLayers();

  const startX = e.clientX;
  const startY = e.clientY;
  const initX = layer.x;
  const initY = layer.y;

  function onMove(ev) {
    const dx = (ev.clientX - startX) / state.scale;
    const dy = (ev.clientY - startY) / state.scale;
    updateLayer(id, { x: initX + dx, y: initY + dy }, false);
  }

  function onUp() {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    saveHistory(state.layers);
  }

  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

function startResize(e, id, direction) {
  e.stopPropagation();
  const layer = state.layers.find((l) => l.id === id);
  if (!layer) return;
  const startX = e.clientX;
  const startY = e.clientY;
  const startLayer = { ...layer };
  const rotationRad = (startLayer.rotation || 0) * Math.PI / 180;
  const startRatio = startLayer.width / startLayer.height;

  function onMove(ev) {
    const dx = (ev.clientX - startX) / state.scale;
    const dy = (ev.clientY - startY) / state.scale;
    const cos = Math.cos(-rotationRad);
    const sin = Math.sin(-rotationRad);
    const localDx = dx * cos - dy * sin;
    const localDy = dx * sin + dy * cos;
    let dW = 0, dH = 0, dX = 0, dY = 0;
    if (direction.includes('e')) dW = localDx;
    if (direction.includes('w')) { dW = -localDx; dX = localDx; }
    if (direction.includes('s')) dH = localDy;
    if (direction.includes('n')) { dH = -localDy; dY = localDy; }

    const isCorner = direction.length === 2;
    if (isCorner && !ev.shiftKey) {
      if (Math.abs(dW) * startLayer.height > Math.abs(dH) * startLayer.width) {
        dH = dW / startRatio;
        if (direction.includes('n')) dY = -dH;
      } else {
        dW = dH * startRatio;
        if (direction.includes('w')) dX = -dW;
      }
    }

    let newW = Math.max(20, startLayer.width + dW);
    let newH = Math.max(20, startLayer.height + dH);
    dW = newW - startLayer.width;
    dH = newH - startLayer.height;
    if (direction.includes('w')) dX = -dW;
    if (direction.includes('n')) dY = -dH;

    const oldCx = startLayer.width / 2;
    const oldCy = startLayer.height / 2;
    const newCx = dX + newW / 2;
    const newCy = dY + newH / 2;
    const dcx = newCx - oldCx;
    const dcy = newCy - oldCy;
    const gDCx = dcx * Math.cos(rotationRad) - dcy * Math.sin(rotationRad);
    const gDCy = dcx * Math.sin(rotationRad) + dcy * Math.cos(rotationRad);

    const globalCx = (startLayer.x + startLayer.width / 2) + gDCx;
    const globalCy = (startLayer.y + startLayer.height / 2) + gDCy;

    const finalX = globalCx - newW / 2;
    const finalY = globalCy - newH / 2;
    updateLayer(id, { x: finalX, y: finalY, width: newW, height: newH }, true);
  }

  function onUp() {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    saveHistory(state.layers);
  }

  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

function startRotate(e, id) {
  e.stopPropagation();
  const layer = state.layers.find((l) => l.id === id);
  if (!layer) return;
  const rect = e.target.parentElement.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX);
  const startRotation = layer.rotation || 0;

  function onMove(ev) {
    const angle = Math.atan2(ev.clientY - centerY, ev.clientX - centerX);
    const deg = (angle - startAngle) * (180 / Math.PI) + startRotation;
    updateLayer(id, { rotation: deg }, true);
  }

  function onUp() {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    saveHistory(state.layers);
  }

  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

function updateLayer(id, props, instant = false) {
  state.layers = state.layers.map((l) => l.id === id ? { ...l, ...props } : l);
  renderLayers();
  if (!instant) saveHistory(state.layers);
}

function handleFileChange(e) {
  const files = Array.from(e.target.files);
  if (!files.length) return;
  const promises = files.map((file) => new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => resolve({ src: ev.target.result, width: img.naturalWidth, height: img.naturalHeight });
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }));

  Promise.all(promises).then((items) => {
    const maxSize = 500;
    const newLayers = [...state.layers];
    items.forEach((data, idx) => {
      let w = data.width;
      let h = data.height;
      if (w > h && w > maxSize) { h = (maxSize / w) * h; w = maxSize; }
      else if (h > w && h > maxSize) { w = (maxSize / h) * w; h = maxSize; }
      const layer = {
        id: generateId(),
        src: data.src,
        originalSrc: data.src,
        x: (window.innerWidth / 2 - w / 2 - state.pan.x) / state.scale + idx * 20,
        y: (window.innerHeight / 2 - h / 2 - state.pan.y) / state.scale + idx * 20,
        width: w,
        height: h,
        rotation: 0,
        zIndex: state.layers.length + idx + 1,
        isGenerating: false,
      };
      newLayers.push(layer);
      state.selectedId = layer.id;
    });
    setLayers(newLayers, true);
  });
}

function updateToolbar() {
  const layer = state.layers.find((l) => l.id === state.selectedId);
  if (!layer) {
    floatingToolbar.classList.add('hidden');
    return;
  }
  floatingToolbar.classList.remove('hidden');
  floatingToolbar.innerHTML = '';
  const btns = [
    { label: '复制', action: () => duplicateLayer(layer.id) },
    { label: '删除', action: () => deleteLayer(layer.id) },
    { label: '抠图', action: () => removeBackgroundForLayer(layer.id) },
  ];
  btns.forEach(({ label, action }) => {
    const b = document.createElement('button');
    b.className = 'toolbar-btn';
    b.textContent = label;
    b.addEventListener('click', (e) => { e.stopPropagation(); action(); });
    floatingToolbar.appendChild(b);
  });

  const screenW = layer.width * state.scale;
  const screenH = layer.height * state.scale;
  const centerX = state.pan.x + (layer.x * state.scale) + screenW / 2;
  let topY = state.pan.y + layer.y * state.scale - 18;
  if (topY < 10) topY = state.pan.y + (layer.y + layer.height) * state.scale + 18;
  floatingToolbar.style.left = `${centerX}px`;
  floatingToolbar.style.top = `${topY}px`;
}

function deleteLayer(id) {
  state.layers = state.layers.filter((l) => l.id !== id);
  state.selectedId = null;
  saveHistory(state.layers);
  renderLayers();
}

function duplicateLayer(id) {
  const layer = state.layers.find((l) => l.id === id);
  if (!layer) return;
  const copy = { ...layer, id: generateId(), x: layer.x + layer.width + 20, zIndex: state.layers.length + 1 };
  state.layers = [...state.layers, copy];
  state.selectedId = copy.id;
  saveHistory(state.layers);
  renderLayers();
}

function removeBackgroundForLayer(id) {
  const layer = state.layers.find((l) => l.id === id);
  if (!layer) return;
  const img = new Image();
  img.crossOrigin = 'Anonymous';
  img.src = layer.src;
  img.onload = () => {
    const canvasEl = document.createElement('canvas');
    canvasEl.width = img.width;
    canvasEl.height = img.height;
    const ctx = canvasEl.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 230 && data[i + 1] > 230 && data[i + 2] > 230) data[i + 3] = 0;
    }
    ctx.putImageData(imageData, 0, 0);
    updateLayer(id, { src: canvasEl.toDataURL() });
  };
}

function handleCanvasMouseDown(e) {
  if (state.isSpacePressed) {
    state.isPanning = true;
    state.panStart = { x: e.clientX, y: e.clientY };
    return;
  }
  state.isSelecting = true;
  state.selectionBox = { startX: e.clientX, startY: e.clientY, currentX: e.clientX, currentY: e.clientY };
  state.selectedId = null;
  renderLayers();
}

function handleCanvasMouseMove(e) {
  if (state.isPanning) {
    const dx = e.clientX - state.panStart.x;
    const dy = e.clientY - state.panStart.y;
    state.pan.x += dx;
    state.pan.y += dy;
    state.panStart = { x: e.clientX, y: e.clientY };
    renderLayers();
  } else if (state.isSelecting && state.selectionBox) {
    state.selectionBox.currentX = e.clientX;
    state.selectionBox.currentY = e.clientY;
    renderLayers();
  }
}

function handleCanvasMouseUp() {
  if (state.isSelecting && state.selectionBox) {
    const { startX, startY, currentX, currentY } = state.selectionBox;
    const left = Math.min(startX, currentX);
    const top = Math.min(startY, currentY);
    const right = Math.max(startX, currentX);
    const bottom = Math.max(startY, currentY);
    for (let i = state.layers.length - 1; i >= 0; i -= 1) {
      const l = state.layers[i];
      const screenCX = state.pan.x + (l.x + l.width / 2) * state.scale;
      const screenCY = state.pan.y + (l.y + l.height / 2) * state.scale;
      if (screenCX >= left && screenCX <= right && screenCY >= top && screenCY <= bottom) {
        state.selectedId = l.id;
        break;
      }
    }
  }
  state.isSelecting = false;
  state.selectionBox = null;
  state.isPanning = false;
  renderLayers();
}

function handleWheel(e) {
  if (e.ctrlKey) {
    e.preventDefault();
    const next = Math.min(Math.max(0.1, state.scale * (e.deltaY > 0 ? 0.9 : 1.1)), 5);
    state.scale = next;
    renderLayers();
  }
}

function handleKeys(e) {
  if (e.code === 'Space' && !e.repeat && ['INPUT', 'TEXTAREA'].indexOf(document.activeElement.tagName) === -1) {
    e.preventDefault();
    state.isSpacePressed = true;
    document.body.classList.add('space');
  }
}

function handleKeyUp(e) {
  if (e.code === 'Space') {
    state.isSpacePressed = false;
    state.isPanning = false;
    document.body.classList.remove('space');
  }
}

function handleUndo() {
  if (state.historyIndex > 0) {
    state.historyIndex -= 1;
    state.layers = JSON.parse(JSON.stringify(state.history[state.historyIndex]));
    state.selectedId = null;
    renderLayers();
    updateHistoryButtons();
  }
}

function handleRedo() {
  if (state.historyIndex < state.history.length - 1) {
    state.historyIndex += 1;
    state.layers = JSON.parse(JSON.stringify(state.history[state.historyIndex]));
    state.selectedId = null;
    renderLayers();
    updateHistoryButtons();
  }
}

function handleSplit() {
  addMessage('bot', '当前环境不提供 AI 拆分，已记录指令。');
}

function handleChatSend() {
  const text = chatInput.value.trim();
  if (!text) return;
  chatInput.value = '';
  addMessage('user', text);
  setTimeout(() => addMessage('bot', '收到：' + text), 400);
}

function init() {
  renderChat();
  renderLayers();
  saveHistory([]);
  fileInput.addEventListener('change', handleFileChange);
  canvas.addEventListener('mousedown', handleCanvasMouseDown);
  window.addEventListener('mousemove', handleCanvasMouseMove);
  window.addEventListener('mouseup', handleCanvasMouseUp);
  canvas.addEventListener('wheel', handleWheel, { passive: false });
  window.addEventListener('keydown', handleKeys);
  window.addEventListener('keyup', handleKeyUp);
  undoBtn.addEventListener('click', handleUndo);
  redoBtn.addEventListener('click', handleRedo);
  splitBtn.addEventListener('click', handleSplit);
  sendChat.addEventListener('click', handleChatSend);
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleChatSend();
    }
  });
  document.body.addEventListener('click', () => {
    state.isSelecting = false;
    state.selectionBox = null;
  });
  closeChat.addEventListener('click', () => chatSidebar.classList.toggle('hidden'));
}

init();
