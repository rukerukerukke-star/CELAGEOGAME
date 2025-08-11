// ===== feature flags =====
const AUTO_ROTATE_BEFORE_START = true;   // スタート前は地球を回す
const AUTO_ROTATE_IN_GAME      = false;  // ゲーム中は回さない
const AUTO_FOCUS_ON_QUESTION   = false;  // 問題切替で自動フォーカスしない（不正解の時だけ寄せる）
const INCORRECT_PAUSE_MS       = 1000;   // 不正解後に1秒静止して次へ
const GAME_DURATION_DEFAULT    = 60;     // デフォゲーム時間
const PASS_KM_DEFAULT          = 300;    // 何km以内で正解とするか
const LEADERBOARD_KEY          = "sera-geo-top3"; // トップ3保存キー

import React, { useEffect, useMemo, useRef, useState } from "react";
import Globe from "react-globe.gl";
import * as THREE from "three";

// ==== Audio URL helpers ====
export const DEFAULT_MUSIC_URL = "/sera-geo.mp3"; // /public 配下に設置
export const DEFAULT_OK_URL    = "/correct.mp3";   // 正解
export const DEFAULT_NG_URL    = "/wrong.mp3";     // 不正解

function paramString() {
  try { return typeof window !== "undefined" ? window.location.search : ""; }
  catch { return ""; }
}
function getParam(name, fallback = null) {
  try {
    const p = new URLSearchParams(paramString());
    return p.get(name) ?? fallback;
  } catch { return fallback; }
}
function resolveSongUrl(defaultUrl) {
  // ?song= でBGM変更、?correct= ?wrong= で効果音変更
  const key = defaultUrl === DEFAULT_MUSIC_URL ? "song"
            : defaultUrl === DEFAULT_OK_URL    ? "correct"
            : "wrong";
  return getParam(key, defaultUrl);
}
function buildShareUrl({ seed, dur, km, music, song }) {
  const base = typeof window !== "undefined"
    ? window.location.origin + window.location.pathname : "";
  const q = new URLSearchParams({
    seed: String(seed),
    dur: String(dur),
    km: String(km),
    music,
    ...(song ? { song } : {})
  });
  return `${base}?${q.toString()}`;
}

