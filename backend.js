// Data layer. Two implementations with the same interface:
//  - firebaseBackend: real, shared data (Firestore) and Google sign-in for the couple.
//  - demoBackend: used until firebase-config.js is filled in; saves in this browser only.
import { firebaseConfig } from "./firebase-config.js";

const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";

export const isDemo = !firebaseConfig.apiKey;

export async function createBackend() {
  return isDemo ? demoBackend() : firebaseBackend();
}

/* ---------------- Firebase ---------------- */
async function firebaseBackend() {
  const [appMod, authMod, fs] = await Promise.all([
    import(SDK + "firebase-app.js"),
    import(SDK + "firebase-auth.js"),
    import(SDK + "firebase-firestore.js"),
  ]);
  const app = appMod.initializeApp(firebaseConfig);
  const auth = authMod.getAuth(app);
  const db = fs.getFirestore(app);
  const uid = () => (auth.currentUser ? auth.currentUser.uid : null);

  return {
    onAuth(cb) {
      authMod.onAuthStateChanged(auth, (u) => cb(u ? { uid: u.uid } : null));
    },
    signIn() {
      return authMod.signInWithPopup(auth, new authMod.GoogleAuthProvider());
    },
    signOut() {
      return authMod.signOut(auth);
    },
    async createWishlist(data) {
      const ref = await fs.addDoc(fs.collection(db, "wishlists"), {
        ...data, goals: [], owner: uid(), createdAt: Date.now(),
      });
      return ref.id;
    },
    async listMine() {
      const q = fs.query(fs.collection(db, "wishlists"), fs.where("owner", "==", uid()));
      const snap = await fs.getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    watchWishlist(id, cb, onErr) {
      return fs.onSnapshot(fs.doc(db, "wishlists", id),
        (s) => cb(s.exists() ? { id: s.id, ...s.data() } : null), onErr);
    },
    watchGifts(id, cb, onErr) {
      return fs.onSnapshot(fs.collection(db, "wishlists", id, "gifts"), (q) => cb(q.docs.map((d) => {
        const g = d.data({ serverTimestamps: "estimate" });
        return { id: d.id, goal: g.goal, name: g.name, note: g.note, ts: g.ts && g.ts.toMillis ? g.ts.toMillis() : 0 };
      })), onErr);
    },
    // Public running total per dream: { goalId: rupees }.
    watchTotals(id, cb, onErr) {
      return fs.onSnapshot(fs.collection(db, "wishlists", id, "totals"), (q) => {
        const t = {}; q.docs.forEach((d) => { t[d.id] = d.data().raised || 0; }); cb(t);
      }, onErr);
    },
    // Couple only: { giftId: rupees }. The rules refuse this for anyone else.
    watchAmounts(id, cb, onErr) {
      return fs.onSnapshot(fs.collection(db, "wishlists", id, "amounts"), (q) => {
        const a = {}; q.docs.forEach((d) => { a[d.id] = d.data().amount || 0; }); cb(a);
      }, onErr);
    },
    // Saving the dreams also keeps one totals record per dream, in the same write.
    async updateWishlist(id, patch) {
      const batch = fs.writeBatch(db);
      const p = { ...patch };
      if (p.qr === null) p.qr = fs.deleteField(); // null means "remove the QR image"
      batch.update(fs.doc(db, "wishlists", id), p);
      if (patch.goals) {
        const have = await fs.getDocs(fs.collection(db, "wishlists", id, "totals"));
        const ids = patch.goals.map((g) => g.id);
        const seen = have.docs.map((d) => d.id);
        ids.filter((g) => seen.indexOf(g) < 0).forEach((g) => batch.set(fs.doc(db, "wishlists", id, "totals", g), { raised: 0, last: "" }));
        seen.filter((g) => ids.indexOf(g) < 0).forEach((g) => batch.delete(fs.doc(db, "wishlists", id, "totals", g)));
      }
      return batch.commit();
    },
    // One all-or-nothing write: the public gift, its private amount, and the dream's total.
    async addGift(id, gift) {
      const ref = fs.doc(fs.collection(db, "wishlists", id, "gifts"));
      const batch = fs.writeBatch(db);
      batch.set(ref, { goal: gift.goal, name: gift.name, note: gift.note, ts: fs.serverTimestamp() });
      batch.set(fs.doc(db, "wishlists", id, "amounts", ref.id), { amount: gift.amount });
      batch.update(fs.doc(db, "wishlists", id, "totals", gift.goal), { raised: fs.increment(gift.amount), last: ref.id });
      await batch.commit();
      return ref.id;
    },
    async removeGift(id, gift, amount) {
      const batch = fs.writeBatch(db);
      batch.delete(fs.doc(db, "wishlists", id, "gifts", gift.id));
      batch.delete(fs.doc(db, "wishlists", id, "amounts", gift.id));
      const tref = fs.doc(db, "wishlists", id, "totals", gift.goal);
      const t = await fs.getDoc(tref);
      if (t.exists()) batch.update(tref, { raised: Math.max(0, (t.data().raised || 0) - (amount || 0)), last: "" });
      return batch.commit();
    },
  };
}

/* ---------------- Demo (this browser only) ---------------- */
function demoBackend() {
  const KEY = "shagun-demo-v1";
  const ME = "demo-owner";
  const seed = {
    wishlists: {
      demo: {
        owner: ME, a: "Meera", b: "Arjun", date: "2027-02-14", upi: "", createdAt: 1,
        goals: [
          { id: "g1", title: "Honeymoon in Europe", target: 300000, icon: "plane" },
          { id: "g2", title: "First home down payment", target: 1000000, icon: "home" },
          { id: "g3", title: "Trek to Everest Base Camp", target: 250000, icon: "peak" },
        ],
      },
    },
    gifts: {
      demo: [
        { id: "e1", goal: "g1", amount: 5101, name: "The Kulkarni family", note: "See all of Europe, then come home and tell us.", ts: 3 },
        { id: "e2", goal: "g2", amount: 11001, name: "Rohan and Sneha", note: "For the first brick.", ts: 2 },
        { id: "e3", goal: "g1", amount: 2101, name: "Isha", note: "", ts: 1 },
      ],
    },
  };
  let data;
  try { data = JSON.parse(localStorage.getItem(KEY)); } catch (e) { data = null; }
  if (!data || !data.wishlists) data = JSON.parse(JSON.stringify(seed));
  const subs = new Set();
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const commit = () => {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* stays in memory */ }
    subs.forEach((fn) => fn());
  };
  const watch = (fn) => { subs.add(fn); fn(); return () => subs.delete(fn); };
  const copy = (v) => JSON.parse(JSON.stringify(v));

  return {
    onAuth(cb) { cb({ uid: ME }); },
    signIn() { return Promise.resolve(); },
    signOut() { return Promise.resolve(); },
    async createWishlist(d) {
      const id = newId();
      data.wishlists[id] = { ...d, goals: [], owner: ME, createdAt: Date.now() };
      data.gifts[id] = [];
      commit();
      return id;
    },
    async listMine() {
      return Object.keys(data.wishlists).map((id) => ({ id, ...copy(data.wishlists[id]) }));
    },
    watchWishlist(id, cb) {
      return watch(() => cb(data.wishlists[id] ? { id, ...copy(data.wishlists[id]) } : null));
    },
    watchGifts(id, cb) {
      return watch(() => cb(copy(data.gifts[id] || []).map((g) => ({ id: g.id, goal: g.goal, name: g.name, note: g.note, ts: g.ts }))));
    },
    watchTotals(id, cb) {
      return watch(() => { const t = {}; (data.gifts[id] || []).forEach((g) => { t[g.goal] = (t[g.goal] || 0) + g.amount; }); cb(t); });
    },
    watchAmounts(id, cb) {
      return watch(() => { const a = {}; (data.gifts[id] || []).forEach((g) => { a[g.id] = g.amount; }); cb(a); });
    },
    async updateWishlist(id, patch) {
      Object.assign(data.wishlists[id], copy(patch));
      if (patch.qr === null) delete data.wishlists[id].qr;
      commit();
    },
    async addGift(id, gift) {
      const gid = newId();
      (data.gifts[id] = data.gifts[id] || []).push({ id: gid, ...gift });
      commit();
      return gid;
    },
    async removeGift(id, gift) {
      data.gifts[id] = (data.gifts[id] || []).filter((g) => g.id !== gift.id);
      commit();
    },
  };
}
