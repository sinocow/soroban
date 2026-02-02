// ===============================
// 算盤（読み上げ＋表示）トレーナー
// - 設定は localStorage に随時保存し、前回設定を自動復元
// - 起動時に「HTMLデフォルト値」で上書きしないようガード
// - デフォルト音声: Microsoft Sayaka - Japanese (Japan)(ja-JP)（あれば）
// - 読み上げ中は「円」表示なし（数字のみ）
// - 答えの読み上げなし
// ===============================

// ===== Storage =====
const STORAGE_KEY = "soroban_trainer_settings_v1"; // ←これを変えるとリセット扱いになります

const DEFAULTS = {
  difficulty: "1",
  count: "5",
  mode: "mix",
  rate: "1.05",
  gapMs: "0",
  revealSec: "3",
  voiceName: "Microsoft Sayaka - Japanese (Japan)",
  voiceLang: "ja-JP",
  advancedOpen: false,
};

// ===== DOM =====
const settingsView = document.getElementById("settingsView");
const quizView = document.getElementById("quizView");
const resultView = document.getElementById("resultView");

const difficultyEl = document.getElementById("difficulty");
const countEl = document.getElementById("count");
const modeEl = document.getElementById("mode");

const rateEl = document.getElementById("rate");
const rateLabel = document.getElementById("rateLabel");
const gapMsEl = document.getElementById("gapMs");
const revealSecEl = document.getElementById("revealSec");
const voiceEl = document.getElementById("voice");
const warningEl = document.getElementById("warning");
const advancedEl = document.getElementById("advanced");

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");

const statusBadge = document.getElementById("statusBadge");
const progressText = document.getElementById("progressText");
const screenPhrase = document.getElementById("screenPhrase");
const screenNumber = document.getElementById("screenNumber");
const logArea = document.getElementById("logArea");

const resultHeadline = document.getElementById("resultHeadline");
const resultAnswer = document.getElementById("resultAnswer");
const formulaArea = document.getElementById("formulaArea");
const againBtn = document.getElementById("againBtn");
const backBtn = document.getElementById("backBtn");

// ===== State =====
let voices = [];
let runToken = 0;
let lastConfig = null;
let lastProblem = null;

// 起動中ガード：復元反映中に保存して上書きしない
let isInitializing = true;

// ===== UI helpers =====
function show(view) {
  settingsView.classList.add("hidden");
  quizView.classList.add("hidden");
  resultView.classList.add("hidden");
  view.classList.remove("hidden");
}

function setWarning(msg) {
  if (!msg) {
    warningEl.classList.add("hidden");
    warningEl.textContent = "";
    return;
  }
  warningEl.textContent = msg;
  warningEl.classList.remove("hidden");
}

function validateSettings() {
  const step = Number(difficultyEl.value);
  const mode = modeEl.value;
  if (step === 3 && mode === "add") {
    setWarning("STEP3は「減算で5跨ぎが発生」が条件のため、モードは「足し算＋引き算」を選んでください。");
    return false;
  }
  setWarning("");
  return true;
}

function syncRateLabel() {
  rateLabel.textContent = Number(rateEl.value).toFixed(2);
}

// ===== localStorage =====
function safeParse(json) {
  try { return JSON.parse(json); } catch { return null; }
}

function loadSettings() {
  const raw = localStorage.getItem(STORAGE_KEY);
  const parsed = raw ? safeParse(raw) : null;
  return { ...DEFAULTS, ...(parsed || {}) };
}

function saveSettings(obj) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // 失敗しても動作継続
  }
}

function selectedVoiceObject() {
  const idx = Number(voiceEl.value);
  if (!Number.isNaN(idx) && voices[idx]) return voices[idx];
  return null;
}

function currentSettingsSnapshot() {
  const v = selectedVoiceObject();
  return {
    difficulty: difficultyEl.value,
    count: countEl.value,
    mode: modeEl.value,
    rate: String(rateEl.value),
    gapMs: String(gapMsEl.value),
    revealSec: String(revealSecEl.value),
    voiceName: v?.name || "",
    voiceLang: v?.lang || "",
    advancedOpen: !!advancedEl?.open,
  };
}

function persistNow() {
  if (isInitializing) return; // ★復元中は保存しない
  saveSettings(currentSettingsSnapshot());
}

