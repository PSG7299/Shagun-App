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
      return fs.onSnapshot(fs.collection(db, "wishlists", id, "gifts"),
        (q) => cb(q.docs.map((d) => ({ id: d.id, ...d.data() }))), onErr);
    },
    updateWishlist(id, patch) {
      return fs.updateDoc(fs.doc(db, "wishlists", id), patch);
    },
    async addGift(id, gift) {
      const ref = await fs.addDoc(fs.collection(db, "wishlists", id, "gifts"), gift);
      return ref.id;
    },
    removeGift(id, giftId) {
      return fs.deleteDoc(fs.doc(db, "wishlists", id, "gifts", giftId));
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
      return watch(() => cb(copy(data.gifts[id] || [])));
    },
    async updateWishlist(id, patch) {
      Object.assign(data.wishlists[id], copy(patch));
      commit();
    },
    async addGift(id, gift) {
      const gid = newId();
      (data.gifts[id] = data.gifts[id] || []).push({ id: gid, ...gift });
      commit();
      return gid;
    },
    async removeGift(id, giftId) {
      data.gifts[id] = (data.gifts[id] || []).filter((g) => g.id !== giftId);
      commit();
    },
  };
}
