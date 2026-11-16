import { createBackend, isDemo } from "./backend.js";

const $ = (id) => document.getElementById(id);
const ICONS = {
  plane: '<path d="M3 13l18-8-6 16-3-7-9-1z"/>',
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  peak: '<path d="M2 20l7-12 4 6 2-3 7 9z"/>',
  car: '<path d="M4 15l2-6h12l2 6v4H4z"/><circle cx="8" cy="19" r="1.5"/><circle cx="16" cy="19" r="1.5"/>',
  sofa: '<path d="M4 12V8a2 2 0 012-2h12a2 2 0 012 2v4"/><path d="M2 12h20v6H2z"/><path d="M5 18v2M19 18v2"/>',
  gift: '<path d="M3 9h18v4H3z"/><path d="M5 13v8h14v-8M12 9v12"/><path d="M12 9c-4 0-5-5-2-5 2 0 2 5 2 5zm0 0c4 0 5-5 2-5-2 0-2 5-2 5z"/>',
};
const PRESETS = [501, 1101, 2101, 5101, 11001]; // shagun always ends in 1
const UPI_RE = /^[\w.\-]{2,}@[A-Za-z]{2,}$/;
const QR_RE = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;
const QR_MAX = 380000; // characters; the database rule allows 400000

const wishlistId = new URLSearchParams(location.search).get("w");
const S = { user: null, wl: null, gifts: [], totals: {}, amounts: {}, ready: false, missing: false, desk: false };
let api = null;
// Gifts recorded from this browser, { giftId: amount }, so a guest still sees their own amount.
let mine = {};
try { mine = JSON.parse(localStorage.getItem("shagun-mine-v2")) || {}; } catch (e) { mine = {}; }

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const inr = (n) => "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");
const toInt = (v) => { const s = String(v || "").replace(/[^\d]/g, ""); return s ? parseInt(s, 10) : 0; };
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const banner = (t) => { $("banner").hidden = !t; $("banner").textContent = t || ""; };
const icon = (k) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[k] || ICONS.gift) + "</svg>";
const isOwner = () => !!(S.user && S.wl && S.wl.owner === S.user.uid);
const goalsOf = () => (S.wl && Array.isArray(S.wl.goals) ? S.wl.goals : []);
const raisedFor = (id) => Number(S.totals[id]) || 0;
const saveFailed = (el) => () => { el.textContent = "That didn't save. Check your connection and try again."; };
const DEMO_NOTE = "Demo mode: this site isn't connected to a database yet, so everything is saved only in this browser.";

/* ================= HOME ================= */
async function renderHome() {
  $("home").hidden = false;
  const signedIn = !!S.user;
  $("signedOut").hidden = signedIn;
  $("createBox").hidden = !signedIn;
  $("authBtn").hidden = isDemo || !signedIn;
  $("authBtn").textContent = "Sign out";
  if (!signedIn) { $("mine").hidden = true; return; }
  try {
    const list = await api.listMine();
    $("mine").hidden = !list.length;
    $("mineList").innerHTML = list
      .sort((x, y) => (y.createdAt || 0) - (x.createdAt || 0))
      .map((w) => '<a href="?w=' + encodeURIComponent(w.id) + '">' + esc(w.a) + " &amp; " + esc(w.b) + "</a>").join("");
  } catch (e) { $("mine").hidden = true; }
}

$("signInBtn").addEventListener("click", () => {
  $("signInErr").textContent = "";
  api.signIn().catch(() => { $("signInErr").textContent = "Sign-in didn't finish. Allow pop-ups for this site and try again."; });
});
$("authBtn").addEventListener("click", () => {
  if (S.user) api.signOut(); else api.signIn().catch(() => {});
});
$("createForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const a = $("newA").value.trim(), b = $("newB").value.trim(), upi = $("newUpi").value.trim();
  if (!a || !b) { $("createErr").textContent = "Enter both names."; return; }
  if (!upi) { $("createErr").textContent = "Add the UPI ID where guests should send gifts."; return; }
  if (!UPI_RE.test(upi)) { $("createErr").textContent = "A UPI ID looks like name@bank. Check it and try again."; return; }
  $("createErr").textContent = "";
  api.createWishlist({ a, b, date: $("newDate").value || "", upi })
    .then((id) => { location.href = "?w=" + encodeURIComponent(id); }, saveFailed($("createErr")));
});

