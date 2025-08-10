// src/App.jsx
// ==================== セラ地理 完全版（スマホ最適化＋iOS音声対策＋終了時スコア大表示） ====================

import React, { useEffect, useMemo, useRef, useState } from "react";
import Globe from "react-globe.gl";
import * as THREE from "three";

// ====== 設定 ======
const BEFORE_START_AUTO_ROTATE = true;  // スタート前はゆっくり自動回転
const IN_GAME_AUTO_ROTATE     = false;  // スタート後は回転しない
const AUTO_FOCUS_WRONG_ONLY   = true;   // 不正解のときだけ正解地点へ寄る
const PAUSE_BEFORE_NEXT_MS    = 1000;   // 次の問題へ行くまでの静止時間

// BGM（/public配下）
const DEFAULT_MUSIC_URL = "/sera-geo.mp3";
const toRad = (deg) => (deg * Math.PI) / 180;
const haversineKm = ([lat1, lon1], [lat2, lon2]) => {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};
const xmur3 = (str) => {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
};
const mulberry32 = (a) =>
  function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
const seededShuffle = (arr, seedStr = "default") => {
  const seed = xmur3(seedStr)();
  const rand = mulberry32(seed);
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const resolveMusicUrl = (search = "", fallback = DEFAULT_MUSIC_URL) => {
  try {
    const p = new URLSearchParams(
      search || (typeof window !== "undefined" ? window.location.search : "")
    );
    return p.get("song") || fallback;
  } catch {
    return fallback;
  }
};

// ====== 問題データ（短縮なし・そのまま） ======
const RAW = [
  // 都市
  { name: "ニューヨーク", lat: 40.7128, lon: -74.006, hint: "都市・アメリカ" },
  { name: "東京", lat: 35.6762, lon: 139.6503, hint: "日本の首都" },
  { name: "ロンドン", lat: 51.5074, lon: -0.1278, hint: "イギリスの首都" },
  { name: "サンフランシスコ", lat: 37.7749, lon: -122.4194, hint: "都市・アメリカ西海岸" },
  { name: "シンガポール", lat: 1.3521, lon: 103.8198, hint: "都市国家・東南アジア" },
  { name: "イスタンブール", lat: 41.0082, lon: 28.9784, hint: "都市・トルコ（欧亜境界）" },
  { name: "ドバイ", lat: 25.276987, lon: 55.296249, hint: "都市・UAE" },
  // ランドマーク
  { name: "エッフェル塔", lat: 48.8584, lon: 2.2945, hint: "ランドマーク・パリ" },
  { name: "自由の女神", lat: 40.6892, lon: -74.0445, hint: "ランドマーク・NY" },
  // 河川・自然
  { name: "ナイル川", lat: 30.0444, lon: 31.2357, hint: "河川・アフリカ" },
  { name: "サハラ砂漠", lat: 23.4162, lon: 25.6628, hint: "砂漠・アフリカ北部" },
  { name: "グランドキャニオン", lat: 36.1069, lon: -112.1129, hint: "峡谷・アメリカ" },
  { name: "ヨセミテ国立公園", lat: 37.8651, lon: -119.5383, hint: "国立公園・アメリカ" },
  { name: "フィヨルド（ガイランゲル）", lat: 62.1015, lon: 7.205, hint: "氷食地形・ノルウェー" },
  { name: "ガラパゴス諸島", lat: -0.9538, lon: -90.9656, hint: "諸島・エクアドル" },
  { name: "セレンゲティ国立公園", lat: -2.3333, lon: 34.8333, hint: "サバンナ・タンザニア" },
  { name: "イグアスの滝", lat: -25.6953, lon: -54.4367, hint: "滝・アルゼンチン/ブラジル" },
  { name: "ハロン湾", lat: 20.9101, lon: 107.1839, hint: "湾・ベトナム" },
  { name: "パンタナール", lat: -16.711, lon: -56.162, hint: "湿地・ブラジル" },
  // 山岳
  { name: "エベレスト山", lat: 27.9881, lon: 86.925, hint: "世界最高峰・ヒマラヤ" },
  { name: "富士山", lat: 35.3606, lon: 138.7274, hint: "日本・本州" },
  { name: "アンデス山脈", lat: -32.6532, lon: -70.0114, hint: "南米西部を縦断" },
  { name: "キリマンジャロ山", lat: -3.0674, lon: 37.3556, hint: "アフリカ最高峰・タンザニア" },
  { name: "モンブラン", lat: 45.8326, lon: 6.8652, hint: "アルプス・仏伊国境" },
  // 国
  { name: "ナイジェリア", lat: 9.082, lon: 8.6753, hint: "国・アフリカ" },
  { name: "南アフリカ", lat: -30.5595, lon: 22.9375, hint: "国・アフリカ南端" },
  { name: "ケニア", lat: -1.286389, lon: 36.817223, hint: "国・東アフリカ" },
  { name: "エジプト", lat: 26.820553, lon: 30.802498, hint: "国・北アフリカ" },
  { name: "インド", lat: 20.593684, lon: 78.96288, hint: "国・南アジア" },
  { name: "中国", lat: 35.86166, lon: 104.195397, hint: "国・東アジア" },
  { name: "日本", lat: 36.204824, lon: 138.252924, hint: "国・東アジア" },
  { name: "韓国", lat: 35.907757, lon: 127.766922, hint: "国・東アジア" },
  { name: "ドイツ", lat: 51.165691, lon: 10.451526, hint: "国・欧州" },
  { name: "フランス", lat: 46.603354, lon: 1.888334, hint: "国・欧州" },
  { name: "イタリア", lat: 41.87194, lon: 12.56738, hint: "国・欧州" },
  { name: "スペイン", lat: 40.463667, lon: -3.74922, hint: "国・欧州" },
  { name: "アメリカ合衆国", lat: 37.09024, lon: -95.712891, hint: "国・北米" },
  { name: "カナダ", lat: 56.130366, lon: -106.346771, hint: "国・北米" },
  { name: "メキシコ", lat: 23.634501, lon: -102.552784, hint: "国・北米" },
  { name: "ブラジル", lat: -14.235004, lon: -51.92528, hint: "国・南米" },
  { name: "アルゼンチン", lat: -38.4161, lon: -63.6167, hint: "国・南米" },
  { name: "チリ", lat: -35.675147, lon: -71.53751, hint: "国・南米" },
  { name: "オーストラリア", lat: -25.274398, lon: 133.775136, hint: "国・オセアニア" },
  { name: "ニュージーランド", lat: -40.900557, lon: 174.885971, hint: "国・オセアニア" },
  { name: "アイスランド", lat: 64.963051, lon: -19.020835, hint: "国・北欧" },
  { name: "キューバ", lat: 21.521757, lon: -77.781167, hint: "国・カリブ" },
  { name: "バチカン市国", lat: 41.902782, lon: 12.453391, hint: "国・欧州の小国" },
  { name: "モナコ", lat: 43.738416, lon: 7.424621, hint: "国・欧州の小国" },
  { name: "ナウル", lat: -0.522778, lon: 166.931111, hint: "国・オセアニア小国" },
  // 湖・海
  { name: "バイカル湖", lat: 53.5587, lon: 108.1652, hint: "湖・ロシア" },
  { name: "カスピ海", lat: 37.5, lon: 50.0, hint: "内海・ユーラシア" },
  { name: "ティティカカ湖", lat: -15.7652, lon: -69.5312, hint: "湖・ボリビア/ペルー" },
  // 建造物・遺跡
  { name: "ギザの大ピラミッド", lat: 29.9792, lon: 31.1342, hint: "エジプト・ギザ" },
  { name: "タージ・マハル", lat: 27.1751, lon: 78.0421, hint: "インド・アグラ" },
  { name: "コロッセオ", lat: 41.8902, lon: 12.4922, hint: "イタリア・ローマ" },
  { name: "サグラダ・ファミリア", lat: 41.4036, lon: 2.1744, hint: "スペイン・バルセロナ" },
  { name: "ストーンヘンジ", lat: 51.1789, lon: -1.8262, hint: "イギリス・遺跡" },
  { name: "万里の長城", lat: 40.4319, lon: 116.5704, hint: "中国・長城" },
  { name: "クレムリン", lat: 55.752, lon: 37.6173, hint: "ロシア・モスクワ" },
  { name: "モン・サン＝ミシェル", lat: 48.636, lon: -1.5116, hint: "フランス・修道院" },
  { name: "オペラハウス", lat: -33.8568, lon: 151.2153, hint: "オーストラリア・シドニー" },
  { name: "アンコール・ワット", lat: 13.4125, lon: 103.867, hint: "カンボジア・寺院" },
  { name: "パルテノン神殿", lat: 37.9715, lon: 23.7267, hint: "ギリシャ・アテネ" },
  { name: "ブルジュ・ハリファ", lat: 25.1972, lon: 55.2744, hint: "UAE・世界一高い塔" },
  { name: "アルハンブラ宮殿", lat: 37.1761, lon: -3.5881, hint: "スペイン・グラナダ" },
  { name: "ノートルダム大聖堂", lat: 48.853, lon: 2.3499, hint: "フランス・パリ" },
  // 世界遺産
  { name: "グレート・バリア・リーフ", lat: -18.2871, lon: 147.6992, hint: "世界最大のサンゴ礁" },
  { name: "古代ローマの遺跡", lat: 41.8902, lon: 12.4922, hint: "ローマ史跡群" },
  { name: "アヤソフィア", lat: 41.0082, lon: 28.9784, hint: "トルコ・イスタンブール" },
  { name: "マチュ・ピチュ", lat: -13.1631, lon: -72.545, hint: "ペルー・空中都市" },
  { name: "ペトラ", lat: 30.3285, lon: 35.4444, hint: "ヨルダン・岩窟遺跡" },
  { name: "ウフィツィ美術館", lat: 43.7695, lon: 11.2558, hint: "イタリア・フィレンツェ" },
  { name: "シーギリヤ", lat: 7.9572, lon: 80.7603, hint: "スリランカ・ライオンロック" },
  { name: "アブ・シンベル神殿", lat: 22.3372, lon: 31.6209, hint: "エジプト・大神殿" },
  { name: "エルミタージュ美術館", lat: 59.9343, lon: 30.3351, hint: "ロシア・サンクトペテルブルク" },
  // その他
  { name: "ナスカの地上絵", lat: -14.739, lon: -75.13, hint: "ペルー・地上絵" }
];
const normalizeQuestions = (raw) =>
  raw.map((r, idx) => ({ id: idx + 1, name: r.name, hint: r.hint || "", coord: [r.lat, r.lon] }));
const QUESTIONS = normalizeQuestions(RAW);

// ====== URL params ======
const getParams = () => {
  const p = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  return {
    seed: p.get("seed") || null,
    dur: Math.max(10, Math.min(600, Number(p.get("dur") || 60))),
    km: Math.max(10, Math.min(2000, Number(p.get("km") || 300))),
    music: p.get("music") || "on",
    song: p.get("song") || null
  };
};
const buildShareUrl = ({ seed, dur, km, music, song }) => {
  const base = typeof window !== "undefined" ? window.location.origin + window.location.pathname : "";
  const q = new URLSearchParams({ seed: String(seed), dur: String(dur), km: String(km), music, ...(song ? { song } : {}) });
  return `${base}?${q.toString()}`;
};

// ========================== App ==========================
export default function App() {
  const globeRef = useRef();
  const audioRef = useRef(null);
  const params = getParams();

  const [musicOn, setMusicOn] = useState(params.music !== "off");
  const [volume, setVolume] = useState(0.5);
  const [audioErr, setAudioErr] = useState("");

  const [started, setStarted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(params.dur);
  const [order, setOrder] = useState(() =>
    params.seed ? seededShuffle(QUESTIONS, params.seed) : seededShuffle(QUESTIONS, String(Date.now()))
  );
  const [qIndex, setQIndex] = useState(0);
  const [guess, setGuess] = useState(null);
  const [result, setResult] = useState(null);
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [showFinal, setShowFinal] = useState(false); // タイムアップ時の大表示

  const current = order[qIndex % order.length];
  const MUSIC_URL = resolveMusicUrl(undefined, DEFAULT_MUSIC_URL);

  // ====== iOS 音声アンロック ======
  const triedUnlockRef = useRef(false);
  const unlockAudio = async () => {
    const el = audioRef.current;
    if (!el) return false;
    try {
      const prev = el.muted;
      el.muted = true;
      await el.play();
      el.pause();
      el.muted = prev;
      return true;
    } catch {
      return false;
    }
  };
  useEffect(() => {
    if (triedUnlockRef.current) return;
    const h = async () => {
      triedUnlockRef.current = true;
      await unlockAudio();
      document.removeEventListener("pointerdown", h);
      document.removeEventListener("touchstart", h);
    };
    document.addEventListener("pointerdown", h, { once: true });
    document.addEventListener("touchstart", h, { once: true });
    return () => {
      document.removeEventListener("pointerdown", h);
      document.removeEventListener("touchstart", h);
    };
  }, []);

  // ====== 音量・再生制御 ======
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.volume = Math.max(0, Math.min(1, volume));
    if (started && musicOn) {
      el.play().catch(() => {
        setAudioErr("自動再生がブロックされました。「音を有効にする」を押してください。");
      });
    } else {
      el.pause();
    }
  }, [started, musicOn, volume, MUSIC_URL]);

  // ====== タイマー ======
  useEffect(() => {
    if (!started) return;
    if (timeLeft <= 0) {
      // タイムアップ
      setStarted(false);
      setShowFinal(true); // スコア大表示
      return;
    }
    const t = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearTimeout(t);
  }, [started, timeLeft]);

  // ====== 自動回転（開始前ON, ゲーム中OFF） ======
  const applyAutoRotate = (on) => {
    const c = globeRef.current?.controls?.();
    if (c) {
      c.autoRotate = !!on;
      c.autoRotateSpeed = 0.5;
    }
  };
  useEffect(() => {
    applyAutoRotate(BEFORE_START_AUTO_ROTATE);
  }, []);

  // ====== カメラ移動 ======
  const focusOn = ([lat, lon], duration = 800, altitude = 1.8) => {
    if (!globeRef.current) return;
    const doSet = () => globeRef.current.pointOfView({ lat, lng: lon, altitude }, duration);
    if (globeRef.current.pointOfView) doSet();
    else setTimeout(doSet, 50);
  };

  // ====== スタート ======
  const ensureAudioStart = async () => {
    const el = audioRef.current;
    if (!el) return;
    try {
      await el.play();
      setAudioErr("");
    } catch {
      const ok = await unlockAudio();
      if (ok) {
        try {
          await el.play();
          setAudioErr("");
          return;
        } catch {}
      }
      setAudioErr("自動再生がブロックされました。「音を有効にする」を押してください。");
    }
  };
  function startGame() {
    const el = audioRef.current;
    if (el) {
      el.src = MUSIC_URL;
      el.load();
      if (musicOn) {
        el.currentTime = 0;
        // ← ここはユーザー操作内なので iOS でも再生OK
        el.play().catch(() => setAudioErr("自動再生がブロックされました。"));
      } else {
        el.pause();
      }
    }
    const seed = params.seed || `${Date.now()}`;
    const newOrder = seededShuffle(QUESTIONS, seed);
    setOrder(newOrder);
    setStarted(true);
    setShowFinal(false);
    setTimeLeft(params.dur);
    setScore(0);
    setAnswered(0);
    setCorrect(0);
    setQIndex(0);
    setGuess(null);
    setResult(null);
    applyAutoRotate(IN_GAME_AUTO_ROTATE); // 回転OFF
  }

  // ====== 次の問題 ======
  function nextQuestion() {
    setGuess(null);
    setResult(null);
    setQIndex((prev) => prev + 1);
  }

  // ====== 評価（不正解なら正解地点へ寄せる→1秒待って次へ） ======
  function evaluate(finalGuess) {
    const distKm = finalGuess ? Math.round(haversineKm(finalGuess, current.coord)) : 20000;
    const ok = distKm <= (params.km || 300);
    const gained = Math.max(0, Math.round(250 - distKm));

    setScore((s) => s + gained);
    setAnswered((n) => n + 1);
    if (ok) setCorrect((n) => n + 1);

    setResult({ distKm, correct: ok, gained, qId: current.id });

    if (!ok && AUTO_FOCUS_WRONG_ONLY) {
      focusOn(current.coord, 800, 1.8);
    }
    setTimeout(nextQuestion, PAUSE_BEFORE_NEXT_MS);
  }

  const handleGlobeClick = ({ lat, lng }) => {
    if (!started) return;
    setGuess([lat, lng]);
    evaluate([lat, lng]);
  };

  // ====== 共有 ======
  const handleShare = () => {
    const seed = params.seed || `${Date.now()}`;
    const url = buildShareUrl({
      seed,
      dur: params.dur,
      km: params.km,
      music: musicOn ? "on" : "off",
      song: MUSIC_URL
    });
    if (navigator.share) {
      navigator.share({ title: "セラ地理", text: "同じ順番でタイムアタック！", url }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(url);
      alert("共有リンクをコピーしました\n" + url);
    }
  };

  // ====== レイヤ ======
  const points = useMemo(() => {
    const arr = [];
    if (result && result.qId === current.id) {
      arr.push({
        name: result.correct ? "正解" : "不正解",
        color: result.correct ? "#22C55E" : "#EF4444",
        lat: current.coord[0],
        lng: current.coord[1]
      });
    }
    return arr;
  }, [result, current]);
  const arcs = useMemo(() => {
    if (!result || !guess || result.qId !== current.id) return [];
    return [{ startLat: guess[0], startLng: guess[1], endLat: current.coord[0], endLng: current.coord[1] }];
  }, [guess, result, current]);

  // ====== テクスチャ ======
  const earthDay = "https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg";
  const earthBump = "https://unpkg.com/three-globe/example/img/earth-topology.png";
  const globeMat = useMemo(
    () => new THREE.MeshPhongMaterial({ color: 0x87b5e5, specular: 0x333333, shininess: 5 }),
    []
  );

  // ====== スタイル ======
  const css = `
  :root { --safe-top: env(safe-area-inset-top, 0px); --safe-bottom: env(safe-area-inset-bottom, 0px); }
  *{box-sizing:border-box}
  html, body, #root { height: 100%; }
  body { margin: 0; background:#000; color:#e5f2ff; font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Hiragino Kaku Gothic ProN", Meiryo, sans-serif; }
  .wrap { min-height: 100vh; background:
      radial-gradient(1px 1px at 20% 30%, rgba(255,255,255,.8) 50%, transparent 51%),
      radial-gradient(1px 1px at 40% 70%, rgba(255,255,255,.7) 50%, transparent 51%),
      radial-gradient(2px 2px at 80% 20%, rgba(255,255,255,.9) 50%, transparent 51%),
      radial-gradient(2px 2px at 60% 50%, rgba(255,255,255,.6) 50%, transparent 51%),
      radial-gradient(1px 1px at 10% 80%, rgba(255,255,255,.8) 50%, transparent 51%),
      radial-gradient(ellipse at 50% 120%, #0b1d3a 0%, #000 70%);
  }
  .container { max-width: 1120px; margin: 0 auto; padding: 12px; }
  .toolbar {
    position: sticky; top: 0; z-index: 20;
    display:flex; gap:8px; align-items:center; justify-content:space-between;
    padding: 8px 4px; background: rgba(0,0,0,0.4); backdrop-filter: blur(8px);
  }
  .toolbar-left { display:flex; gap:8px; align-items:center; flex-wrap: wrap; }
  .title { margin:0; font-weight:900; letter-spacing:.2px; font-size:28px; text-shadow:0 2px 6px rgba(0,0,0,.6); -webkit-text-stroke:.6px rgba(0,0,0,.6) }
  .chip { padding:6px 10px; border-radius:12px; background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.18); color:#fff }
  .btn { padding:8px 12px; border-radius:12px; background:rgba(255,255,255,.1); border:1px solid rgba(255,255,255,.2); color:#fff; box-shadow:0 1px 2px rgba(0,0,0,.4); }
  .btn-primary { background:#16a34a; border-color:#16a34a; }
  .globe-card { position:relative; height: min(70vh, 78vw); border-radius:16px; overflow:hidden; }
  .q-banner {
    position:absolute; left:8px; right:8px;
    top: calc(var(--safe-top) + 8px);
    display:flex; justify-content:center; z-index:10; pointer-events:none;
  }
  .q-box {
    max-width:92%; background: rgba(0,0,0,.45); color:#fff; padding:8px 12px; border-radius:12px;
    backdrop-filter: blur(2px); box-shadow: 0 4px 12px rgba(0,0,0,.35);
    text-align:center;
  }
  .result-flash {
    position:absolute; inset:0; z-index:11; display:flex; align-items:center; justify-content:center; pointer-events:none;
  }
  .result-text {
    font-size: clamp(36px, 8vw, 70px); font-weight:900; color:#fff; -webkit-text-stroke: 3px #16a34a;
    text-shadow:0 0 18px rgba(34,197,94,.7), 0 0 36px rgba(34,197,94,.4); animation: popIn .5s ease-out both;
  }
  .result-text.bad { -webkit-text-stroke: 3px #ef4444; text-shadow:0 0 18px rgba(239,68,68,.7), 0 0 36px rgba(239,68,68,.4) }
  @keyframes popIn { 0%{transform:scale(.8);opacity:0} 40%{opacity:1} 70%{transform:scale(1.06)} 100%{transform:scale(1)} }

  .bottom-bar {
    position: fixed; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.65); backdrop-filter: blur(6px);
    border-top: 1px solid rgba(255,255,255,.08); color:#e2e8f0; z-index: 25;
  }
  .bottom-inner { max-width:1120px; margin:0 auto; padding: 8px 12px calc(8px + var(--safe-bottom)); display:flex; align-items:center; justify-content:space-between; gap:8px; }
  .final-overlay {
    position:absolute; inset:0; display:flex; align-items:center; justify-content:center; z-index: 15; pointer-events:none;
  }
  .final-box {
    pointer-events:auto;
    background: rgba(0,0,0,.55);
    border:1px solid rgba(255,255,255,.15);
    box-shadow: 0 10px 30px rgba(0,0,0,.5);
    border-radius:16px; padding: 18px 22px; text-align:center;
  }
  .final-score { font-size: clamp(32px, 10vw, 84px); font-weight: 900; margin: 6px 0 2px; color:#fff; -webkit-text-stroke: 2px rgba(0,0,0,.4) }
  .final-sub { color:#cbd5e1; font-size:14px }
  /* モバイル調整 */
  @media (max-width: 768px) {
    .title { font-size:22px }
    .globe-card { height: min(68vh, 100vw); }
    .q-box { font-size: 14px }
  }
  `;

  return (
    <div className="wrap">
      <style>{css}</style>

      <audio ref={audioRef} src={MUSIC_URL} loop preload="auto" playsInline />

      <div className="container">
        {/* ヘッダーツールバー（sticky） */}
        <div className="toolbar">
          <h1 className="title">セラ地理</h1>
          <div className="toolbar-left">
            <button className="btn" onClick={() => setMusicOn((v) => !v)}>音楽: {musicOn ? "ON" : "OFF"}</button>
            <input title="音量" type="range" min={0} max={1} step={0.01} value={volume} onChange={(e) => setVolume(Number(e.target.value))} />
            <div className="chip">残り: <b>{started ? timeLeft : params.dur}s</b></div>
            <div className="chip">正解: <b>{correct}</b> / 解答: <b>{answered}</b></div>
            {!started ? (
              <button className="btn btn-primary" onClick={startGame}>スタート</button>
            ) : (
              <button className="btn" onClick={() => { setStarted(false); applyAutoRotate(BEFORE_START_AUTO_ROTATE); }}>一時停止</button>
            )}
            <button className="btn" onClick={handleShare}>共有</button>
          </div>
        </div>

        {/* 自動再生ブロック時の案内 */}
        {audioErr && (
          <div style={{ position: "fixed", right: 12, top: `calc(var(--safe-top) + 56px)`, zIndex: 30, background: "rgba(239,68,68,.95)", color: "#fff", padding: "8px 12px", borderRadius: 10, display: "flex", gap: 8 }}>
            <span>{audioErr}</span>
            <button onClick={ensureAudioStart} className="btn" style={{ background: "#fff", color: "#ef4444", borderColor: "#fff" }}>音を有効にする</button>
          </div>
        )}

        {/* 地球 */}
        <div className="globe-card">
          {/* 問題バナー（必ず見える位置。safe-areaを考慮） */}
          {started && (
            <div className="q-banner">
              <div className="q-box">
                <div style={{ fontWeight: 800, fontSize: 18 }}>問題：{current.name}</div>
                <div style={{ fontSize: 12, opacity: 0.95, marginTop: 2 }}>ヒント：{current.hint || "（なし）"}</div>
              </div>
            </div>
          )}

          {/* 正解/不正解のフラッシュ */}
          {result && result.qId === current.id && (
            <div className="result-flash">
              <div className={`result-text ${result.correct ? "" : "bad"}`}>{result.correct ? "正解！" : "不正解！"}</div>
            </div>
          )}

          {/* タイムアップ時の大表示 */}
          {showFinal && (
            <div className="final-overlay">
              <div className="final-box">
                <div className="final-sub">タイムアップ！あなたのスコア</div>
                <div className="final-score">{score}</div>
                <div className="final-sub">正解 {correct} / 解答 {answered}</div>
                <div style={{ marginTop: 10 }}>
                  <button className="btn btn-primary" onClick={() => { setShowFinal(false); applyAutoRotate(BEFORE_START_AUTO_ROTATE); }}>OK</button>
                </div>
              </div>
            </div>
          )}

          <Globe
            ref={globeRef}
            onGlobeClick={handleGlobeClick}
            globeImageUrl={earthDay}
            bumpImageUrl={earthBump}
            globeMaterial={globeMat}
            showAtmosphere
            atmosphereAltitude={0.18}
            atmosphereColor="#7dd3fc"
            pointsData={points}
            pointAltitude={() => 0.03}
            pointRadius={0.6}
            pointColor={(d) => d.color}
            pointLabel={(d) => `${d.name}`}
            arcsData={arcs}
            arcColor={() => ["#60A5FA", "#3B82F6"]}
            arcDashLength={0.5}
            arcDashGap={0.15}
            arcDashAnimateTime={2000}
            backgroundColor="rgba(0,0,0,0)"
          />
        </div>

        {/* （任意）詳細カードは非表示でもOK。下バーで要点は見えるため省略 */}
        <div style={{ height: "72px" }} /> {/* 下バー分のスペーサー */}
      </div>

      {/* 画面下 固定バー（指届きやすい） */}
      <div className="bottom-bar">
        <div className="bottom-inner">
          <div style={{ fontSize: 13 }}>残り <b>{started ? timeLeft : params.dur}s</b></div>
          {!started ? (
            <button className="btn btn-primary" onClick={startGame}>スタート</button>
          ) : (
            <button className="btn" onClick={() => { setStarted(false); applyAutoRotate(BEFORE_START_AUTO_ROTATE); }}>一時停止</button>
          )}
          <button className="btn btn-primary" onClick={handleShare}>共有</button>
        </div>
      </div>
    </div>
  );
}