// ===== Voice selection helpers =====
function findVoiceIndexByNameLang(name, lang) {
  const nameL = (name || "").toLowerCase();
  const langL = (lang || "").toLowerCase();

  // 1) name+lang 完全一致
  let idx = voices.findIndex(v =>
    (v.name || "").toLowerCase() === nameL &&
    (v.lang || "").toLowerCase() === langL
  );
  if (idx >= 0) return idx;

  // 2) name 部分一致
  if (nameL) {
    idx = voices.findIndex(v => (v.name || "").toLowerCase().includes(nameL));
    if (idx >= 0) return idx;
  }

  // 3) lang 一致
  if (langL) {
    idx = voices.findIndex(v => (v.lang || "").toLowerCase() === langL);
    if (idx >= 0) return idx;
  }

  return -1;
}

function applyVoiceFromStoredOrDefault(st) {
  // 保存済みを優先
  let idx = findVoiceIndexByNameLang(st.voiceName, st.voiceLang);

  // 無ければ Sayaka
  if (idx < 0) {
    idx = voices.findIndex(v =>
      (v.lang || "").toLowerCase() === "ja-jp" &&
      (v.name || "").toLowerCase().includes("microsoft sayaka")
    );
  }

  // それでも無ければ先頭（日本語優先ソート済み）
  if (idx < 0 && voiceEl.options.length > 0) {
    voiceEl.selectedIndex = 0;
    return;
  }
  if (idx >= 0) voiceEl.value = String(idx);
}

// ===== Speech =====
function populateVoices() {
  voices = window.speechSynthesis ? speechSynthesis.getVoices() : [];
  voiceEl.innerHTML = "";

  // 日本語優先で並べる
  const sorted = [...voices].sort((a, b) => {
    const aj = (a.lang || "").toLowerCase().startsWith("ja");
    const bj = (b.lang || "").toLowerCase().startsWith("ja");
    if (aj !== bj) return aj ? -1 : 1;
    return (a.name || "").localeCompare(b.name || "");
  });

  sorted.forEach(v => {
    const opt = document.createElement("option");
    opt.value = String(voices.indexOf(v)); // 元配列index
    opt.textContent = `${v.name} (${v.lang})`;
    voiceEl.appendChild(opt);
  });

  // voice復元（保存値→Sayaka→先頭）
  const st = loadSettings();
  applyVoiceFromStoredOrDefault(st);

  // ★ここでは persistNow() は呼ばない（復元前後の上書きを防ぐ）
  // ただし、初期化完了後に voiceschanged が来る場合があるので、
  // そのときはユーザー操作のタイミングで保存されます。
}

function waitMs(ms, token) {
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      clearTimeout(t);
      resolve();
    }, ms);
    if (token !== runToken) resolve();
  });
}

function speakOne(text, opts, token) {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) return resolve();
    if (token !== runToken) return resolve();

    speechSynthesis.cancel();

    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ja-JP";
    u.rate = (opts?.rate != null) ? opts.rate : Number(rateEl.value);
    u.pitch = (opts?.pitch != null) ? opts.pitch : 1.0;

    const v = selectedVoiceObject();
    if (v) u.voice = v;

    u.onend = () => resolve();
    u.onerror = () => resolve();
    speechSynthesis.speak(u);
  });
}

async function speakWish(token) {
  await speakOne("ねがいましてはぁ", { rate: clamp(Number(rateEl.value) * 1.02, 0.7, 2.0), pitch: 0.92 }, token);
}

async function speakSorobanStep(prefixType, value, token) {
  const baseRate = Number(rateEl.value);
  const wholeRate = clamp(baseRate * 1.04, 0.7, 2.2);
  const num = toJapaneseNumber(value);

  let prefixSpeak = "";
  if (prefixType === "sub") prefixSpeak = "ひいては";
  else if (prefixType === "addAfterSub") prefixSpeak = "たしては";

  const text = `${prefixSpeak}${num}えんなーりー`;
  await speakOne(text, { rate: wholeRate, pitch: 1.0 }, token);
}

