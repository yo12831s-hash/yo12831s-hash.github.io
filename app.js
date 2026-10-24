// ===== 1. 旅行のデータ =====
// 手元で index.html を開いたときのお試しデータ。
// claude.ai で開いたときは、共有のデータ置き場（db）から読み込む。
const sampleData = {
  trips: [
    { id: "kyoto", title: "京都 紅葉旅行", icon: "🍁", start: "2026-11-20", end: "2026-11-22" },
  ],
  events: [
    { trip: "kyoto", date: "2026-11-20", time: "08:00", title: "東京駅から新幹線", category: "move", place: "東京駅", memo: "のぞみ 指定席" },
    { trip: "kyoto", date: "2026-11-20", time: "12:30", title: "湯豆腐ランチ", category: "food", place: "南禅寺" },
    { trip: "kyoto", date: "2026-11-20", time: "10:30", title: "清水寺", category: "sight", icon: "⛩️", place: "清水寺", memo: "帰りに三年坂を歩く" },
    { trip: "kyoto", date: "2026-11-20", time: "18:00", title: "町家の宿にチェックイン", category: "stay" },
    { trip: "kyoto", date: "2026-11-21", time: "09:00", title: "嵐山・竹林の小径", category: "sight", icon: "🎋", place: "竹林の小径 嵐山", memo: "混む前に朝いちばんで" },
    { trip: "kyoto", date: "2026-11-21", time: "15:00", title: "抹茶パフェ", category: "food", icon: "🍵" },
    { trip: "kyoto", date: "2026-11-22", time: "16:00", title: "京都駅から帰る", category: "move", place: "京都駅" },
  ],
};

// 予定の種類ごとのアイコン（icon を書かなかったときに使う）
const categoryIcons = {
  move: "🚄",
  sight: "📷",
  food: "🍙",
  stay: "🏠",
};

const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

// 画面に出しているデータ
let trips = [];         // 旅行の一覧
let events = [];        // すべての旅行の予定
let currentTripId = rememberedTrip();  // いま見ている旅行
let canWrite = true;    // 追加・編集・削除ができるか
let mode = "loading";   // "loading" | "local"（このブラウザだけ） | "shared"（みんなで共有）
let people = null;      // 予定を追加した人の名前を調べるもの（共有のときだけ）

// 保存の動き。保存先によって中身を入れかえる。
let store = {};

// 最後に見ていた旅行を、このブラウザに覚えておく
function rememberedTrip() {
  try {
    return localStorage.getItem("travel-current-trip");
  } catch (e) {
    return null;
  }
}
function selectTrip(id) {
  currentTripId = id;
  try {
    localStorage.setItem("travel-current-trip", id);
  } catch (e) {
    // 覚えておけなくても困らない
  }
  render();
}

// ===== 2. 保存先その1：このブラウザだけ（localStorage） =====
const STORAGE_KEY = "travel-trip";

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function useLocalStorage() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch (e) {
    // 保存できない環境（プライベートモードなど）ではお試しデータを使う
  }

  // 前の形（旅行が 1 つだけ）で保存されていたら、新しい形に直す
  if (saved && !saved.trips) {
    const { events: oldEvents = [], ...info } = saved;
    saved = {
      trips: [{ ...info, id: "trip1" }],
      events: oldEvents.map((e) => ({ ...e, trip: "trip1" })),
    };
  }

  const data = saved || structuredClone(sampleData);
  data.events.forEach((e) => (e.id ||= newId()));
  trips = data.trips;
  events = data.events;
  mode = "local";

  const save = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ trips, events }));
    } catch (e) {
      // 保存できなくても画面はそのまま使える
    }
    render();
  };

  store = {
    saveTrip: async (id, info) => {
      if (id) {
        trips = trips.map((t) => (t.id === id ? { ...info, id } : t));
      } else {
        id = newId();
        trips.push({ ...info, id });
      }
      save();
      return id;
    },
    removeTrip: async (id) => {
      trips = trips.filter((t) => t.id !== id);
      events = events.filter((e) => e.trip !== id);
      save();
    },
    addEvent: async (event) => {
      events.push({ ...event, id: newId() });
      save();
    },
    updateEvent: async (id, changes) => {
      events = events.map((e) => (e.id === id ? { ...e, ...changes } : e));
      save();
    },
    removeEvent: async (id) => {
      events = events.filter((e) => e.id !== id);
      save();
    },
  };
  render();
}