/* ================= WISHLIST ================= */
function renderWishlist() {
  $("wishlist").hidden = false;
  const owner = isOwner();
  $("authBtn").hidden = isDemo;
  $("authBtn").textContent = S.user ? "Sign out" : "Couple sign-in";

  if (S.missing) {
    $("names").textContent = "Wishlist not found";
    $("goals").innerHTML = '<p class="empty">This link doesn\'t open a wishlist. Ask the couple to send it again.</p>';
    $("wall").innerHTML = "";
    return;
  }
  const m = S.wl || {};
  $("names").innerHTML = S.wl ? esc(m.a) + ' <span class="amp">&amp;</span> ' + esc(m.b) : "&nbsp;";
  if (S.wl) document.title = m.a + " & " + m.b + " · Shagun Wishlist";
  const d = m.date ? new Date(m.date + "T00:00:00") : null;
  $("date").textContent = d && !isNaN(d)
    ? "Wedding wishlist · " + d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
    : "Wedding wishlist";

  const goals = goalsOf();
  const known = {}; goals.forEach((g) => { known[g.id] = g; });
  let total = 0, target = 0;
  goals.forEach((g) => { total += raisedFor(g.id); target += Number(g.target) || 0; });
  $("raised").textContent = inr(total);
  $("raisedOf").textContent = target ? "raised of " + inr(target) : "";
  $("totalBar").style.width = (target ? Math.min(100, (total / target) * 100) : 0) + "%";

  $("shareBox").hidden = !owner;
  if (owner) {
    const link = location.origin + location.pathname + "?w=" + encodeURIComponent(S.wl.id);
    $("shareLink").textContent = link;
    $("waLink").href = "https://wa.me/?text=" + encodeURIComponent(m.a + " & " + m.b + "'s wedding wishlist: " + link);
  }
  $("deskBtn").hidden = !owner;
  $("deskBtn").classList.toggle("on", S.desk);
  $("deskBtn").setAttribute("aria-pressed", S.desk ? "true" : "false");
  const desk = owner && S.desk;
  $("deskTools").hidden = !desk;

  let gh = "";
  if (!S.ready) gh = '<p class="empty">Loading the wishlist…</p>';
  else if (!goals.length) gh = '<p class="empty">' + (owner ? "No dreams yet. Open the couple's desk and add the first one." : "The couple hasn't added anything yet. Check back soon.") + "</p>";
  goals.forEach((g) => {
    const r = raisedFor(g.id), t = Number(g.target) || 0, p = t ? Math.min(100, (r / t) * 100) : 0, done = t && r >= t;
    gh += '<article class="card"><div class="goal-top"><div class="ico">' + icon(g.icon) + '</div><div class="grow"><h3 class="goal-name">' + esc(g.title) + "</h3></div>" +
      '<span class="pill' + (done ? " done" : "") + '">' + (done ? "Funded" : Math.floor(p) + "% funded") + "</span></div>" +
      '<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.floor(p) + '" aria-label="' + esc(g.title) + ' funded"><i style="width:' + p + '%"></i></div>' +
      '<div class="goal-meta num"><span><b>' + inr(r) + "</b> raised</span><span>Goal " + inr(t) + "</span></div>" +
      '<div class="row"><button class="btn primary grow" data-give="' + esc(g.id) + '">Give shagun</button>' +
      (desk ? '<button class="btn" data-edit="' + esc(g.id) + '">Edit</button>' : "") + "</div></article>";
  });
  $("goals").innerHTML = gh;

  const gifts = S.gifts.slice().sort((x, y) => (y.ts || 0) - (x.ts || 0));
  $("giftCount").textContent = gifts.length ? gifts.length + (gifts.length === 1 ? " gift" : " gifts") : "";
  let wh = "";
  if (S.ready && !gifts.length) wh = '<p class="empty">No gifts yet. Yours could be the first.</p>';
  gifts.forEach((g) => {
    const amt = desk ? S.amounts[g.id] : mine[g.id];
    wh += '<div class="gift"><div><div class="gift-who">' + esc(g.name || "A guest") + "</div>" +
      (g.note ? '<div class="gift-note">' + esc(g.note) + "</div>" : "") +
      '<div class="gift-for">' + esc(known[g.goal] ? known[g.goal].title : "A dream") + "</div></div>" +
      '<div class="gift-side">' + (amt ? '<span class="num">' + inr(amt) + "</span>" : "") +
      (desk ? '<button class="btn small danger" data-rm="' + esc(g.id) + '">Remove</button>' : "") + "</div></div>";
  });
  $("wall").innerHTML = wh;
}