function stopAll() {
  runToken++;
  try { speechSynthesis.cancel(); } catch {}
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// ===== Japanese number reading (〜万まで) =====
function toJapaneseNumber(n) {
  const units = ["", "いち", "に", "さん", "よん", "ご", "ろく", "なな", "はち", "きゅう"];
  const tens = ["", "じゅう", "にじゅう", "さんじゅう", "よんじゅう", "ごじゅう", "ろくじゅう", "ななじゅう", "はちじゅう", "きゅうじゅう"];
  const hundreds = ["", "ひゃく", "にひゃく", "さんびゃく", "よんひゃく", "ごひゃく", "ろっぴゃく", "ななひゃく", "はっぴゃく", "きゅうひゃく"];
  const thousands = ["", "せん", "にせん", "さんぜん", "よんせん", "ごせん", "ろくせん", "ななせん", "はっせん", "きゅうせん"];

  function under10000(x) {
    const a = Math.floor(x / 1000);
    const b = Math.floor((x % 1000) / 100);
    const c = Math.floor((x % 100) / 10);
    const d = x % 10;
    let s = "";
    if (a) s += thousands[a];
    if (b) s += hundreds[b];
    if (c) s += tens[c];
    if (d) s += units[d];
    return s || "ぜろ";
  }

  if (n >= 10000) {
    const man = Math.floor(n / 10000);
    const rest = n % 10000;
    return under10000(man) + "まん" + (rest ? under10000(rest) : "");
  }
  return under10000(n);
}

// ===== Problem generation =====
function generateProblem(config) {
  const { step, count, mode } = config;
  const allowSub = mode === "mix";

  const digitMin = (step === 4) ? 10 : 1;
  const digitMax = (step === 4) ? 99 : 9;

  const maxAttempts = 12000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let total = 0;
    let seq = [];

    let hadOver10 = false;
    let hadCross5Sub = false;
    let prevValue = null;
    let ok = true;

    for (let i = 0; i < count; i++) {
      const ops = (i === 0) ? ["add"] : (allowSub ? ["add", "sub"] : ["add"]);
      let candidate = null;

      for (let k = 0; k < 160; k++) {
        const op = ops[Math.floor(Math.random() * ops.length)];
        const value = randInt(digitMin, digitMax);

        if (prevValue !== null && value === prevValue) continue;
        if (op === "sub" && value > total) continue;

        const nextTotal = (op === "add") ? total + value : total - value;
        if (nextTotal < 0) continue;

        if (step === 1 && nextTotal > 9) continue;

        if ((step === 1 || step === 2) && op === "sub") {
          if (cross5BySub(total, nextTotal)) continue;
        }

        candidate = { op, value, before: total, after: nextTotal };
        break;
      }

      if (!candidate) { ok = false; break; }

      seq.push(candidate);
      total = candidate.after;

      if (total > 9) hadOver10 = true;
      if (candidate.op === "sub" && cross5BySub(candidate.before, candidate.after)) {
        hadCross5Sub = true;
      }

      prevValue = candidate.value;
    }

    if (!ok) continue;

    if ((step === 2 || step === 3) && !hadOver10) continue;
    if (step === 3 && !hadCross5Sub) continue;
    if (step === 3 && !allowSub) continue;

    return {
      seq,
      answer: seq.reduce((acc, s) => s.op === "add" ? acc + s.value : acc - s.value, 0)
    };
  }

  throw new Error("条件を満たす問題が生成できませんでした。回数や難易度、モードを変更して再度お試しください。");
}

function cross5BySub(before, after) {
  return before >= 5 && after < 5;
}
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ===== Display helpers =====
function buildDisplay(stepObj, prevStepObj) {
  const { op, value } = stepObj;
  const prevOp = prevStepObj ? prevStepObj.op : null;

  let prefix = "";
  if (op === "sub") prefix = "引いては";
  else if (prevOp === "sub") prefix = "足しては";

  return {
    prefix,
    valueText: value.toLocaleString("ja-JP"),
    logLine: `${prefix}${value.toLocaleString("ja-JP")}円なーりー`
  };
}