// ===== 3. 保存先その2：みんなで共有（claude.ai の db） =====
// trips  …… 旅行 1 つずつのドキュメント（タイトル・アイコン・日程）
// events …… 予定 1 件ずつのドキュメント。trip に旅行の id が入る
async function useSharedDb(db, user) {
  mode = "shared";
  people = user;
  const myId = user ? await user.id() : null;
  if (user && (await user.can("data.write")) === false) canWrite = false;

  db.collection("trips").onSnapshot(
    (snap) => {
      trips = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      render();
    },
    () => showMessage("旅行を読み込めませんでした。ページを開き直してください。")
  );

  db.collection("events").onSnapshot(
    (snap) => {
      events = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      render();
    },
    () => showMessage("予定を読み込めませんでした。ページを開き直してください。")
  );

  // 保存できなかったときのお知らせ。書きこめない人なら、見るだけの画面に切りかえる
  const failed = (err) => {
    if (err?.code === "invalid_argument") {
      canWrite = false;
      render();
      showMessage("この旅行は見るだけになっています。変えるには、持ち主に「編集者」として招待してもらってください。");
    } else if (err?.code === "quota_exceeded") {
      showMessage("データがいっぱいです。いらない予定や旅行を消してから、もう一度ためしてください。");
    } else {
      showMessage("保存できませんでした。少し待ってからもう一度ためしてください。");
    }
    throw err;
  };

  store = {
    saveTrip: async (id, info) => {
      if (id) {
        await db.doc("trips/" + id).set(info).catch(failed);
        return id;
      }
      const ref = await db.collection("trips").add(info).catch(failed);
      return ref.id;
    },
    removeTrip: async (id) => {
      // 予定を 1 件ずつ消してから、旅行を消す
      for (const e of events.filter((ev) => ev.trip === id)) {
        await db.doc("events/" + e.id).delete().catch(failed);
      }
      await db.doc("trips/" + id).delete().catch(failed);
    },
    addEvent: (event) => db.collection("events").add({ ...event, by: myId }).catch(failed),
    updateEvent: (id, changes) => db.doc("events/" + id).update(changes).catch(failed),
    removeEvent: (id) => db.doc("events/" + id).delete().catch(failed),
  };
}

// claude.ai で開いたときは共有、それ以外（手元のファイルなど）はこのブラウザに保存
async function connect() {
  const db = window.claude ? await window.claude.use("db") : null;
  if (!db) return useLocalStorage();
  const user = await window.claude.use("user");
  useSharedDb(db, user);
}

// ===== 4. 日付を扱う小さな関数 =====