function startWishlist() {
  const timer = setTimeout(() => { if (!S.ready) banner("The wishlist can't be reached yet. It will appear once the connection returns."); }, 10000);
  const got = { w: false, g: false, t: false };
  const mark = (k) => {
    got[k] = true;
    if (got.w && got.g && got.t && !S.ready) { S.ready = true; clearTimeout(timer); banner(isDemo ? DEMO_NOTE : ""); }
    renderWishlist();
  };
  const fail = () => { clearTimeout(timer); S.ready = true; banner("The wishlist couldn't be loaded. Check your connection and reload the page."); renderWishlist(); };
  api.watchWishlist(wishlistId, (w) => { S.wl = w; S.missing = !w; syncAmounts(); mark("w"); }, fail);
  api.watchGifts(wishlistId, (g) => { S.gifts = g; mark("g"); }, fail);
  api.watchTotals(wishlistId, (t) => { S.totals = t; mark("t"); }, fail);
}
// Amounts are private to the couple, so they are only fetched once the owner is signed in.
let stopAmounts = null;
function syncAmounts() {
  if (isOwner() && !stopAmounts) {
    stopAmounts = api.watchAmounts(wishlistId, (a) => { S.amounts = a; renderWishlist(); }, () => {});
  } else if (!isOwner() && stopAmounts) {
    stopAmounts(); stopAmounts = null; S.amounts = {};
  }
}