// ===== Run =====
async function runQuiz(config) {
  runToken++;
  const token = runToken;

  statusBadge.textContent = "RUNNING";
  logArea.textContent = "";
  screenPhrase.textContent = "READY";
  screenNumber.textContent = "—";
  progressText.textContent = `0/${config.count}`;

  let problem;
  try {
    problem = generateProblem(config);
  } catch (e) {
    show(settingsView);
    setWarning(e.message);
    return;
  }
  lastProblem = problem;

  show(quizView);

  screenPhrase.textContent = "願いましては、";
  screenNumber.textContent = "—";
  logArea.textContent += "願いましては、\n";

  await speakWish(token);
  await waitMs(80, token);
  if (token !== runToken) return;

  for (let i = 0; i < problem.seq.length; i++) {
    const stepObj = problem.seq[i];
    const prev = i > 0 ? problem.seq[i - 1] : null;

    progressText.textContent = `${i + 1}/${config.count}`;

    const disp = buildDisplay(stepObj, prev);
    screenPhrase.textContent = disp.prefix;
    screenNumber.textContent = disp.valueText; // 円なし

    logArea.textContent += `${i + 1}. ${disp.logLine}\n`;

    let prefixType = "none";
    if (stepObj.op === "sub") prefixType = "sub";
    else if (prev && prev.op === "sub") prefixType = "addAfterSub";

    await speakSorobanStep(prefixType, stepObj.value, token);

    await waitMs(Number(config.gapMs), token);
    if (token !== runToken) return;
  }

  statusBadge.textContent = "DONE";
  await showResult(problem, config, token);
}

async function showResult(problem, config, token) {
  show(resultView);

  resultHeadline.textContent = "答えは・・・";
  resultAnswer.classList.add("hidden");
  resultAnswer.textContent = "—";

  let total = 0;
  const lines = [];
  problem.seq.forEach((s, i) => {
    const sign = (i === 0 || s.op === "add") ? "+" : "-";
    total = (s.op === "add") ? total + s.value : total - s.value;
    lines.push(`${i + 1}. ${sign}${s.value}  =>  ${total}`);
  });
  formulaArea.textContent = lines.join("\n");

  const sec = Math.max(1, Number(config.revealSec || 3));
  await waitMs(sec * 1000, token);
  if (token !== runToken) return;

  resultHeadline.textContent = "答え";
  resultAnswer.textContent = `${problem.answer.toLocaleString("ja-JP")}円`;
  resultAnswer.classList.remove("hidden");
}

// ===== Events (auto-save) =====
function attachAutoSave(el, type = "change") {
  if (!el) return;
  el.addEventListener(type, () => {
    if (el === rateEl) syncRateLabel();
    validateSettings();
    persistNow();
  });
}

// ホーム
attachAutoSave(difficultyEl, "change");
attachAutoSave(countEl, "change");
attachAutoSave(modeEl, "change");

// 詳細
attachAutoSave(rateEl, "input");
attachAutoSave(gapMsEl, "input");
attachAutoSave(revealSecEl, "input");
attachAutoSave(voiceEl, "change");

// 詳細開閉状態
if (advancedEl) {
  advancedEl.addEventListener("toggle", () => persistNow());
}

startBtn.addEventListener("click", async () => {
  if (!validateSettings()) return;

  // Start押下時にも保存
  persistNow();

  const config = {
    step: Number(difficultyEl.value),
    count: Number(countEl.value),
    mode: modeEl.value,
    gapMs: Number(gapMsEl.value),
    revealSec: Number(revealSecEl.value),
  };
  lastConfig = config;

  setWarning("");
  stopAll();
  await runQuiz(config);
});

stopBtn.addEventListener("click", () => {
  stopAll();
  show(settingsView);
});

againBtn.addEventListener("click", async () => {
  if (!lastConfig) return;
  stopAll();
  await runQuiz(lastConfig);
});

backBtn.addEventListener("click", () => {
  stopAll();
  show(settingsView);
});

// ===== Boot: 復元 → voice読み込み → 初期化完了 =====
function applySettingsToUI(st) {
  difficultyEl.value = st.difficulty;
  countEl.value = st.count;
  modeEl.value = st.mode;

  rateEl.value = st.rate;
  gapMsEl.value = st.gapMs;
  revealSecEl.value = st.revealSec;

  if (advancedEl) advancedEl.open = !!st.advancedOpen;

  syncRateLabel();
  validateSettings();
}

function boot() {
  // 1) まず復元してUIに反映（まだ保存しない）
  const st = loadSettings();
  applySettingsToUI(st);
  show(settingsView);

  // 2) voice一覧を後から埋める（ここでも保存しない）
  if (window.speechSynthesis) {
    populateVoices();
    speechSynthesis.onvoiceschanged = () => {
      populateVoices();
      // voiceschangedで勝手に保存しない（ユーザー操作で保存される）
    };
  }

  // 3) 初期化完了
  isInitializing = false;
}

boot();