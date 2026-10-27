(() => {
  "use strict";
  const BASE_ROOMS = 100, ROOMS_PER_UPGRADE = 20, MAX_UPGRADES = 3, MONTHLY_FEE = 1700;
  const STORAGE_KEY = "altenheimSimulatorSave_v1";
  const upgradeDefinitions = [
    {id:1,name:"Westflügel erweitern",description:"Ein neuer Gebäudeflügel mit zusätzlichen Einzelzimmern.",cost:50000,icon:"🏢"},
    {id:2,name:"Gartenflügel anbauen",description:"Mehr Zimmer mit Blick auf den Innenhof und Garten.",cost:85000,icon:"🌿"},
    {id:3,name:"Neuer Wohnbereich",description:"Ein zusätzlicher Wohnbereich für weitere Bewohner.",cost:125000,icon:"🏡"}
  ];
  const staffCandidates = [
    {id:"pf1",firstName:"Anna",lastName:"Berger",role:"Pflegefachkraft"},
    {id:"pf2",firstName:"Markus",lastName:"Keller",role:"Pflegefachkraft"},
    {id:"pf3",firstName:"Sabine",lastName:"Fischer",role:"Pflegefachkraft"},
    {id:"pf4",firstName:"Thomas",lastName:"Wagner",role:"Pflegefachkraft"},
    {id:"pf5",firstName:"Nadine",lastName:"Schulz",role:"Pflegefachkraft"},
    {id:"pf6",firstName:"Michael",lastName:"Hoffmann",role:"Pflegefachkraft"}
  ];
  const names = [
    ["Hildegard","Müller",84],["Friedrich","Schneider",89],["Erna","Fischer",91],
    ["Wilhelm","Weber",86],["Gertrud","Meyer",88],["Heinrich","Wagner",82],
    ["Margarete","Becker",90],["Karl","Schulz",85],["Elisabeth","Hoffmann",87],
    ["Otto","Schäfer",92],["Anneliese","Koch",83],["Walter","Bauer",88],
    ["Irmgard","Richter",86],["Herbert","Klein",81],["Ingeborg","Wolf",90],
    ["Günther","Schröder",84],["Lieselotte","Neumann",89],["Helmut","Schwarz",87],
    ["Renate","Zimmermann",82],["Rudolf","Braun",91],["Else","Krüger",88],
    ["Werner","Hofmann",85],["Martha","Hartmann",93],["Erich","Lange",86],
    ["Dorothea","Schmitt",84],["Franz","Werner",90],["Ursula","Schmitz",83],
    ["Alfred","Krause",87],["Elfriede","Meier",92],["Hans","Lehmann",89]
  ];
  const careLevels = ["Selbstständig","Leichte Unterstützung","Mittlerer Pflegebedarf","Hoher Pflegebedarf"];
  const roomTypes = ["Einzelzimmer","Einzelzimmer mit Balkon","Barrierefreies Zimmer"];
  const $ = id => document.getElementById(id);
  let gameSpeed = 1;
  let lastRealTime = Date.now();
  let gameMinutes = 8 * 60;
  const REQUEST_INTERVAL_GAME_MINUTES = 4 * 60;
  let state = loadState();
  gameMinutes = Number.isFinite(state.gameMinutes) ? state.gameMinutes : 8 * 60;
  migrateResidentRooms();
  let activeRequestId = null;
  let contractTab = "requests";
  let selectedFloor = 1;
  let activeStaffId = null;
  let toastTimer;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.requests) && Array.isArray(parsed.residents) && Array.isArray(parsed.contracts)) {
          parsed.upgrades = Number.isInteger(parsed.upgrades) ? parsed.upgrades : 0;
          parsed.cash = Number.isFinite(parsed.cash) ? parsed.cash : 250000;
          parsed.gameMinutes = Number.isFinite(parsed.gameMinutes) ? parsed.gameMinutes : 8 * 60;
          parsed.nextRequestAt = Number.isFinite(parsed.nextRequestAt) ? parsed.nextRequestAt : parsed.gameMinutes + REQUEST_INTERVAL_GAME_MINUTES;
          parsed.nextProspectIndex = Number.isInteger(parsed.nextProspectIndex) ? parsed.nextProspectIndex : (parsed.nextId || parsed.requests.length + 1);
          parsed.staff = Array.isArray(parsed.staff) ? parsed.staff : [];
          parsed.staffContracts = Array.isArray(parsed.staffContracts) ? parsed.staffContracts : [];
          return parsed;
        }
      }
    } catch (e) {}
    const requests = [];
    for (let i = 0; i < 6; i++) requests.push(makeRequest(i));
    return { requests, residents: [], contracts: [], staff: [], staffContracts: [], nextId: 7, nextProspectIndex: 7, nextRequestAt: 8 * 60 + REQUEST_INTERVAL_GAME_MINUTES, upgrades: 0, cash: 250000, gameMinutes: 8 * 60 };
  }
  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { showToast("Speichern nicht möglich. Bitte Gerätespeicher prüfen."); }
  }
  function makeRequest(i) {
    const person = names[i % names.length];
    const care = careLevels[(i * 3 + 1) % careLevels.length];
    return {
      id: i + 1, firstName: person[0], lastName: person[1], age: person[2],
      care, room: roomTypes[i % roomTypes.length],
      note: [
        "Wünscht sich einen ruhigen Platz im Garten.",
        "Die Familie unterstützt den Einzug.",
        "Möchte gern an den gemeinsamen Mahlzeiten teilnehmen.",
        "Benötigt Unterstützung bei alltäglichen Aufgaben.",
        "Freut sich auf Gesellschaft und Aktivitäten.",
        "Wünscht ein helles Zimmer."
      ][i % 6],
      date: new Date().toLocaleDateString("de-DE"), status: "offen"
    };
  }
  function createScheduledRequest() {
    const id = Number.isInteger(state.nextId) ? state.nextId : state.requests.reduce((max, r) => Math.max(max, r.id || 0), 0) + 1;
    const personIndex = Number.isInteger(state.nextProspectIndex) ? state.nextProspectIndex : id;
    const request = {
      ...makeRequest(personIndex - 1),
      id,
      date: `Spieltag ${Math.floor(gameMinutes / 1440) + 1}, ${String(Math.floor((gameMinutes % 1440) / 60)).padStart(2, "0")}:${String(Math.floor(gameMinutes % 60)).padStart(2, "0")}`,
      status: "offen"
    };
    state.requests.push(request);
    state.nextId = id + 1;
    state.nextProspectIndex = personIndex + 1;
    showToast(`Neue Bewohneranfrage: ${request.firstName} ${request.lastName} möchte einen Heimvertrag abschließen.`);
  }

  function processScheduledRequests() {
    if (!Number.isFinite(state.nextRequestAt)) state.nextRequestAt = gameMinutes + REQUEST_INTERVAL_GAME_MINUTES;
    while (gameMinutes >= state.nextRequestAt) {
      createScheduledRequest();
      state.nextRequestAt += REQUEST_INTERVAL_GAME_MINUTES;
    }
  }

  // Vier Wohnbereiche: je 25 nutzbare Zimmer zum Start, 30 nach dem ersten Upgrade; weitere Upgrades ergänzen je 5 Zimmer pro Etage.
  function floorName(floor) { return ["", "Wohnbereich A", "Wohnbereich B", "Wohnbereich C", "Wohnbereich D"][floor] || `Wohnbereich ${floor}`; }
  function roomNumberFor(floor, index) { return floor * 100 + index; }
  function floorRoomCapacity() { return 25 + (state.upgrades || 0) * 5; }
  function allRoomSlots() {
    const slots = [];
    for (let floor = 1; floor <= 4; floor++) {
      for (let index = 1; index <= 40; index++) {
        slots.push({ floor, roomNumber: roomNumberFor(floor, index), active: index <= floorRoomCapacity(), extension: index > 30 });
      }
    }
    return slots;
  }
  function getAvailableRoomAssignment() {
    const occupied = new Set(state.residents.map(r => Number(r.roomNumber)).filter(Number.isFinite));
    const counts = [0, 1, 2, 3, 4].map(floor => floor === 0 ? 0 : state.residents.filter(r => Number(r.floor) === floor).length);
    const floors = [1, 2, 3, 4].sort((a, b) => counts[a] - counts[b] || a - b);
    for (const floor of floors) {
      const slot = allRoomSlots().find(item => item.floor === floor && item.active && !occupied.has(item.roomNumber));
      if (slot) return slot;
    }
    return null;
  }
  function migrateResidentRooms() {
    if (!Array.isArray(state.residents)) state.residents = [];
    const slots = allRoomSlots();
    const used = new Set(state.residents.map(r => Number(r.roomNumber)).filter(Number.isFinite));
    const counts = [0, 0, 0, 0, 0];
    state.residents.forEach(resident => {
      if (Number.isFinite(Number(resident.roomNumber)) && resident.floor) { counts[resident.floor] = (counts[resident.floor] || 0) + 1; return; }
      const floors = [1, 2, 3, 4].sort((a, b) => counts[a] - counts[b] || a - b);
      let slot = null;
      for (const floor of floors) { slot = slots.find(item => item.floor === floor && item.active && !used.has(item.roomNumber)); if (slot) break; }
      if (!slot) return;
      resident.roomNumber = slot.roomNumber;
      resident.floor = slot.floor;
      used.add(slot.roomNumber);
      counts[slot.floor]++;
    });
    state.contracts.forEach(contract => {
      const resident = state.residents.find(r => r.contractNo === contract.contractNo);
      if (resident) { contract.roomNumber = resident.roomNumber; contract.floor = resident.floor; }
    });
  }
  function roomOccupant(roomNumber) { return state.residents.find(r => Number(r.roomNumber) === roomNumber); }
  function renderFloorPlan() {
    const host = $("floorPlan");
    if (!host) return;
    document.querySelectorAll("[data-floor]").forEach(btn => btn.classList.toggle("active", Number(btn.dataset.floor) === selectedFloor));
    const floorSlots = allRoomSlots().filter(slot => slot.floor === selectedFloor);
    const residents = state.residents.filter(r => Number(r.floor) === selectedFloor);
    const staff = state.staff.filter(person => Number(person.floor || 1) === selectedFloor);
    const columns = 3;
    const roomRows = [];
    for (let i = 0; i < floorSlots.length; i += columns) {
      roomRows.push(`<div class="room-grid">${floorSlots.slice(i, i + columns).map(slot => {
        const resident = roomOccupant(slot.roomNumber);
        const locked = !slot.active;
        return `<div class="room-slot ${resident ? "occupied" : locked ? "locked" : "vacant"}" data-room-number="${slot.roomNumber}" title="${resident ? escapeHtml(resident.firstName + " " + resident.lastName) : locked ? "Wird durch Gebäude-Upgrades freigeschaltet" : "Freies Zimmer"}">
          <span class="room-number">Zimmer ${slot.roomNumber}</span>
          <span class="room-icon">${resident ? "●" : locked ? "🔒" : "○"}</span>
          <span class="room-resident">${resident ? escapeHtml(resident.firstName + " " + resident.lastName) : locked ? "Gesperrt" : "Frei"}</span>
          <span class="room-door" aria-hidden="true"></span>
        </div>`;
      }).join("")}</div>${i + columns < floorSlots.length ? `<div class="room-walkway" data-walkway><span>Flur · freie Laufzone</span></div>` : ""}`);
    }
    $("floorTitle").textContent = `${selectedFloor}. Etage · ${floorName(selectedFloor)}`;
    $("floorOccupancy").textContent = `${residents.length} Bewohner · ${floorSlots.filter(slot => slot.active).length} Zimmer · ${staff.length} Pflegekräfte`;
    host.innerHTML = `
      <div class="floor-plan-corridor" data-walkway><span>Hauptflur <small>· Zugang zu allen Zimmern</small></span></div>
      <div class="floor-rooms">${roomRows.join("")}</div>
      <div class="station-room" data-station><div class="station-sign">✚</div><div><strong>Stationszimmer</strong><small>Pflegeplanung · Dokumentation · Dienststützpunkt</small><span class="station-status">${staff.filter(person => !person.task || person.task === "idle").length} Pflegekräfte im Bereitschaftsraum</span></div></div>
      <div class="common-area"><span class="common-icon">☕</span><div><strong>Aufenthaltsraum</strong><small>Gemeinsame Mahlzeiten, Gespräche und betreute Aktivitäten</small></div></div>
      <div class="walker-layer" aria-label="Bewohner und Pflegekräfte, die sich auf dieser Etage bewegen">${residents.map((resident, i) => `<span class="walker resident-walker" data-walker-id="${escapeHtml(resident.id)}" title="Bewohner: ${escapeHtml(resident.firstName + " " + resident.lastName)}" style="left:${8 + (i * 17 % 84)}%;top:3%">${escapeHtml(initials(resident))}</span>`).join("")}${staff.map((person, i) => `<span class="walker staff-walker ${!person.task || person.task === "idle" ? "staff-idle" : "staff-working"}" data-staff-walker-id="${escapeHtml(person.id)}" title="Pflegekraft: ${escapeHtml(person.firstName + " " + person.lastName)}" style="left:${15 + (i * 21 % 70)}%;top:7%">${!person.task || person.task === "idle" ? "✚" : "＋"}</span>`).join("")}</div>`;
    updateWalkers();
  }
  function updateWalkers() {
    const page = $("page-floorplan");
    const host = $("floorPlan");
    const layer = host && host.querySelector(".walker-layer");
    if (!page || page.classList.contains("hidden") || !layer) return;
    const layerRect = layer.getBoundingClientRect();
    const walkways = [...host.querySelectorAll("[data-walkway]")];
    const roomTargets = [...host.querySelectorAll(".room-slot.occupied")];
    const station = host.querySelector("[data-station]");
    const commonArea = host.querySelector(".common-area");
    const moveTo = (walker, target, biasX = null) => {
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const x = biasX == null ? rect.left - layerRect.left + Math.random() * Math.max(1, rect.width - 24) : rect.left - layerRect.left + rect.width * biasX;
      const y = rect.top - layerRect.top + Math.max(2, rect.height * (0.35 + Math.random() * 0.3));
      walker.style.left = `${Math.max(0, Math.min(layerRect.width - 24, x))}px`;
      walker.style.top = `${Math.max(0, Math.min(layerRect.height - 24, y))}px`;
      walker.classList.toggle("walking-left", Math.random() < 0.5);
    };
    layer.querySelectorAll(".resident-walker").forEach(walker => {
      const target = Math.random() < .25 && commonArea ? commonArea : walkways[Math.floor(Math.random() * Math.max(1, walkways.length))];
      moveTo(walker, target);
    });
    layer.querySelectorAll(".staff-walker").forEach(walker => {
      const person = state.staff.find(item => String(item.id) === walker.dataset.staffWalkerId);
      if (!person || !person.task || person.task === "idle") { moveTo(walker, station); return; }
      if (person.task === "feed" || person.task === "accompany") {
        moveTo(walker, commonArea || walkways[0]);
        return;
      }
      const assigned = state.residents.find(r => String(r.id) === String(person.targetResidentId) && Number(r.floor) === selectedFloor);
      const target = assigned && host.querySelector(`[data-room-number="${Number(assigned.roomNumber)}"]`);
      moveTo(walker, target || roomTargets[Math.floor(Math.random() * Math.max(1, roomTargets.length))] || walkways[0], .5);
    });
  }
  function refreshFloorIfVisible() {
    const page = $("page-floorplan");
    if (page && !page.classList.contains("hidden")) renderFloorPlan();
  }

  function initials(person) { return (person.firstName[0] + person.lastName[0]).toUpperCase(); }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  }
  function openPage(page) {
    document.querySelectorAll(".page").forEach(el => el.classList.toggle("hidden", el.id !== `page-${page}`));
    document.querySelectorAll(".nav-btn").forEach(el => el.classList.toggle("active", el.dataset.page === page));
    if (page === "contracts") renderContracts();
    if (page === "residents") renderResidents();
    if (page === "finances") renderFinances();
    if (page === "upgrades") renderUpgrades();
    if (page === "floorplan") renderFloorPlan();
    if (page === "staff") renderStaff();
    window.scrollTo({top: 0, behavior: "smooth"});
  }
  function render() {
    const count = state.residents.length;
    const openCount = state.requests.filter(r => r.status === "offen").length;
    const capacity = BASE_ROOMS + (state.upgrades || 0) * ROOMS_PER_UPGRADE;
    $("residentCount").textContent = `${count} / ${capacity}`;
    $("requestCount").textContent = openCount;
    $("navRequestCount").textContent = openCount;
    $("occupiedMetric").textContent = count;
    $("freeMetric").textContent = capacity - count;
    $("contractMetric").textContent = state.contracts.length;
    $("requestsTabCount").textContent = openCount;
    $("signedTabCount").textContent = state.contracts.length;
    $("residentTotalLabel").textContent = `${count} Bewohner`;
    $("overviewNotice").textContent = count >= capacity
      ? `Alle ${capacity} Plätze sind belegt. Kaufe ein Gebäude-Upgrade, um weitere Zimmer zu schaffen.`
      : openCount ? `Du hast ${openCount} offene Zimmeranfrage${openCount === 1 ? "" : "n"}. Prüfe die Angaben und schließe bei passender Anfrage einen Heimvertrag ab.`
      : "Aktuell sind keine offenen Anfragen vorhanden. Neue Zimmeranfragen werden im Spiel nach und nach eingehen.";
    renderContracts();
    renderResidents();
    renderFinances();
    renderUpgrades();
    renderStaff();
    updateClockDisplay();
    saveState();
  }
  function emptyState(icon, title, body) {
    return `<div class="empty-state"><div class="empty-icon">${icon}</div><b>${title}</b><p>${body}</p></div>`;
  }
  function requestCard(r) {
    return `<article class="request-card">
      <div class="avatar">${escapeHtml(initials(r))}</div>
      <div class="person-main"><h3>${escapeHtml(r.firstName)} ${escapeHtml(r.lastName)}</h3>
        <p>${r.age} Jahre alt · Anfrage vom ${escapeHtml(r.date)}</p>
        <div class="tag-row"><span class="tag">${escapeHtml(r.room)}</span><span class="tag">${escapeHtml(r.care)}</span></div>
        <p style="margin-top:8px">${escapeHtml(r.note)}</p>
      </div>
      <div class="request-actions"><button class="primary-btn" data-contract="${r.id}">Vertrag prüfen</button><button class="secondary-btn" data-decline="${r.id}">Ablehnen</button></div>
    </article>`;
  }
  function residentCard(r) {
    return `<article class="resident-card"><div class="avatar">${escapeHtml(initials(r))}</div>
      <div class="person-main"><h3>${escapeHtml(r.firstName)} ${escapeHtml(r.lastName)}</h3>
      <p>${r.age} Jahre · Eingezogen am ${escapeHtml(r.moveInDate || "—")}</p>
      <div class="tag-row"><span class="tag">Zimmer ${escapeHtml(r.roomNumber || "—")}</span><span class="tag">${escapeHtml(r.floor ? floorName(r.floor) : r.room)}</span><span class="tag">${escapeHtml(r.care)}</span><span class="tag">Vertrag #${r.contractNo}</span></div></div>
      <span class="resident-state">Aufgenommen</span></article>`;
  }
  function renderContracts() {
    const requests = state.requests.filter(r => r.status === "offen");
    const signed = state.contracts.slice().reverse();
    $("requestList").classList.toggle("hidden", contractTab !== "requests");
    $("signedList").classList.toggle("hidden", contractTab !== "signed");
    $("requestList").innerHTML = requests.length ? requests.map(requestCard).join("") : emptyState("✓", "Keine offenen Anfragen", "Alle aktuellen Zimmeranfragen wurden bearbeitet.");
    $("signedList").innerHTML = signed.length ? signed.map(c => `<article class="resident-card"><div class="avatar">✓</div><div class="person-main"><h3>${escapeHtml(c.firstName)} ${escapeHtml(c.lastName)}</h3><p>Heimvertrag #${c.contractNo} · abgeschlossen am ${escapeHtml(c.signedAt)}</p><div class="tag-row"><span class="tag">Zimmer ${escapeHtml(c.roomNumber || "—")}</span><span class="tag">${escapeHtml(c.floor ? floorName(c.floor) : c.room)}</span><span class="tag">${escapeHtml(c.care)}</span></div></div><span class="resident-state">Unterschrieben</span></article>`).join("") : emptyState("▤", "Noch keine Verträge", "Abgeschlossene Heimverträge erscheinen hier.");
  }
  function renderResidents() {
    const q = ($("residentSearch").value || "").trim().toLocaleLowerCase("de-DE");
    const residents = state.residents.filter(r => `${r.firstName} ${r.lastName}`.toLocaleLowerCase("de-DE").includes(q));
    $("residentList").innerHTML = residents.length ? residents.map(residentCard).join("") : emptyState("⌕", q ? "Niemand gefunden" : "Noch keine Bewohner", q ? "Versuche einen anderen Namen." : "Bewohner ziehen nach Abschluss eines Heimvertrags ein.");
  }
  function showToast(message) {
    $("toast").textContent = message;
    $("toast").classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $("toast").classList.remove("show"), 2800);
  }
  function openContract(id) {
    const r = state.requests.find(item => item.id === id && item.status === "offen");
    if (!r) return;
    if (state.residents.length >= getCapacity()) { showToast("Das Heim hat aktuell keine freien Zimmer mehr. Kaufe ein Gebäude-Upgrade für zusätzliche Plätze."); return; }
    activeRequestId = id;
    const roomPreview = getAvailableRoomAssignment();
    $("modalError").classList.add("hidden");
    $("contractDocument").innerHTML = `
      <div class="doc-title">Heimvertrag</div><div class="doc-subtitle">Altenheim Simulator · Laurentiushaus</div>
      <div class="doc-section"><h4>1. Vertragsparteien</h4><div class="doc-grid">
        <div class="doc-field"><span>Heimleitung / Vertragspartner</span><strong>Du – Heimleitung Laurentiushaus</strong></div>
        <div class="doc-field"><span>Bewohner / Vertragspartner</span><strong>${escapeHtml(r.firstName)} ${escapeHtml(r.lastName)}</strong></div>
      </div></div>
      <div class="doc-section"><h4>2. Bewohnerdaten</h4><div class="doc-grid">
        <div class="doc-field"><span>Alter</span><strong>${r.age} Jahre</strong></div>
        <div class="doc-field"><span>Zimmertyp</span><strong>${escapeHtml(r.room)}</strong></div>
        <div class="doc-field"><span>Zimmernummer / Etage</span><strong>${roomPreview ? `${roomPreview.roomNumber} · ${roomPreview.floor}. Etage` : "Kein freies Zimmer"}</strong></div>
        <div class="doc-field"><span>Pflegebedarf</span><strong>${escapeHtml(r.care)}</strong></div>
        <div class="doc-field"><span>Monatlicher Beitrag</span><strong>${formatEuro(MONTHLY_FEE)}</strong></div>
        <div class="doc-field"><span>Aufnahmedatum</span><strong>${escapeHtml(new Date().toLocaleDateString("de-DE"))}</strong></div>
      </div></div>
      <div class="doc-section"><h4>3. Vereinbarung</h4><p class="contract-copy">Die Heimleitung und der oben genannte Bewohner vereinbaren im Rahmen dieser Simulation die Aufnahme in das Laurentiushaus. Das Heim stellt ein Zimmer entsprechend der Anfrage bereit. Die Betreuung richtet sich nach dem im Spiel hinterlegten Pflegebedarf. Mit Bestätigung dieses Dialogs gilt der Vertrag im Spiel als abgeschlossen und der Bewohner wird in das Heim aufgenommen.</p></div>
      <div class="signature-row"><div class="signature">Unterschrift Heimleitung (Spiel)</div><div class="signature">Unterschrift Bewohner (Spiel)</div></div>`;
    $("contractModal").classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }
  function closeModal() {
    $("contractModal").classList.add("hidden");
    document.body.style.overflow = "";
    activeRequestId = null;
  }
  function signContract() {
    if (activeRequestId == null) return;
    if (state.residents.length >= getCapacity()) {
      $("modalError").textContent = "Das Heim hat aktuell keine freien Zimmer mehr. Kaufe ein Gebäude-Upgrade für zusätzliche Plätze.";
      $("modalError").classList.remove("hidden"); return;
    }
    const index = state.requests.findIndex(r => r.id === activeRequestId && r.status === "offen");
    if (index < 0) { closeModal(); return; }
    const r = state.requests[index];
    const roomAssignment = getAvailableRoomAssignment();
    if (!roomAssignment) { showToast("Es ist kein Zimmer mehr frei. Bitte erweitere das Gebäude."); return; }
    const contractNo = state.contracts.length + 1;
    const signedAt = new Date().toLocaleDateString("de-DE");
    const resident = {...r, contractNo, moveInDate: signedAt, status: "aufgenommen", monthlyFee: MONTHLY_FEE, monthlyCost: 0, roomType: r.room, roomNumber: roomAssignment.roomNumber, floor: roomAssignment.floor};
    const contract = {...resident, signedAt, monthlyFee: MONTHLY_FEE, parties: ["Heimleitung Laurentiushaus", `${r.firstName} ${r.lastName}`]};
    state.contracts.push(contract);
    state.residents.push(resident);
    state.requests[index].status = "angenommen";
    closeModal();
    render();
    refreshFloorIfVisible();
    showToast(`Heimvertrag abgeschlossen – ${r.firstName} ${r.lastName} ist eingezogen.`);
  }
  function declineRequest(id) {
    const r = state.requests.find(item => item.id === id && item.status === "offen");
    if (!r) return;
    r.status = "abgelehnt";
    render();
    showToast(`Anfrage von ${r.firstName} ${r.lastName} abgelehnt.`);
  }


  function getCapacity() { return BASE_ROOMS + (state.upgrades || 0) * ROOMS_PER_UPGRADE; }
  function formatEuro(amount) {
    return new Intl.NumberFormat("de-DE", {style:"currency", currency:"EUR", maximumFractionDigits:0}).format(amount);
  }
  function renderFinances() {
    const income = state.residents.reduce((sum, r) => sum + (Number(r.monthlyFee) || MONTHLY_FEE), 0);
    const residentCosts = state.residents.reduce((sum, r) => sum + (Number(r.monthlyCost) || 0), 0);
    const staffCosts = state.staff.reduce((sum, person) => sum + (Number(person.monthlySalary) || 0), 0);
    const costs = residentCosts + staffCosts;
    $("monthlyIncome").textContent = formatEuro(income);
    $("monthlyCosts").textContent = formatEuro(costs);
    $("monthlyBalance").textContent = formatEuro(income - costs);
    const residentRows = state.residents.map(r => `<div class="finance-row"><div><strong>${escapeHtml(r.firstName)} ${escapeHtml(r.lastName)}</strong><small>Monatsbeitrag · Heimvertrag #${r.contractNo}</small></div><div class="finance-amount income">+${formatEuro(Number(r.monthlyFee) || MONTHLY_FEE)}</div></div>`);
    const staffRows = state.staff.map(person => `<div class="finance-row"><div><strong>${escapeHtml(person.firstName)} ${escapeHtml(person.lastName)} · Pflege</strong><small>Monatsgehalt · Arbeitsvertrag #${person.contractNo}</small></div><div class="finance-amount expense">−${formatEuro(Number(person.monthlySalary) || 0)}</div></div>`);
    $("financeList").innerHTML = residentRows.concat(staffRows).join("") || emptyState("€", "Noch keine Buchungen", "Bewohnerbeiträge und Personalkosten erscheinen nach Vertragsabschlüssen hier.");
  }
  function renderUpgrades() {
    const count = state.upgrades || 0;
    $("capacityDisplay").textContent = `${getCapacity()} Zimmer`;
    $("upgradeProgress").textContent = `${count} von ${MAX_UPGRADES} Upgrades gekauft · maximal ${BASE_ROOMS + MAX_UPGRADES * ROOMS_PER_UPGRADE} Zimmer`;
    $("upgradeList").innerHTML = upgradeDefinitions.map(u => {
      const bought = count >= u.id, locked = !bought && u.id > count + 1;
      return `<article class="upgrade-card"><div class="upgrade-icon">${u.icon}</div><div class="upgrade-info"><h3>${u.id}. ${escapeHtml(u.name)}</h3><p>${escapeHtml(u.description)} <b>+${ROOMS_PER_UPGRADE} Zimmer</b></p></div><div class="upgrade-action">${bought ? '<span class="purchased-tag">✓ Gekauft</span>' : `<span class="upgrade-price">${formatEuro(u.cost)}</span><button class="${locked ? 'secondary-btn' : 'primary-btn'}" data-upgrade="${u.id}" ${locked ? 'disabled' : ''}>${locked ? 'Gesperrt' : 'Ausbauen'}</button>`}</div></article>`;
    }).join("");
  }
  function buyUpgrade(id) {
    const u = upgradeDefinitions.find(item => item.id === id);
    if (!u || id !== (state.upgrades || 0) + 1) return;
    if ((state.upgrades || 0) >= MAX_UPGRADES) { showToast("Alle Gebäude-Upgrades sind bereits gekauft."); return; }
    if (state.cash < u.cost) { showToast(`Nicht genug Spielgeld. Benötigt werden ${formatEuro(u.cost)}.`); return; }
    state.cash -= u.cost;
    state.upgrades = (state.upgrades || 0) + 1;
    render();
    refreshFloorIfVisible();
    showToast(`${u.name}: 20 zusätzliche Zimmer freigeschaltet.`);
  }
  function renderStaff() {
    const candidatesHost = $("staffCandidateList"), staffHost = $("staffList");
    if (!candidatesHost || !staffHost) return;
    const hiredIds = new Set(state.staff.map(person => person.candidateId));
    const available = staffCandidates.filter(person => !hiredIds.has(person.id));
    $("staffCount").textContent = state.staff.length;
    $("staffCosts").textContent = formatEuro(state.staff.reduce((sum, person) => sum + (Number(person.monthlySalary) || 0), 0));
    $("staffCandidatesCount").textContent = available.length;
    candidatesHost.innerHTML = available.length ? available.map(person => `<article class="request-card staff-candidate"><div class="avatar">${escapeHtml(initials(person))}</div><div class="person-main"><h3>${escapeHtml(person.firstName)} ${escapeHtml(person.lastName)}</h3><p>${escapeHtml(person.role)} · verfügbar für einen Arbeitsvertrag</p><div class="tag-row"><span class="tag">Gehalt: 900–1.100 € / Monat</span><span class="tag">Einsatz in allen Wohnbereichen</span></div></div><div class="request-actions"><button class="primary-btn" data-staff-contract="${person.id}">Arbeitsvertrag</button></div></article>`).join("") : emptyState("✓", "Alle Bewerber eingestellt", "Aktuell stehen keine weiteren Bewerber auf der Liste.");
    staffHost.innerHTML = state.staff.length ? state.staff.map(person => {
      const task = person.task || "idle";
      const targetOptions = state.residents.map(r => `<option value="${escapeHtml(r.id)}" ${String(person.targetResidentId) === String(r.id) ? "selected" : ""}>${escapeHtml(r.firstName)} ${escapeHtml(r.lastName)} · Zi. ${r.roomNumber}</option>`).join("");
      return `<article class="resident-card staff-employee"><div class="avatar staff-avatar">✚</div><div class="person-main"><h3>${escapeHtml(person.firstName)} ${escapeHtml(person.lastName)}</h3><p>${escapeHtml(person.role || "Pflegefachkraft")} · Arbeitsvertrag #${person.contractNo}</p><div class="tag-row"><span class="tag">${formatEuro(person.monthlySalary)} / Monat</span><span class="tag">${escapeHtml(floorName(Number(person.floor) || 1))}</span><span class="tag">Seit ${escapeHtml(person.hiredAt)}</span></div><div class="staff-task-controls"><label>Tätigkeit <select data-staff-task="${escapeHtml(person.id)}"><option value="idle" ${task==="idle"?"selected":""}>Bereitschaft im Stationszimmer</option><option value="care" ${task==="care"?"selected":""}>Pflege / Bewohner versorgen</option><option value="feed" ${task==="feed"?"selected":""}>Essen eingeben</option><option value="accompany" ${task==="accompany"?"selected":""}>Bewohner betreuen / begleiten</option></select></label>${task==="care" ? `<label>Bewohner <select data-staff-target="${escapeHtml(person.id)}"><option value="">Automatisch auswählen</option>${targetOptions}</select></label>` : ""}<p class="task-status">${task==="idle"?"Wartet im Stationszimmer – keine aktive Aufgabe.":`Aktiv: ${{care:"Pflege / Bewohner versorgen",feed:"Essen eingeben",accompany:"Bewohner betreuen / begleiten"}[task] || "Aufgabe"} · läuft bis zum Abbruch.`}</p></div></div><span class="resident-state">${task==="idle"?"Bereit":"Im Dienst"}</span></article>`;
    }).join("") : emptyState("✚", "Noch kein Pflegepersonal", "Stelle deine erste Pflegekraft mit einem Arbeitsvertrag ein.");
  }
  function openStaffContract(candidateId) {
    const person = staffCandidates.find(item => item.id === candidateId);
    if (!person || state.staff.some(item => item.candidateId === candidateId)) return;
    activeStaffId = candidateId;
    const salary = 900 + Math.floor(Math.random() * 201);
    $("staffContractDocument").dataset.salary = String(salary);
    $("staffContractDocument").innerHTML = `<div class="doc-title">Arbeitsvertrag – Pflege</div><div class="doc-subtitle">Altenheim Simulator · Laurentiushaus</div><div class="doc-section"><h4>1. Vertragsparteien</h4><div class="doc-grid"><div class="doc-field"><span>Arbeitgeber</span><strong>Laurentiushaus</strong></div><div class="doc-field"><span>Mitarbeiter</span><strong>${escapeHtml(person.firstName)} ${escapeHtml(person.lastName)}</strong></div></div></div><div class="doc-section"><h4>2. Beschäftigung</h4><div class="doc-grid"><div class="doc-field"><span>Position</span><strong>Pflegefachkraft</strong></div><div class="doc-field"><span>Monatliches Gehalt</span><strong>${formatEuro(salary)}</strong></div><div class="doc-field"><span>Einsatzort</span><strong>Wohnbereiche A–D</strong></div><div class="doc-field"><span>Beginn</span><strong>${escapeHtml(new Date().toLocaleDateString("de-DE"))}</strong></div></div></div><div class="doc-section"><h4>3. Vereinbarung</h4><p class="contract-copy">Die Pflegekraft wird zur Betreuung und Unterstützung der Bewohner im Laurentiushaus eingestellt. Das vereinbarte Monatsgehalt beträgt ${formatEuro(salary)}. Die Personalkosten werden in der Finanzübersicht monatlich berücksichtigt. Die Pflegekraft kann sich in den Wohnbereichen bewegen und Bewohnerzimmer aufsuchen.</p></div><div class="signature-row"><div class="signature">Unterschrift Heimleitung (Spiel)</div><div class="signature">Unterschrift Mitarbeiter (Spiel)</div></div>`;
    $("staffContractModal").classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }
  function closeStaffModal() {
    $("staffContractModal").classList.add("hidden");
    document.body.style.overflow = "";
    activeStaffId = null;
  }
  function signStaffContract() {
    if (!activeStaffId) return;
    const candidate = staffCandidates.find(item => item.id === activeStaffId);
    if (!candidate || state.staff.some(item => item.candidateId === activeStaffId)) { closeStaffModal(); return; }
    const salary = Number($("staffContractDocument").dataset.salary) || 1000;
    const floorCounts = [1, 2, 3, 4].map(floor => ({floor, count: state.staff.filter(person => Number(person.floor) === floor).length})).sort((a,b) => a.count-b.count || a.floor-b.floor);
    const contractNo = state.staffContracts.length + 1;
    const employee = {...candidate, id:candidate.id, candidateId:candidate.id, contractNo, hiredAt:new Date().toLocaleDateString("de-DE"), monthlySalary:salary, floor:floorCounts[0].floor, task:"idle", targetResidentId:null};
    state.staff.push(employee);
    state.staffContracts.push({...employee, signedAt:employee.hiredAt});
    closeStaffModal();
    render();
    refreshFloorIfVisible();
    showToast(`Arbeitsvertrag unterschrieben: ${candidate.firstName} ${candidate.lastName} (${formatEuro(salary)} / Monat).`);
  }

  function updateClockDisplay() {
    const total = Math.floor(gameMinutes), day = Math.floor(total / 1440), minuteOfDay = total % 1440;
    const date = new Date(Date.UTC(2027, 0, 1 + day));
    const dateText = date.toLocaleDateString("de-DE", {timeZone:"UTC"});
    const hh = String(Math.floor(minuteOfDay / 60)).padStart(2,"0");
    const mm = String(minuteOfDay % 60).padStart(2,"0");
    const stamp = `${dateText} ${hh}:${mm}`;
    if ($("gameClock")) $("gameClock").textContent = stamp;
    if ($("overviewClock")) $("overviewClock").textContent = stamp;
  }
  function setSpeed(speed) {
    gameSpeed = speed;
    document.querySelectorAll(".speed-btn").forEach(btn => btn.classList.toggle("active", Number(btn.dataset.speed) === speed));
    showToast(`Spielgeschwindigkeit ×${speed}`);
  }
  function gameClockTick() {
    const now = Date.now(), elapsedMs = Math.min(now - lastRealTime, 5000);
    lastRealTime = now;
    gameMinutes += (elapsedMs / 60000) * 60 * gameSpeed;
    state.gameMinutes = gameMinutes;
    processScheduledRequests();
    updateClockDisplay();
    render();
  }

  document.querySelectorAll(".nav-btn").forEach(btn => btn.addEventListener("click", () => openPage(btn.dataset.page)));
  document.querySelectorAll("[data-goto]").forEach(btn => btn.addEventListener("click", () => openPage(btn.dataset.goto)));
  document.querySelectorAll("[data-contract-tab]").forEach(btn => btn.addEventListener("click", () => {
    contractTab = btn.dataset.contractTab;
    document.querySelectorAll("[data-contract-tab]").forEach(b => b.classList.toggle("active", b === btn));
    renderContracts();
  }));
  document.addEventListener("click", e => {
    const contractBtn = e.target.closest("[data-contract]");
    const declineBtn = e.target.closest("[data-decline]");
    if (contractBtn) openContract(Number(contractBtn.dataset.contract));
    if (declineBtn) declineRequest(Number(declineBtn.dataset.decline));
    const upgradeBtn = e.target.closest("[data-upgrade]");
    if (upgradeBtn) buyUpgrade(Number(upgradeBtn.dataset.upgrade));
    const staffBtn = e.target.closest("[data-staff-contract]");
    if (staffBtn) openStaffContract(staffBtn.dataset.staffContract);
    if (e.target.closest("[data-close-modal]")) closeModal();
    if (e.target.closest("[data-close-staff-modal]")) closeStaffModal();
  });
  document.addEventListener("change", e => {
    const taskSelect = e.target.closest("[data-staff-task]");
    if (taskSelect) {
      const person = state.staff.find(item => String(item.id) === taskSelect.dataset.staffTask);
      if (person) {
        person.task = taskSelect.value;
        if (person.task === "care" && !person.targetResidentId) person.targetResidentId = state.residents.find(r => Number(r.floor) === Number(person.floor))?.id || state.residents[0]?.id || null;
        render();
        refreshFloorIfVisible();
        showToast(person.task === "idle" ? `${person.firstName} wartet wieder im Stationszimmer.` : `${person.firstName}: Tätigkeit läuft bis du sie änderst oder abbrichst.`);
      }
    }
    const targetSelect = e.target.closest("[data-staff-target]");
    if (targetSelect) {
      const person = state.staff.find(item => String(item.id) === targetSelect.dataset.staffTarget);
      if (person) { person.targetResidentId = targetSelect.value || null; saveState(); refreshFloorIfVisible(); }
    }
  });
  document.querySelectorAll("[data-floor]").forEach(btn => btn.addEventListener("click", () => { selectedFloor = Number(btn.dataset.floor); renderFloorPlan(); }));
  $("signContractBtn").addEventListener("click", signContract);
  $("signStaffContractBtn").addEventListener("click", signStaffContract);
  document.querySelectorAll("[data-speed]").forEach(btn => btn.addEventListener("click", () => setSpeed(Number(btn.dataset.speed))));
  setInterval(gameClockTick, 1000);
  setInterval(updateWalkers, 4300);
  $("residentSearch").addEventListener("input", renderResidents);
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("contractModal").classList.contains("hidden")) closeModal(); else if (e.key === "Escape" && !$("staffContractModal").classList.contains("hidden")) closeStaffModal(); });
  render();
})();