/* ---------- give flow ---------- */
const give = { amount: 1101 };
function drawChips() {
  $("chips").innerHTML = PRESETS.map((v) => '<button type="button" class="chip num" data-amt="' + v + '" aria-pressed="' + (give.amount === v && !$("giveCustom").value) + '">' + inr(v) + "</button>").join("");
}
function drawEnvelope() {
  $("envAmt").textContent = inr(give.amount);
  const g = goalsOf().find((x) => x.id === $("giveGoal").value);
  $("envFor").textContent = g ? "for " + g.title : "";
  const lucky = give.amount % 10 === 1;
  $("coin").hidden = !lucky;
  $("luckBtn").hidden = lucky || give.amount < 1;
}
function showStep(pay) { $("stepForm").hidden = pay; $("stepPay").hidden = !pay; }
function openGive(goalId) {
  $("giveGoal").innerHTML = goalsOf().map((g) => '<option value="' + esc(g.id) + '">' + esc(g.title) + "</option>").join("");
  $("giveGoal").value = goalId;
  $("giveCustom").value = ""; $("giveErr").textContent = ""; $("payErr").textContent = "";
  give.amount = 1101;
  try { const n = localStorage.getItem("shagun-name"); if (n && !$("giveName").value) $("giveName").value = n; } catch (e) { /* no storage */ }
  drawChips(); drawEnvelope(); showStep(false);
  $("giveDlg").showModal();
}
$("chips").addEventListener("click", (e) => { const b = e.target.closest("[data-amt]"); if (!b) return; give.amount = Number(b.dataset.amt); $("giveCustom").value = ""; drawChips(); drawEnvelope(); });
$("giveCustom").addEventListener("input", function () { give.amount = toInt(this.value) || 1101; drawChips(); drawEnvelope(); });
$("giveGoal").addEventListener("change", drawEnvelope);
$("luckBtn").addEventListener("click", () => { give.amount += 1; $("giveCustom").value = String(give.amount); drawChips(); drawEnvelope(); });
$("backBtn").addEventListener("click", () => showStep(false));
$("giveForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("giveName").value.trim();
  if (!$("giveGoal").value) { $("giveErr").textContent = "Choose what your gift goes towards."; return; }
  if (give.amount < 1 || give.amount > 1000000) { $("giveErr").textContent = "Enter an amount between ₹1 and ₹10,00,000."; return; }
  if (!name) { $("giveErr").textContent = "Add your name so the couple knows who to thank."; return; }
  $("giveErr").textContent = "";
  const m = S.wl || {}, payee = m.a + " & " + m.b;
  if (m.upi) {
    const link = "upi://pay?pa=" + encodeURIComponent(m.upi) + "&pn=" + encodeURIComponent(payee) + "&am=" + give.amount + "&cu=INR&tn=" + encodeURIComponent("Shagun from " + name);
    let qr = "";
    if (QR_RE.test(m.qr || "")) {
      qr = '<div class="label">Or scan the couple\'s QR code and enter <b class="num">' + inr(give.amount) + '</b></div><div class="qr"><img alt="The couple\'s UPI QR code" src="' + esc(m.qr) + '"></div>' +
        '<a class="btn small" download="upi-qr.jpg" href="' + esc(m.qr) + '">Save QR to scan from gallery</a>';
    } else try {
      if (window.qrcode) { const q = window.qrcode(0, "M"); q.addData(link); q.make(); qr = '<div class="label">Or scan this with any UPI app</div><div class="qr">' + q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }) + "</div>"; }
    } catch (err) { qr = ""; }
    $("upiBox").innerHTML = '<div>Pay <b class="num">' + inr(give.amount) + "</b> to " + esc(payee) + ".</div><code>" + esc(m.upi) + "</code>" +
      '<div class="row"><a class="btn small primary" href="' + esc(link) + '">Open UPI app</a><button type="button" class="btn small" id="copyUpi">Copy UPI ID</button></div>' + qr +
      '<div class="label">After paying, come back here and record your gift.</div>';
  } else {
    $("upiBox").innerHTML = "<div>" + esc(payee) + " haven't added a UPI ID yet. Give them <b class=\"num\">" + inr(give.amount) + "</b> directly, then record it here.</div>";
  }
  showStep(true);
});
function copyText(text, btn) {
  const no = () => { btn.textContent = "Copy it from above"; };
  try { navigator.clipboard.writeText(text).then(() => { btn.textContent = "Copied"; }, no); } catch (e) { no(); }
}
$("upiBox").addEventListener("click", (e) => { const b = e.target.closest("#copyUpi"); if (b) copyText((S.wl || {}).upi || "", b); });
$("copyLink").addEventListener("click", function () { copyText($("shareLink").textContent, this); });
$("recordBtn").addEventListener("click", function () {
  const btn = this, name = $("giveName").value.trim(), amount = give.amount;
  btn.disabled = true; $("payErr").textContent = "";
  api.addGift(wishlistId, { goal: $("giveGoal").value, amount, name: name.slice(0, 40), note: $("giveNote").value.trim().slice(0, 140) })
    .then((gid) => {
      mine[gid] = amount;
      try { localStorage.setItem("shagun-mine-v2", JSON.stringify(mine)); localStorage.setItem("shagun-name", name); } catch (e) { /* no storage */ }
      $("giveNote").value = ""; $("giveDlg").close(); renderWishlist();
    })
    .catch(() => { $("payErr").textContent = "Your gift wasn't recorded. Check your connection and try again."; })
    .then(() => { btn.disabled = false; });
});

/* ---------- couple's desk ---------- */
let editing = null, delArmed = false;
function openGoal(id) {
  editing = id ? goalsOf().find((g) => g.id === id) : null; delArmed = false;
  $("goalDlgTitle").textContent = editing ? "Edit this dream" : "Add a dream";
  $("goalTitle").value = editing ? editing.title : "";
  $("goalTarget").value = editing ? String(editing.target) : "";
  $("goalIcon").value = editing ? (ICONS[editing.icon] ? editing.icon : "gift") : "plane";
  $("goalDel").hidden = !editing; $("goalDel").textContent = "Delete"; $("goalErr").textContent = "";
  $("goalDlg").showModal();
}
$("goalForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const title = $("goalTitle").value.trim(), target = toInt($("goalTarget").value);
  if (!title) { $("goalErr").textContent = "Give the dream a name."; return; }
  if (target < 1) { $("goalErr").textContent = "Enter a target amount in rupees."; return; }
  const g = { id: editing ? editing.id : newId(), title, target, icon: $("goalIcon").value };
  const goals = editing ? goalsOf().map((x) => (x.id === g.id ? g : x)) : goalsOf().concat([g]);
  api.updateWishlist(wishlistId, { goals }).then(() => $("goalDlg").close(), saveFailed($("goalErr")));
});
$("goalDel").addEventListener("click", function () {
  if (!delArmed) { delArmed = true; this.textContent = "Tap again to delete"; return; }
  api.updateWishlist(wishlistId, { goals: goalsOf().filter((x) => x.id !== editing.id) }).then(() => $("goalDlg").close(), saveFailed($("goalErr")));
});
$("detailsBtn").addEventListener("click", () => {
  const m = S.wl || {};
  $("metaA").value = m.a || ""; $("metaB").value = m.b || ""; $("metaDate").value = m.date || ""; $("metaUpi").value = m.upi || ""; $("metaErr").textContent = "";
  $("metaQr").value = ""; setQr(QR_RE.test(m.qr || "") ? m.qr : "");
  $("metaDlg").showModal();
});
$("metaForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const a = $("metaA").value.trim(), b = $("metaB").value.trim(), upi = $("metaUpi").value.trim();
  if (!a || !b) { $("metaErr").textContent = "Enter both names."; return; }
  if (upi && !UPI_RE.test(upi)) { $("metaErr").textContent = "A UPI ID looks like name@bank. Check it and try again."; return; }
  api.updateWishlist(wishlistId, { a, b, date: $("metaDate").value || "", upi, qr: newQr || null }).then(() => $("metaDlg").close(), saveFailed($("metaErr")));
});