// "2026-11-20" → Date
function toDate(text) {
  const [y, m, d] = String(text).split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Date → "2026-11-20"
function toText(date) {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

// Date → "11/20（金）"
function formatDay(date) {
  return `${date.getMonth() + 1}/${date.getDate()}（${weekdays[date.getDay()]}）`;
}

// 開始日から終了日までの日付を配列にする（長くても 31 日まで）
function listDays(start, end) {
  const days = [];
  for (let d = toDate(start); d <= toDate(end) && days.length < 31; d.setDate(d.getDate() + 1)) {
    days.push(new Date(d));
  }
  return days;
}

// 場所の名前から Google マップの検索 URL を作る
function mapUrl(place) {
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(place);
}

// 入力された文字を、HTML のタグとして読まれないように変換する
function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

function byTime(a, b) {
  return String(a.time).localeCompare(String(b.time));
}

// ===== 5. 画面を作る =====

function currentTrip() {
  return trips.find((t) => t.id === currentTripId) || null;
}

function renderTabs() {
  const tabs = trips
    .slice()
    .sort((a, b) => String(a.start).localeCompare(String(b.start)))
    .map((t) => `
      <button class="tab ${t.id === currentTripId ? "active" : ""}" data-trip="${escapeHtml(t.id)}">
        ${escapeHtml(t.icon || "🧳")} ${escapeHtml(t.title)}
      </button>`)
    .join("");
  const addTrip = canWrite ? `<button class="tab new-trip">＋ 新しい旅行</button>` : "";
  document.getElementById("tripTabs").innerHTML = tabs + addTrip;
}

function renderEvent(event, names) {
  const category = categoryIcons[event.category] ? event.category : "other";
  const icon = event.icon || categoryIcons[category] || "📌";
  const who = event.by && names[event.by]?.name;
  const place = event.place ? `<small class="place">📍 ${escapeHtml(event.place)}</small>` : "";
  const memo = event.memo ? `<small class="memo">${escapeHtml(event.memo)}</small>` : "";
  const main = `
      <span class="icon ${category}">${escapeHtml(icon)}</span>
      <span class="title"><span class="time">${escapeHtml(event.time)}</span>${escapeHtml(event.title)}${place}${memo}${who ? `<small class="by">${escapeHtml(who)}</small>` : ""}</span>`;

  // 場所があれば、Google マップを開くボタンを付ける
  const map = event.place
    ? `<a class="map" href="${escapeHtml(mapUrl(event.place))}" target="_blank" rel="noopener" aria-label="${escapeHtml(event.place)}を地図で見る">🗺️</a>`
    : "";

  // 書きこめる人には、押すと編集できるボタンにする
  if (!canWrite) return `<li><span class="event-main">${main}</span>${map}</li>`;
  return `
    <li>
      <button class="event-main edit" data-id="${escapeHtml(event.id)}" aria-label="${escapeHtml(event.title)}を直す">${main}</button>
      ${map}
      <button class="delete" data-id="${escapeHtml(event.id)}" aria-label="削除">✕</button>
    </li>`;
}

function renderList(list, names) {
  return list.length
    ? `<ul class="events">${list.map((e) => renderEvent(e, names)).join("")}</ul>`
    : `<p class="no-events">まだ予定がありません</p>`;
}

function renderDay(date, index, tripEvents, names) {
  const dayEvents = tripEvents.filter((e) => e.date === toText(date)).sort(byTime);

  // 色は 3 色を順番にくり返す（4 日目は 1 日目と同じ色）
  const color = (index % 3) + 1;
  const addButton = canWrite
    ? `<button class="add" data-date="${toText(date)}">＋ 予定</button>`
    : "";

  return `
    <div class="day-head">
      <h3 class="day day-${color}">${index + 1}日目 ${formatDay(date)}</h3>
      ${addButton}
    </div>
    ${renderList(dayEvents, names)}`;
}

function modeLabel() {
  if (mode === "shared") {
    return canWrite
      ? `<p class="mode">🤝 みんなで共有中・変えた内容は共有した人にも見えます</p>`
      : `<p class="mode">👀 見るだけ</p>`;
  }
  return `<p class="mode">📱 この端末だけに保存しています</p>`;
}

function emptyCard(text) {
  return `<section class="trip"><p class="no-events">${text}</p></section>`;
}

let renderCount = 0;

async function render() {
  const app = document.getElementById("app");

  if (mode === "loading") {
    app.innerHTML = emptyCard("🍃 読み込み中…");
    return;
  }

  // 見ている旅行がなければ、出発日がいちばん早い旅行を選ぶ
  if (!currentTrip() && trips.length) {
    currentTripId = trips.slice().sort((a, b) => String(a.start).localeCompare(String(b.start)))[0].id;
  }
  renderTabs();

  const trip = currentTrip();
  if (!trip) {
    app.innerHTML = emptyCard(canWrite
      ? "まだ旅行がありません。上の「＋ 新しい旅行」から作ってください。"
      : "まだ旅行がありません。");
    return;
  }

  // 予定を追加した人の名前を調べる（共有のときだけ）
  const tripEvents = events.filter((e) => e.trip === trip.id);
  const count = ++renderCount;
  const ids = [...new Set(tripEvents.map((e) => e.by).filter(Boolean))];
  const names = people && ids.length ? await people.profiles(ids) : {};
  if (count !== renderCount) return;  // もっと新しい描きなおしが始まっていたらやめる

  const days = listDays(trip.start, trip.end);
  if (!days.length) {
    app.innerHTML = emptyCard("旅行の日程が正しくありません。");
    return;
  }
  const last = days[days.length - 1];

  // 日程を変えて、旅行の外に出てしまった予定（消えたように見えないよう別に出す）
  const outside = tripEvents
    .filter((e) => !days.some((d) => toText(d) === e.date))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || byTime(a, b));
  const outsideBlock = outside.length
    ? `<div class="day-head"><h3 class="day day-out">日程の外の予定</h3></div>
       <p class="hint">押して日付を直してください。</p>
       ${renderList(outside, names)}`
    : "";

  const editTrip = canWrite ? `<button class="edit-trip" aria-label="旅行を直す">✏️ 直す</button>` : "";

  app.innerHTML = `
    <section class="trip">
      <div class="trip-title">
        <span class="trip-icon">${escapeHtml(trip.icon || "🧳")}</span>
        <div class="trip-name">
          <h2>${escapeHtml(trip.title)}</h2>
          <p class="dates">${formatDay(days[0])} 〜 ${formatDay(last)}・${days.length}日間</p>
        </div>
        ${editTrip}
      </div>
      ${modeLabel()}
      ${days.map((d, i) => renderDay(d, i, tripEvents, names)).join("")}
      ${outsideBlock}
    </section>`;
}

// 画面の下にお知らせを少しのあいだ出す
function showMessage(text) {
  const box = document.getElementById("message");
  box.textContent = text;
  box.hidden = false;
  clearTimeout(showMessage.timer);
  showMessage.timer = setTimeout(() => (box.hidden = true), 6000);
}

// ===== 6. 予定のフォーム（追加と編集で使い回す） =====
const eventDialog = document.getElementById("eventDialog");
const eventForm = document.getElementById("eventForm");
let editingEventId = null;  // 編集中の予定の id（追加のときは null）

function openEventForm(event) {
  const trip = currentTrip();
  eventForm.reset();
  eventDialog.returnValue = "";  // 前回の「保存」が残らないようにする（Esc で閉じたとき用）
  editingEventId = event.id || null;
  document.getElementById("eventDialogTitle").textContent = editingEventId ? "✏️ 予定を直す" : "🍃 予定を追加";
  document.getElementById("eventSaveButton").textContent = editingEventId ? "保存する" : "追加する";

  eventForm.date.min = trip.start;
  eventForm.date.max = trip.end;
  eventForm.date.value = event.date || "";
  eventForm.time.value = event.time || "";
  eventForm.title.value = event.title || "";
  eventForm.category.value = categoryIcons[event.category] ? event.category : "move";
  eventForm.icon.value = event.icon || "";
  eventForm.place.value = event.place || "";
  eventForm.memo.value = event.memo || "";
  eventDialog.showModal();
}

// フォームが閉じられたとき、「追加する」「保存する」なら予定を保存する
eventDialog.addEventListener("close", () => {
  if (eventDialog.returnValue !== "save") return;

  const data = {
    date: eventForm.date.value,
    time: eventForm.time.value,
    title: eventForm.title.value.trim(),
    category: eventForm.category.value,
    icon: eventForm.icon.value.trim(),
    place: eventForm.place.value.trim(),
    memo: eventForm.memo.value.trim(),
  };
  if (editingEventId) {
    store.updateEvent(editingEventId, data);
  } else {
    store.addEvent({ ...data, trip: currentTripId });
  }
});

// ===== 7. 旅行のフォーム（作ると直すで使い回す） =====
const tripDialog = document.getElementById("tripDialog");
const tripForm = document.getElementById("tripForm");
const tripDeleteButton = document.getElementById("tripDeleteButton");
let editingTripId = null;

function openTripForm(trip) {
  tripForm.reset();
  tripDialog.returnValue = "";  // 前回の「保存」が残らないようにする（Esc で閉じたとき用）
  editingTripId = trip ? trip.id : null;
  document.getElementById("tripDialogTitle").textContent = trip ? "✏️ 旅行を直す" : "🧳 新しい旅行";
  document.getElementById("tripSaveButton").textContent = trip ? "保存する" : "作る";
  tripDeleteButton.hidden = !trip;
  tripDeleteButton.classList.remove("confirm");
  tripDeleteButton.textContent = "この旅行を消す";

  tripForm.title.value = trip?.title || "";
  tripForm.icon.value = trip?.icon || "";
  tripForm.start.value = trip?.start || "";
  tripForm.end.value = trip?.end || "";
  checkTripDates();
  tripDialog.showModal();
}

// 帰る日が出発日より前にならないようにする
function checkTripDates() {
  const { start, end } = tripForm;
  end.min = start.value;
  const days = start.value && end.value ? listDays(start.value, end.value).length : 1;
  if (start.value && end.value && end.value < start.value) {
    end.setCustomValidity("帰る日は出発日と同じか、あとの日にしてください");
  } else if (days >= 31) {
    end.setCustomValidity("旅行は 30 日までにしてください");
  } else {
    end.setCustomValidity("");
  }
}
tripForm.start.addEventListener("input", checkTripDates);
tripForm.end.addEventListener("input", checkTripDates);

tripDialog.addEventListener("close", async () => {
  if (tripDialog.returnValue !== "save") return;

  const info = {
    title: tripForm.title.value.trim(),
    icon: tripForm.icon.value.trim(),
    start: tripForm.start.value,
    end: tripForm.end.value,
  };
  try {
    const id = await store.saveTrip(editingTripId, info);
    selectTrip(id);
  } catch (e) {
    // お知らせは store の中で出している
  }
});

// 「この旅行を消す」も 2 回押しで消す
tripDeleteButton.addEventListener("click", async () => {
  if (!tripDeleteButton.classList.contains("confirm")) {
    const count = events.filter((e) => e.trip === editingTripId).length;
    tripDeleteButton.classList.add("confirm");
    tripDeleteButton.textContent = `予定 ${count} 件ごと消す`;
    return;
  }
  const id = editingTripId;
  tripDialog.close("delete");
  try {
    await store.removeTrip(id);
    currentTripId = null;
    render();
  } catch (e) {
    // お知らせは store の中で出している
  }
});

// ===== 8. ボタンの動き =====

// 旅行の切りかえ
document.getElementById("tripTabs").addEventListener("click", (e) => {
  const tab = e.target.closest(".tab");
  if (!tab) return;
  if (tab.classList.contains("new-trip")) openTripForm(null);
  else selectTrip(tab.dataset.trip);
});

// 画面のどこかがクリックされたら、押されたボタンを調べる
document.getElementById("app").addEventListener("click", (e) => {
  const addButton = e.target.closest(".add");
  const editButton = e.target.closest(".edit");
  const deleteButton = e.target.closest(".delete");

  if (e.target.closest(".edit-trip")) openTripForm(currentTrip());
  if (addButton) openEventForm({ date: addButton.dataset.date });
  if (editButton) {
    const event = events.find((ev) => ev.id === editButton.dataset.id);
    if (event) openEventForm(event);
  }

  // ✕ を 1 回押すと「消す」に変わり、もう 1 回押すと消える
  if (deleteButton && deleteButton.classList.contains("confirm")) {
    store.removeEvent(deleteButton.dataset.id);
    return;
  }
  document.querySelectorAll(".delete.confirm").forEach((b) => {
    b.classList.remove("confirm");
    b.textContent = "✕";
  });
  if (deleteButton) {
    deleteButton.classList.add("confirm");
    deleteButton.textContent = "消す";
  }
});

render();
connect();
