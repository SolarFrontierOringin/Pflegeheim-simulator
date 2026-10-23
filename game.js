(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const modal = document.getElementById("resident-modal");
  const toast = document.getElementById("toast");
  const WORLD = { w: 900, h: 610, hallTop: 185, hallBottom: 425 };
  const SAVE_KEY = "pflegeflur-save-v1";

  const careTypes = [
    { id: "wash", label: "Waschen", icon: "♨", detail: "Körperpflege" },
    { id: "dress", label: "Anziehen", icon: "♧", detail: "Kleidung wechseln" },
    { id: "food", label: "Essen geben", icon: "♨", detail: "Frühstück" }
  ];

  const residents = [
    { id: 1, room: "101", name: "Anna Weber", age: 82, avatar: "👵", side: "top", x: 155, y: 92, needs: ["wash","dress","food"], done: [], mood: "Benötigt Unterstützung" },
    { id: 2, room: "102", name: "Karl Fischer", age: 78, avatar: "👴", side: "bottom", x: 335, y: 518, needs: ["wash","dress","food"], done: [], mood: "Wartet auf Hilfe" },
    { id: 3, room: "103", name: "Martha Schulz", age: 86, avatar: "👵", side: "top", x: 515, y: 92, needs: ["wash","dress","food"], done: [], mood: "Benötigt Unterstützung" },
    { id: 4, room: "104", name: "Paul Becker", age: 80, avatar: "👴", side: "bottom", x: 695, y: 518, needs: ["wash","dress","food"], done: [], mood: "Wartet auf Hilfe" }
  ];

  const player = { x: 450, y: 305, tx: 450, ty: 305, speed: 205, moving: false };
  let activeResident = null;
  let lastFrame = 0;
  let gameMinutes = 420;
  let toastTimer = null;

  function loadSave() {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
      if (!saved) return;
      gameMinutes = Number.isFinite(saved.gameMinutes) ? saved.gameMinutes : 420;
      if (saved.residents) residents.forEach(r => {
        const old = saved.residents.find(s => s.id === r.id);
        if (old && Array.isArray(old.done)) r.done = old.done.filter(id => r.needs.includes(id));
      });
      if (saved.player && Number.isFinite(saved.player.x) && Number.isFinite(saved.player.y)) {
        player.x = player.tx = saved.player.x;
        player.y = player.ty = saved.player.y;
      }
    } catch (_) {}
  }
  function saveGame() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        gameMinutes,
        residents: residents.map(r => ({ id: r.id, done: r.done })),
        player: { x: player.x, y: player.y }
      }));
    } catch (_) {}
  }

  function resizeCanvas() {
    const width = Math.max(300, canvas.clientWidth);
    const height = width * WORLD.h / WORLD.w;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.height = `${height}px`;
    ctx.setTransform(canvas.width / WORLD.w, 0, 0, canvas.height / WORLD.h, 0, 0);
    draw();
  }

  function roundedRect(x, y, w, h, r, fill, stroke = null, lineWidth = 1) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.lineWidth = lineWidth; ctx.strokeStyle = stroke; ctx.stroke(); }
  }

  function drawRoom(r, index) {
    const roomW = 164, roomH = 178;
    const x = 48 + index * 184;
    const y = r.side === "top" ? 8 : 424;
    roundedRect(x, y, roomW, roomH, 7, "#f9fbfa", "#b9cecf", 2);
    // Wood floor planks
    ctx.save();
    ctx.beginPath(); ctx.rect(x + 3, y + 3, roomW - 6, roomH - 6); ctx.clip();
    ctx.strokeStyle = "#e7d8c6"; ctx.lineWidth = 1;
    for (let yy = y + 16; yy < y + roomH; yy += 19) {
      ctx.beginPath(); ctx.moveTo(x + 3, yy); ctx.lineTo(x + roomW - 3, yy); ctx.stroke();
    }
    ctx.restore();

    // Window
    roundedRect(x + 16, y + 10, 46, 7, 2, "#b8dce5");
    ctx.fillStyle = "#9dcbd8"; ctx.fillRect(x + 38, y + 10, 2, 7);
    // Bed, pillow and blanket
    roundedRect(x + 47, y + 39, 91, 94, 7, "#e8eef0", "#c6d4d8");
    roundedRect(x + 55, y + 46, 75, 27, 5, "#fff", "#d5e0e2");
    roundedRect(x + 55, y + 76, 75, 49, 5, index % 2 ? "#a8c9d2" : "#b4d9cf");
    // Bedside table
    roundedRect(x + 12, y + 79, 28, 32, 4, "#c69e79", "#aa815c");
    roundedRect(x + 17, y + 83, 18, 7, 2, "#dec3a4");
    // Chair
    roundedRect(x + 14, y + 126, 28, 28, 5, "#b8c9b9", "#93aa99");
    // Resident on bed
    ctx.beginPath(); ctx.arc(x + 91, y + 62, 11, 0, Math.PI * 2); ctx.fillStyle = "#e7b995"; ctx.fill();
    ctx.beginPath(); ctx.arc(x + 91, y + 58, 11, Math.PI, Math.PI * 2); ctx.fillStyle = "#8e6a50"; ctx.fill();
    // Room number plaque
    roundedRect(x + 65, r.side === "top" ? y + roomH - 22 : y + roomH - 22, 67, 17, 5, "#fff", "#d8e4e5");
    ctx.fillStyle = "#3a5964"; ctx.font = "700 10px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(`ZIMMER ${r.room}`, x + 98, y + roomH - 10);
    // Door opening toward hall
    const doorX = x + 68;
    if (r.side === "top") {
      ctx.fillStyle = "#e7eeee"; ctx.fillRect(doorX, y + roomH - 3, 34, 8);
      ctx.strokeStyle = "#b18c68"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(doorX, y + roomH); ctx.lineTo(doorX, y + roomH - 31); ctx.lineTo(doorX + 30, y + roomH - 31); ctx.stroke();
    } else {
      ctx.fillStyle = "#e7eeee"; ctx.fillRect(doorX, y - 3, 34, 8);
      ctx.strokeStyle = "#b18c68"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(doorX, y); ctx.lineTo(doorX, y + 31); ctx.lineTo(doorX + 30, y + 31); ctx.stroke();
    }
    // Clickable resident badge
    const badgeY = r.side === "top" ? y + roomH - 7 : y + 8;
    ctx.beginPath(); ctx.arc(x + roomW - 17, badgeY, 12, 0, Math.PI * 2);
    ctx.fillStyle = r.done.length === r.needs.length ? "#208d6b" : "#d9a15e"; ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(r.done.length === r.needs.length ? "✓" : "!", x + roomW - 17, badgeY + 4);
    r._bounds = { x, y, w: roomW, h: roomH };
  }

  function drawHall() {
    // Corridor base
    const grad = ctx.createLinearGradient(0, WORLD.hallTop, 0, WORLD.hallBottom);
    grad.addColorStop(0, "#e8eeee"); grad.addColorStop(.5, "#f5f7f5"); grad.addColorStop(1, "#e2eaea");
    ctx.fillStyle = grad; ctx.fillRect(0, WORLD.hallTop, WORLD.w, WORLD.hallBottom - WORLD.hallTop);
    // Floor tiles
    ctx.strokeStyle = "#d2dede"; ctx.lineWidth = 1;
    for (let x = 0; x <= WORLD.w; x += 60) { ctx.beginPath(); ctx.moveTo(x, WORLD.hallTop); ctx.lineTo(x, WORLD.hallBottom); ctx.stroke(); }
    for (let y = WORLD.hallTop; y <= WORLD.hallBottom; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD.w, y); ctx.stroke(); }
    // Wall borders and handrails
    ctx.fillStyle = "#d0dede"; ctx.fillRect(0, WORLD.hallTop - 6, WORLD.w, 7); ctx.fillRect(0, WORLD.hallBottom - 1, WORLD.w, 7);
    ctx.fillStyle = "#b8c7c9"; ctx.fillRect(0, WORLD.hallTop + 19, WORLD.w, 3); ctx.fillRect(0, WORLD.hallBottom - 23, WORLD.w, 3);
    // Wall lights / signs
    for (let i = 0; i < 4; i++) {
      const x = 105 + i * 184;
      roundedRect(x, WORLD.hallTop + 3, 31, 10, 3, "#fff4c8", "#e1d6a8");
      roundedRect(x + 42, WORLD.hallBottom - 14, 22, 7, 2, "#fff4c8");
    }
    ctx.fillStyle = "#789099"; ctx.font = "700 11px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("WOHNBEREICH A", 450, 300);
    ctx.fillStyle = "#a0b2b5"; ctx.font = "10px sans-serif";
    ctx.fillText("← Zimmer 101 / 103", 120, 405);
    ctx.fillText("Zimmer 102 / 104 →", 780, 405);
  }

  function drawPlayer() {
    // Destination marker
    if (player.moving) {
      ctx.beginPath(); ctx.arc(player.tx, player.ty, 11, 0, Math.PI * 2);
      ctx.strokeStyle = "#168b85"; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);
    }
    // Soft shadow
    ctx.beginPath(); ctx.ellipse(player.x, player.y + 15, 14, 6, 0, 0, Math.PI * 2); ctx.fillStyle = "#183b4530"; ctx.fill();
    // Feet
    roundedRect(player.x - 8, player.y + 7, 6, 10, 3, "#334b58");
    roundedRect(player.x + 2, player.y + 7, 6, 10, 3, "#334b58");
    // Body / scrub uniform
    roundedRect(player.x - 12, player.y - 9, 24, 22, 7, "#168f87", "#0f726d", 1);
    // Head
    ctx.beginPath(); ctx.arc(player.x, player.y - 17, 9, 0, Math.PI * 2); ctx.fillStyle = "#d9a27e"; ctx.fill();
    // Hair
    ctx.beginPath(); ctx.arc(player.x, player.y - 20, 9, Math.PI, Math.PI * 2); ctx.fillStyle = "#4e4540"; ctx.fill();
    // Badge
    roundedRect(player.x + 3, player.y - 5, 5, 6, 1, "#f4ffff");
    if (player.moving) {
      ctx.beginPath(); ctx.arc(player.x, player.y - 34, 3, 0, Math.PI * 2); ctx.fillStyle = "#168b85"; ctx.fill();
    }
  }

  function draw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, WORLD.w, WORLD.h);
    ctx.fillStyle = "#dce6e6"; ctx.fillRect(0, 0, WORLD.w, WORLD.h);
    residents.filter(r => r.side === "top").forEach((r, i) => drawRoom(r, i));
    residents.filter(r => r.side === "bottom").forEach((r, i) => drawRoom(r, i));
    drawHall();
    drawPlayer();
  }

  function pointFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / rect.width * WORLD.w,
      y: (event.clientY - rect.top) / rect.height * WORLD.h
    };
  }

  function setTarget(x, y) {
    player.tx = Math.max(20, Math.min(WORLD.w - 20, x));
    player.ty = Math.max(WORLD.hallTop + 15, Math.min(WORLD.hallBottom - 15, y));
    player.moving = Math.hypot(player.tx - player.x, player.ty - player.y) > 5;
    document.getElementById("movement-status").textContent = player.moving ? "Auf dem Weg ..." : "Am Ziel angekommen";
  }

  function onMapTap(event) {
    const p = pointFromEvent(event);
    // Tap on room/resident selects that resident.
    for (const r of residents) {
      const b = r._bounds;
      if (b && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
        openResident(r);
        return;
      }
    }
    setTarget(p.x, p.y);
  }

  function openResident(r) {
    activeResident = r;
    document.getElementById("modal-room").textContent = `ZIMMER ${r.room}`;
    document.getElementById("modal-title").textContent = r.name;
    document.getElementById("modal-subtitle").textContent = `Bewohner${r.avatar === "👴" ? "" : "in"} · ${r.age} Jahre`;
    document.getElementById("modal-avatar").textContent = r.avatar;
    document.getElementById("modal-mood").textContent = r.done.length === r.needs.length ? "Alle Aufgaben erledigt – gut versorgt" : r.mood;
    const options = document.getElementById("care-options");
    options.innerHTML = "";
    careTypes.forEach(type => {
      const complete = r.done.includes(type.id);
      const button = document.createElement("button");
      button.type = "button";
      button.className = `care-button${complete ? " completed" : ""}`;
      button.innerHTML = `<span class="care-icon">${complete ? "✓" : type.icon}</span><span><strong>${type.label}</strong><small>${complete ? "Erledigt" : type.detail}</small></span>`;
      button.disabled = complete;
      button.addEventListener("click", () => startCare(r, type));
      options.appendChild(button);
    });
    modal.classList.remove("hidden");
  }

  function startCare(r, type) {
    modal.classList.add("hidden");
    const b = r._bounds;
    const targetX = b.x + b.w / 2;
    const targetY = r.side === "top" ? WORLD.hallTop + 45 : WORLD.hallBottom - 45;
    setTarget(targetX, targetY);
    const task = { resident: r, type, targetX, targetY, started: false };
    const check = () => {
      if (Math.hypot(player.x - task.targetX, player.y - task.targetY) < 14) {
        player.moving = false;
        r.done.push(type.id);
        gameMinutes += 4;
        saveGame();
        updateUI();
        draw();
        showToast(`${type.label} bei ${r.name} erledigt.`);
        return;
      }
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  }

  function updateUI() {
    const total = residents.reduce((sum, r) => sum + r.needs.length, 0);
    const done = residents.reduce((sum, r) => sum + r.done.length, 0);
    document.getElementById("resident-count").textContent = residents.length;
    document.getElementById("done-count").textContent = `${done} / ${total}`;
    document.getElementById("task-counter").textContent = `${total - done} offen`;
    document.getElementById("wellbeing").textContent = done === total ? "Sehr gut" : done >= 6 ? "Gut" : "Stabil";
    document.getElementById("clock").textContent = `${String(Math.floor(gameMinutes / 60) % 24).padStart(2,"0")}:${String(gameMinutes % 60).padStart(2,"0")}`;
    const list = document.getElementById("task-list");
    list.innerHTML = "";
    residents.forEach(r => careTypes.forEach(type => {
      const complete = r.done.includes(type.id);
      const item = document.createElement("div");
      item.className = `task-item${complete ? " done" : ""}`;
      item.innerHTML = `<span class="task-check">${complete ? "✓" : "○"}</span><span class="task-copy"><strong>${type.label} · ${r.name}</strong><span>Zimmer ${r.room} · ${complete ? "Erledigt" : "Noch offen"}</span></span>`;
      item.addEventListener("click", () => openResident(r));
      item.style.cursor = "pointer";
      list.appendChild(item);
    }));
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2500);
  }

  function frame(timestamp) {
    if (!lastFrame) lastFrame = timestamp;
    const dt = Math.min((timestamp - lastFrame) / 1000, .04);
    lastFrame = timestamp;
    if (player.moving) {
      const dx = player.tx - player.x, dy = player.ty - player.y;
      const dist = Math.hypot(dx, dy);
      const step = player.speed * dt;
      if (dist <= step + 1) {
        player.x = player.tx; player.y = player.ty; player.moving = false;
        document.getElementById("movement-status").textContent = "Am Ziel angekommen";
        saveGame();
      } else {
        player.x += dx / dist * step;
        player.y += dy / dist * step;
      }
      draw();
    }
    requestAnimationFrame(frame);
  }

  document.getElementById("close-modal").addEventListener("click", () => modal.classList.add("hidden"));
  modal.addEventListener("click", e => { if (e.target === modal) modal.classList.add("hidden"); });
  document.getElementById("reset-button").addEventListener("click", () => {
    if (!confirm("Möchtest du den Dienst wirklich neu starten? Alle erledigten Aufgaben werden zurückgesetzt.")) return;
    residents.forEach(r => r.done = []);
    player.x = player.tx = 450; player.y = player.ty = 305; player.moving = false; gameMinutes = 420;
    saveGame(); updateUI(); draw(); showToast("Neuer Frühdienst gestartet.");
  });
  canvas.addEventListener("pointerup", onMapTap);
  window.addEventListener("resize", resizeCanvas);

  loadSave();
  resizeCanvas();
  updateUI();
  requestAnimationFrame(frame);
})();