/* ---------- the couple's own QR image ---------- */
let newQr = "";
function setQr(data) {
  newQr = data;
  $("qrPrev").hidden = !data; $("qrRemove").hidden = !data;
  if (data) $("qrPrev").src = data; else $("qrPrev").removeAttribute("src");
}
// Shrinks the photo in the browser and re-encodes it as a JPEG small enough for one database record.
function shrinkImage(file) {
  return new Promise((ok, no) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onerror = () => { URL.revokeObjectURL(url); no(new Error("unreadable")); };
    img.onload = () => {
      URL.revokeObjectURL(url);
      for (const side of [900, 700, 520, 400]) {
        const k = Math.min(1, side / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
        const x = c.getContext("2d");
        x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
        const data = c.toDataURL("image/jpeg", 0.85);
        if (data.length <= QR_MAX && QR_RE.test(data)) { ok(data); return; }
      }
      no(new Error("too big"));
    };
    img.src = url;
  });
}
$("metaQr").addEventListener("change", function () {
  const f = this.files && this.files[0];
  if (!f) return;
  $("metaErr").textContent = "";
  if (!/^image\//.test(f.type)) { $("metaErr").textContent = "Choose an image file, such as a screenshot of your QR code."; this.value = ""; return; }
  shrinkImage(f).then(setQr, () => { $("metaErr").textContent = "That image couldn't be used. Try a screenshot of the QR code instead."; this.value = ""; });
});
$("qrRemove").addEventListener("click", () => { $("metaQr").value = ""; setQr(""); });

$("deskBtn").addEventListener("click", () => { S.desk = !S.desk; renderWishlist(); });
$("addGoalBtn").addEventListener("click", () => openGoal(null));
$("goals").addEventListener("click", (e) => {
  const g = e.target.closest("[data-give]"); if (g) { openGive(g.dataset.give); return; }
  const ed = e.target.closest("[data-edit]"); if (ed) openGoal(ed.dataset.edit);
});
$("wall").addEventListener("click", (e) => {
  const b = e.target.closest("[data-rm]"); if (!b) return;
  if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Tap again"; return; }
  b.disabled = true;
  const gift = S.gifts.find((g) => g.id === b.dataset.rm);
  if (!gift) return;
  api.removeGift(wishlistId, gift, S.amounts[gift.id] || 0).catch(() => { b.disabled = false; b.textContent = "Try again"; });
});
document.addEventListener("click", (e) => { const c = e.target.closest("[data-close]"); if (c) c.closest("dialog").close(); });

/* ================= BOOT ================= */
async function boot() {
  if (isDemo) banner(DEMO_NOTE);
  if (wishlistId) renderWishlist(); else $("home").hidden = false;
  try {
    api = await createBackend();
  } catch (e) {
    banner("The site couldn't start. Check your connection and reload the page.");
    return;
  }
  api.onAuth((u) => { S.user = u; if (wishlistId) { syncAmounts(); renderWishlist(); } else renderHome(); });
  if (wishlistId) startWishlist();
}
boot();