// ===== Math / Utils =====
const toRad = (deg) => (deg * Math.PI) / 180;
function haversineKm([lat1, lon1], [lat2, lon2]) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
function shuffle(arr) { const a = arr.slice();
  for (let i=a.length-1;i>0;i--){ const j = Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function xmur3(str){ let h=1779033703^str.length; for(let i=0;i<str.length;i++){h=Math.imul(h^str.charCodeAt(i),3432918353);h=(h<<13)|(h>>>19);} return function(){h=Math.imul(h^(h>>>16),2246822507);h=Math.imul(h^(h>>>13),3266489909);h^=h>>>16;return h>>>0;};}
function mulberry32(a){return function(){let t=(a+=0x6d2b79f5);t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
function seededShuffle(arr, seedStr="default"){ const seed=xmur3(seedStr)(); const rand=mulberry32(seed); const a=arr.slice();
  for(let i=a.length-1;i>0;i--){ const j=Math.floor(rand()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

// ===== Questions =====
const RAW = [
  // --- 都市（既存） ---
  { name: "ニューヨーク", lat: 40.7128, lon: -74.0060, hint: "都市・アメリカ" },
  { name: "東京", lat: 35.6762, lon: 139.6503, hint: "日本の首都" },
  { name: "ロンドン", lat: 51.5074, lon: -0.1278, hint: "イギリスの首都" },
  { name: "サンフランシスコ", lat: 37.7749, lon: -122.4194, hint: "都市・アメリカ西海岸" },
  { name: "シンガポール", lat: 1.3521, lon: 103.8198, hint: "都市国家・東南アジア" },
  { name: "イスタンブール", lat: 41.0082, lon: 28.9784, hint: "都市・トルコ（欧亜境界）" },
  { name: "ドバイ", lat: 25.276987, lon: 55.296249, hint: "都市・UAE" },

  // --- ランドマーク（既存） ---
  { name: "エッフェル塔", lat: 48.8584, lon: 2.2945, hint: "ランドマーク・パリ" },
  { name: "自由の女神", lat: 40.6892, lon: -74.0445, hint: "ランドマーク・NY" },

  // --- 河川・自然 ---
  { name: "ナイル川", lat: 30.0444, lon: 31.2357, hint: "河川・アフリカ" },
  { name: "サハラ砂漠", lat: 23.4162, lon: 25.6628, hint: "砂漠・アフリカ北部" },
  { name: "グランドキャニオン", lat: 36.1069, lon: -112.1129, hint: "峡谷・アメリカ" },
  { name: "ヨセミテ国立公園", lat: 37.8651, lon: -119.5383, hint: "国立公園・アメリカ" },
  { name: "フィヨルド（ガイランゲル）", lat: 62.1015, lon: 7.2050, hint: "氷食地形・ノルウェー" },
  { name: "ガラパゴス諸島", lat: -0.9538, lon: -90.9656, hint: "諸島・エクアドル" },
  { name: "セレンゲティ国立公園", lat: -2.3333, lon: 34.8333, hint: "サバンナ・タンザニア" },
  { name: "イグアスの滝", lat: -25.6953, lon: -54.4367, hint: "滝・アルゼンチン/ブラジル" },
  { name: "ハロン湾", lat: 20.9101, lon: 107.1839, hint: "湾・ベトナム" },
  { name: "パンタナール", lat: -16.7110, lon: -56.1620, hint: "湿地・ブラジル" },

  // --- 山岳 ---
  { name: "エベレスト山", lat: 27.9881, lon: 86.9250, hint: "世界最高峰・ヒマラヤ" },
  { name: "富士山", lat: 35.3606, lon: 138.7274, hint: "日本・本州" },
  { name: "アンデス山脈", lat: -32.6532, lon: -70.0114, hint: "南米西部を縦断" },
  { name: "キリマンジャロ山", lat: -3.0674, lon: 37.3556, hint: "アフリカ最高峰・タンザニア" },
  { name: "モンブラン", lat: 45.8326, lon: 6.8652, hint: "アルプス・仏伊国境" },

  // --- 国 ---
  { name: "ナイジェリア", lat: 9.0820, lon: 8.6753, hint: "国・アフリカ" },
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

  // --- 湖・海 ---
  { name: "バイカル湖", lat: 53.5587, lon: 108.1652, hint: "湖・ロシア" },
  { name: "カスピ海", lat: 37.5, lon: 50.0, hint: "内海・ユーラシア" },
  { name: "ティティカカ湖", lat: -15.7652, lon: -69.5312, hint: "湖・ボリビア/ペルー" },

  // --- 建造物・遺跡 ---
  { name: "ギザの大ピラミッド", lat: 29.9792, lon: 31.1342, hint: "エジプト・ギザ" },
  { name: "タージ・マハル", lat: 27.1751, lon: 78.0421, hint: "インド・アグラ" },
  { name: "コロッセオ", lat: 41.8902, lon: 12.4922, hint: "イタリア・ローマ" },
  { name: "サグラダ・ファミリア", lat: 41.4036, lon: 2.1744, hint: "スペイン・バルセロナ" },
  { name: "ストーンヘンジ", lat: 51.1789, lon: -1.8262, hint: "イギリス・遺跡" },
  { name: "万里の長城", lat: 40.4319, lon: 116.5704, hint: "中国・長城" },
  { name: "クレムリン", lat: 55.7520, lon: 37.6173, hint: "ロシア・モスクワ" },
  { name: "モン・サン＝ミシェル", lat: 48.6360, lon: -1.5116, hint: "フランス・修道院" },
  { name: "オペラハウス", lat: -33.8568, lon: 151.2153, hint: "オーストラリア・シドニー" },
  { name: "アンコール・ワット", lat: 13.4125, lon: 103.8670, hint: "カンボジア・寺院" },
  { name: "パルテノン神殿", lat: 37.9715, lon: 23.7267, hint: "ギリシャ・アテネ" },
  { name: "ブルジュ・ハリファ", lat: 25.1972, lon: 55.2744, hint: "UAE・世界一高い塔" },
  { name: "アルハンブラ宮殿", lat: 37.1761, lon: -3.5881, hint: "スペイン・グラナダ" },
  { name: "ノートルダム大聖堂", lat: 48.8530, lon: 2.3499, hint: "フランス・パリ" },

  // --- 世界遺産 ---
  { name: "グレート・バリア・リーフ", lat: -18.2871, lon: 147.6992, hint: "世界最大のサンゴ礁" },
  { name: "古代ローマの遺跡", lat: 41.8902, lon: 12.4922, hint: "ローマ史跡群" },
  { name: "アヤソフィア", lat: 41.0082, lon: 28.9784, hint: "トルコ・イスタンブール" },
  { name: "マチュ・ピチュ", lat: -13.1631, lon: -72.5450, hint: "ペルー・空中都市" },
  { name: "ペトラ", lat: 30.3285, lon: 35.4444, hint: "ヨルダン・岩窟遺跡" },
  { name: "ウフィツィ美術館", lat: 43.7695, lon: 11.2558, hint: "イタリア・フィレンツェ" },
  { name: "シーギリヤ", lat: 7.9572, lon: 80.7603, hint: "スリランカ・ライオンロック" },
  { name: "アブ・シンベル神殿", lat: 22.3372, lon: 31.6209, hint: "エジプト・大神殿" },
  { name: "エルミタージュ美術館", lat: 59.9343, lon: 30.3351, hint: "ロシア・サンクトペテルブルク" },

  // --- その他 ---
  { name: "ナスカの地上絵", lat: -14.7390, lon: -75.1300, hint: "ペルー・地上絵" },
];
function normalizeQuestions(raw){ return raw.map((r,idx)=>({ id:idx+1, name:r.name, hint:r.hint||"", coord:[r.lat,r.lon] })); }
const QUESTIONS = normalizeQuestions(RAW);

// ===== URL params =====
function getParams(){
  const dur = Math.max(10, Math.min(600, Number(getParam("dur", GAME_DURATION_DEFAULT))));
  const km  = Math.max(10, Math.min(2000, Number(getParam("km", PASS_KM_DEFAULT))));
  const seed = getParam("seed", null);
  const music = getParam("music","on");
  return { dur, km, seed, music };
}

// ===== App =====
export default function App() {
  const globeRef = useRef();
  const bgmRef = useRef(null);
  const okRef  = useRef(null);
  const ngRef  = useRef(null);

  const params = getParams();
  const MUSIC_URL = resolveSongUrl(DEFAULT_MUSIC_URL);
  const OK_URL    = resolveSongUrl(DEFAULT_OK_URL);
  const NG_URL    = resolveSongUrl(DEFAULT_NG_URL);

  const [musicOn, setMusicOn] = useState(params.music !== "off");
  const [volume, setVolume] = useState(0.4);
  const [audioReady, setAudioReady] = useState(false);

  const [started, setStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [timeLeft, setTimeLeft] = useState(params.dur);
  const [order, setOrder] = useState(() =>
    params.seed ? seededShuffle(QUESTIONS, params.seed) : shuffle(QUESTIONS)
  );
  const [qIndex, setQIndex] = useState(0);
  const [guess, setGuess] = useState(null);
  const [result, setResult] = useState(null);
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [correct, setCorrect] = useState(0);

  const [top3, setTop3] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LEADERBOARD_KEY) || "[]"); }
    catch { return []; }
  });

  const current = order[qIndex % order.length];

  // ===== Audio Unlock =====
  function unlockOne(el) {
    if (!el) return;
    try {
      el.muted = true;
      el.play(); el.pause();
      el.currentTime = 0;
      el.muted = false;
    } catch {}
  }
  function enableAudioManually(){
    unlockOne(bgmRef.current);
    unlockOne(okRef.current);
    unlockOne(ngRef.current);
    setAudioReady(true);
  }
  useEffect(() => {
    if (audioReady) return;
    const handler = () => { enableAudioManually(); };
    window.addEventListener("pointerdown", handler, { once: true });
    window.addEventListener("touchstart", handler, { once: true });
    return () => {
      window.removeEventListener("pointerdown", handler);
      window.removeEventListener("touchstart", handler);
    };
  }, [audioReady]);

  // ===== Audio volume =====
  useEffect(() => {
    if (bgmRef.current) bgmRef.current.volume = Math.max(0, Math.min(1, volume));
    if (okRef.current)  okRef.current.volume  = 0.9;
    if (ngRef.current)  ngRef.current.volume  = 0.9;
  }, [volume]);

  // ===== Auto-rotate control =====
  useEffect(() => {
    const controls = globeRef.current?.controls?.();
    if (!controls) return;
    controls.autoRotate = started ? AUTO_ROTATE_IN_GAME : AUTO_ROTATE_BEFORE_START;
    controls.autoRotateSpeed = 0.5;
  }, [started]);

  function focusOn([lat, lon]) {
    const g = globeRef.current;
    if (!g) return;
    const doSet = () => g.pointOfView({ lat, lng: lon, altitude: 1.8 }, 800);
    if (g.pointOfView) doSet(); else setTimeout(doSet, 50);
  }

  function startGame() {
    setGameOver(false);
    const seed = params.seed || `${Date.now()}`;
    const newOrder = seededShuffle(QUESTIONS, seed);
    setOrder(newOrder);
    setStarted(true);
    setTimeLeft(params.dur);
    setScore(0); setAnswered(0); setCorrect(0);
    setQIndex(0); setGuess(null); setResult(null);

    // BGM再生
    const bgm = bgmRef.current;
    if (bgm) {
      bgm.src = MUSIC_URL; bgm.loop = true; bgm.volume = volume;
      if (musicOn) { try { bgm.currentTime = 0; bgm.play(); } catch {} }
    }

    // 最初の問題を少し寄せる（自動フォーカスOFFでも開始時は寄せてOK）
    const first = newOrder[0];
    if (first) focusOn(first.coord);
  }

  function endGame() {
    setStarted(false);
    setGameOver(true);

    // トップ3更新
    const next = [...top3, score].sort((a,b)=>b-a).slice(0,3);
    setTop3(next);
    try { localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(next)); } catch {}
  }

  // ===== Timer =====
  useEffect(() => {
    if (!started) return;
    if (timeLeft <= 0) { endGame(); return; }
    const t = setTimeout(() => setTimeLeft(t => t - 1), 1000);
    return () => clearTimeout(t);
  }, [started, timeLeft]);

  // ===== 次の問題 =====
  function nextQuestion() {
    setGuess(null);
    setResult(null);
    setQIndex(prev => {
      const next = prev + 1;
      if (AUTO_FOCUS_ON_QUESTION) {
        const idx = next % order.length;
        const nextQ = order[idx];
        if (nextQ) focusOn(nextQ.coord);
      }
      return next;
    });
  }

  // ===== 回答評価 =====
  function evaluate(finalGuess) {
    const distKm = finalGuess ? Math.round(haversineKm(finalGuess, current.coord)) : 20000;
    const ok = distKm <= (params.km || PASS_KM_DEFAULT);
    const gained = Math.max(0, Math.round(250 - distKm));
    setScore(s => s + gained);
    setAnswered(n => n + 1);
    if (ok) setCorrect(n => n + 1);
    setResult({ distKm, correct: ok, gained, qId: current.id });

    // 効果音
    try {
      if (ok) { if (okRef.current) { okRef.current.currentTime = 0; okRef.current.play(); } }
      else    { if (ngRef.current) { ngRef.current.currentTime = 0; ngRef.current.play(); } }
    } catch {}

    // 不正解 → 正解地点に寄せる、1秒静止
    if (!ok) focusOn(current.coord);
    setTimeout(nextQuestion, INCORRECT_PAUSE_MS);
  }

  function handleGlobeClick({ lat, lng }) {
    if (!started) return;
    setGuess([lat, lng]);
    evaluate([lat, lng]);
  }

  function handleShare() {
    const seed = params.seed || `${Date.now()}`;
    const url = buildShareUrl({
      seed,
      dur: params.dur,
      km: params.km,
      music: musicOn ? "on" : "off",
      song: MUSIC_URL
    });
    if (navigator.share) {
      navigator.share({ title: "セラ地理", text: "同じ順番でタイムアタック！", url }).catch(()=>{});
    } else {
      navigator.clipboard?.writeText(url);
      alert("共有リンクをコピーしました\n" + url);
    }
  }

  // ===== Layers =====
  const points = useMemo(() => {
    const arr = [];
    if (result && result.qId === current.id) {
      arr.push({
        name: result.correct ? "正解" : "不正解",
        color: result.correct ? "#22C55E" : "#EF4444",
        lat: current.coord[0], lng: current.coord[1]
      });
    }
    return arr;
  }, [result, current]);

  const arcs = useMemo(() => {
    if (!result || !guess || result.qId !== current.id) return [];
    return [{ startLat: guess[0], startLng: guess[1], endLat: current.coord[0], endLng: current.coord[1] }];
  }, [guess, result, current]);

  // ===== Globe textures =====
  const earthDay = "https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg";
  const earthBump= "https://unpkg.com/three-globe/example/img/earth-topology.png";
  const globeMat = useMemo(() => new THREE.MeshPhongMaterial({ color: 0x87b5e5, specular: 0x333333, shininess: 5 }), []);

  // ===== Responsive sizes =====
  const headerH = 56; // px
  const bottomH = 56; // px
  const globeHeight = "min(70svh, 68vh)";

  return (
    <div style={{
      minHeight: "100svh",
      color: "#e5f2ff",
      backgroundColor: "#000",
      backgroundImage:
        "radial-gradient(1px 1px at 20% 30%, rgba(255,255,255,.8) 50%, transparent 51%),"+
        "radial-gradient(1px 1px at 40% 70%, rgba(255,255,255,.7) 50%, transparent 51%),"+
        "radial-gradient(2px 2px at 80% 20%, rgba(255,255,255,.9) 50%, transparent 51%),"+
        "radial-gradient(2px 2px at 60% 50%, rgba(255,255,255,.6) 50%, transparent 51%),"+
        "radial-gradient(1px 1px at 10% 80%, rgba(255,255,255,.8) 50%, transparent 51%),"+
        "radial-gradient(ellipse at 50% 120%, #0b1d3a 0%, #000 70%)",
      paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)"
    }}>
      <style>{`
        @keyframes popIn { 0%{transform:scale(.8);opacity:0} 40%{opacity:1} 70%{transform:scale(1.06)} 100%{transform:scale(1)} }
        .hide-on-mobile { display: none; }
        @media (min-width: 700px){ .hide-on-mobile { display: inline-flex; } }
      `}</style>

      {/* ====== Audios ====== */}
      <audio ref={bgmRef} src={MUSIC_URL} loop preload="auto" playsInline crossOrigin="anonymous" />
      <audio ref={okRef}  src={OK_URL} preload="auto" playsInline crossOrigin="anonymous" />
      <audio ref={ngRef}  src={NG_URL} preload="auto" playsInline crossOrigin="anonymous" />

      {/* ====== Header ====== */}
      <header style={{
        position: "sticky", top: 0, zIndex: 10,
        height: headerH, display: "flex", alignItems: "center",
        justifyContent: "space-between", gap: 8,
        padding: "6px 12px", backdropFilter: "saturate(180%) blur(8px)",
        background: "rgba(0,0,0,.35)", borderBottom: "1px solid rgba(255,255,255,.08)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontWeight: 900, fontSize: 22, color: "#fff", textShadow: "0 2px 6px rgba(0,0,0,.6)" }}>セラ地理</div>
          <div className="hide-on-mobile" style={{ fontSize: 12, color: "#cbd5e1" }}>
            正解: <b>{correct}</b> / 解答: <b>{answered}</b> ／ 残り <b>{started ? timeLeft : params.dur}s</b>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => setMusicOn(v => !v)} style={btn()}>音楽: {musicOn ? "ON" : "OFF"}</button>
          <input title="音量" type="range" min={0} max={1} step={0.01} value={volume} onChange={(e)=>setVolume(Number(e.target.value))} />
          <button onClick={handleShare} style={btn()}>共有</button>
        </div>
      </header>

      {/* ====== Audio enable (iOS対策) ====== */}
      {!audioReady && (
        <div style={{ position:'fixed', right: 12, top: headerH + 8, zIndex: 20,
          background:'rgba(0,0,0,.75)', color:'#fff', padding:'10px 12px', borderRadius:12,
          boxShadow:'0 6px 16px rgba(0,0,0,.35)' }}>
          <div style={{ fontSize: 13, marginBottom: 6 }}>iPhoneは初回に有効化が必要です</div>
          <button onClick={enableAudioManually} style={primaryBtn()}>音を有効にする</button>
        </div>
      )}

      {/* ====== Main ====== */}
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "8px 12px" }}>
        <div style={{ position:"relative", height: globeHeight, borderRadius: 16, overflow: "hidden" }}>
          {/* スタート前の中央タイトル */}
          {!started && !gameOver && (
            <div style={{
              position: "absolute", inset: 0, zIndex: 9,
              display: "flex", alignItems: "center", justifyContent: "center",
              textAlign: "center", pointerEvents: "none"
            }}>
              <div>
                <div style={{
                  fontWeight: 900, fontSize: 48, color: "#fff",
                  WebkitTextStroke: "2px #000", textShadow: "0 3px 8px rgba(0,0,0,.8)", marginBottom: 8
                }}>セラ地理</div>
                <div style={{ color: "#cbd5e1" }}>スタートで開始！ タップして場所を当てよう</div>
              </div>
            </div>
          )}

          {/* ゲーム中の問題バナー */}
          {started && (
            <div style={{
              position: 'absolute', top: 8, left: 8, right: 8, zIndex: 9,
              display: 'flex', justifyContent: 'center', pointerEvents: 'none'
            }}>
              <div style={{
                maxWidth: '90%', background: 'rgba(0,0,0,.45)', color: '#fff',
                padding: '8px 12px', borderRadius: 12, backdropFilter: 'blur(2px)',
                boxShadow: '0 4px 12px rgba(0,0,0,.35)'
              }}>
                <div style={{ fontWeight: 800, fontSize: 18, textAlign: 'center', textShadow: '0 2px 4px rgba(0,0,0,.6)' }}>
                  問題：{current?.name}
                </div>
                <div style={{ fontSize: 12, opacity: .95, textAlign: 'center' }}>
                  ヒント：{current?.hint || '（なし）'}
                </div>
              </div>
            </div>
          )}

          {/* 正解／不正解フラッシュ */}
          {result && result.qId === current?.id && (
            <div style={{ position:'absolute', inset:0, zIndex: 11,
              display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
              <div style={{
                fontSize: 64, fontWeight: 900, color: '#fff',
                WebkitTextStroke: `3px ${result.correct ? '#16a34a' : '#ef4444'}`,
                textShadow: result.correct
                  ? "0 0 18px rgba(34,197,94,.7), 0 0 36px rgba(34,197,94,.4)"
                  : "0 0 18px rgba(239,68,68,.7), 0 0 36px rgba(239,68,68,.4)",
                animation: 'popIn .5s ease-out both'
              }}>{result.correct ? "正解！" : "不正解！"}</div>
            </div>
          )}

          {/* タイムアップの巨大スコア表示 */}
          {gameOver && (
            <div style={{ position:'absolute', inset:0, zIndex: 12,
              display:'flex', alignItems:'center', justifyContent:'center',
              background:'radial-gradient(closest-side, rgba(0,0,0,.5), rgba(0,0,0,.2), transparent)' }}>
              <div style={{ textAlign:'center', pointerEvents:'none' }}>
                <div style={{ color:'#e5e7eb', fontSize:18, marginBottom:6 }}>Time Up!</div>
                <div style={{
                  fontSize: 64, fontWeight: 900, color:'#fff',
                  WebkitTextStroke: "2px rgba(0,0,0,.6)",
                  textShadow:"0 6px 18px rgba(0,0,0,.55)"
                }}>
                  SCORE: {score}
                </div>
                <div style={{ color:'#cbd5e1', marginTop:8, fontSize:14 }}>
                  正解 {correct}／解答 {answered}　（スタートで再挑戦）
                </div>

                {/* トップ3 */}
                {top3.length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontWeight: 800, marginBottom: 6 }}>🏆 あなたのトップ3</div>
                    <ol style={{ margin: 0, paddingLeft: 18 }}>
                      {top3.map((s, i) => <li key={i}>{s}</li>)}
                    </ol>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* === Globe === */}
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

        {/* 下に小さな結果カード（待機時） */}
        {!started && !gameOver && answered > 0 && (
          <div style={{
            marginTop: 12, background: "rgba(255,255,255,0.06)", borderRadius: 12,
            padding: 12, border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0'
          }}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>結果</div>
            <div style={{ fontSize: 14 }}>
              正解：<b>{correct}</b> / 解答：<b>{answered}</b> ／ スコア：<b>{score}</b>
            </div>
            <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 6 }}>「スタート」で再チャレンジ！</div>
          </div>
        )}

        {/* 待機時のトップ3 */}
        {!started && !gameOver && top3.length > 0 && (
          <div style={{
            marginTop: 12, background: "rgba(255,255,255,0.06)", borderRadius: 12,
            padding: 12, border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0'
          }}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6 }}>🏆 あなたのトップ3</div>
            <ol style={{ margin: 0, paddingLeft: 18 }}>
              {top3.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          </div>
        )}
      </div>

      {/* ====== Bottom Bar ====== */}
      <div style={{
        position: "fixed", left: 0, right: 0, bottom: 0, height: bottomH,
        background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)",
        borderTop: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0',
        paddingBottom: "env(safe-area-inset-bottom)", zIndex: 15
      }}>
        <div style={{
          maxWidth: 1120, margin: "0 auto", height: "100%",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 12px"
        }}>
          <div style={{ fontSize: 13 }}>
            残り <b>{started ? timeLeft : params.dur}s</b>
          </div>
          {!started ? (
            <button onClick={startGame} style={primaryBtn()}>スタート</button>
          ) : (
            <button onClick={() => setStarted(false)} style={btn()}>一時停止</button>
          )}
          <button onClick={handleShare} style={primaryBtn()}>共有</button>
        </div>
      </div>
    </div>
  );
}

// ===== styles helpers =====
function btn(){ return { padding:"8px 12px", borderRadius:12, background:"rgba(255,255,255,0.1)", color:'#fff', border:"1px solid rgba(255,255,255,0.2)", boxShadow:"0 1px 2px rgba(0,0,0,0.4)" }; }
function primaryBtn(){ return { padding:"8px 12px", borderRadius:12, background:"#16a34a", color:"#fff", border:"1px solid #16a34a", boxShadow:"0 2px 8px rgba(0,0,0,0.4)" }; }

// ===== optional exports for tests =====
export { haversineKm, seededShuffle, buildShareUrl };
