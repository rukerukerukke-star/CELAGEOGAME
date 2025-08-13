// App.jsx
// === Sera-Geo: モード選択 + 本編統合 完成版 ===
// - 7モード：オールイン / 世界の国・都市 / 世界の湖沼 / 世界の大河 / 世界の山脈・高原 / 世界の平野・盆地 / その他
// - モード選択は地球儀の上に大きくオーバーレイ表示（スタート前は地球が回転）
// - モード選択ボタンを押すと button.mp3 が鳴る
// - BGM（sera-geo.mp3）は ゲーム中のみ 再生（音楽ON/OFF切替あり）
// - 正解/不正解の効果音：correct.mp3 / wrong.mp3
// - 不正解時は正解地点へ自動回転→1秒静止→次の問題
// - 共有リンク生成、ローカルトップ3、iOSのオーディオ有効化対応

// ===== feature flags =====
const AUTO_ROTATE_BEFORE_START = true;   // スタート前は地球を回す
const AUTO_ROTATE_IN_GAME      = false;  // ゲーム中は回さない
const AUTO_FOCUS_ON_QUESTION   = false;  // 問題切替では自動寄せしない（不正解時のみ寄せる）
const INCORRECT_PAUSE_MS       = 1000;   // 不正解後に1秒静止して次へ
const GAME_DURATION_DEFAULT    = 60;     // デフォゲーム時間
const PASS_KM_DEFAULT          = 300;    // 正解判定の距離しきい値（km）
const LEADERBOARD_KEY          = "sera-geo-top3";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Globe from "react-globe.gl";
import * as THREE from "three";

// ==== Audio files ====
export const DEFAULT_MUSIC_URL   = "/sera-geo.mp3";
export const DEFAULT_OK_URL      = "/correct.mp3";
export const DEFAULT_NG_URL      = "/wrong.mp3";
export const DEFAULT_BUTTON_URL  = "/button.mp3";

// ==== URL params helpers ====
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
function buildShareUrl({ seed, dur, km, music, mode }) {
  const base = typeof window !== "undefined"
    ? window.location.origin + window.location.pathname : "";
  const q = new URLSearchParams({
    seed: String(seed),
    dur: String(dur),
    km: String(km),
    music,
    mode
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

// ===== Datasets =====
// 正確さより「学習用の代表座標」を優先（広域は中央付近座標）
// name / lat / lon / hint

// --- 世界の国・都市（国の中心付近 + 代表都市） ---
const COUNTRIES_CITIES = [
  // 国（主要どころ・中心付近）
  { name:"アメリカ合衆国", lat:37.0902, lon:-95.7129, hint:"国・北米" },
  { name:"カナダ", lat:56.1304, lon:-106.3468, hint:"国・北米" },
  { name:"メキシコ", lat:23.6345, lon:-102.5528, hint:"国・北米" },
  { name:"ブラジル", lat:-14.2350, lon:-51.9253, hint:"国・南米" },
  { name:"アルゼンチン", lat:-38.4161, lon:-63.6167, hint:"国・南米" },
  { name:"チリ", lat:-35.6751, lon:-71.5375, hint:"国・南米" },
  { name:"イギリス", lat:55.3781, lon:-3.4360, hint:"国・欧州" },
  { name:"フランス", lat:46.6034, lon:1.8883, hint:"国・欧州" },
  { name:"ドイツ", lat:51.1657, lon:10.4515, hint:"国・欧州" },
  { name:"イタリア", lat:41.8719, lon:12.5674, hint:"国・欧州" },
  { name:"スペイン", lat:40.4637, lon:-3.7492, hint:"国・欧州" },
  { name:"ロシア", lat:61.5240, lon:105.3188, hint:"国・ユーラシア" },
  { name:"中国", lat:35.8617, lon:104.1954, hint:"国・東アジア" },
  { name:"日本", lat:36.2048, lon:138.2529, hint:"国・東アジア" },
  { name:"韓国", lat:35.9078, lon:127.7670, hint:"国・東アジア" },
  { name:"インド", lat:20.5937, lon:78.9629, hint:"国・南アジア" },
  { name:"オーストラリア", lat:-25.2744, lon:133.7751, hint:"国・オセアニア" },
  { name:"ニュージーランド", lat:-40.9006, lon:174.8860, hint:"国・オセアニア" },
  { name:"エジプト", lat:26.8206, lon:30.8025, hint:"国・北アフリカ" },
  { name:"南アフリカ", lat:-30.5595, lon:22.9375, hint:"国・アフリカ南端" },
  { name:"ナイジェリア", lat:9.0820, lon:8.6753, hint:"国・アフリカ" },
  // 都市（代表）
  { name:"東京", lat:35.6762, lon:139.6503, hint:"日本の首都" },
  { name:"ロンドン", lat:51.5074, lon:-0.1278, hint:"イギリスの首都" },
  { name:"パリ", lat:48.8566, lon:2.3522, hint:"フランスの首都" },
  { name:"ニューヨーク", lat:40.7128, lon:-74.0060, hint:"都市・アメリカ" },
  { name:"サンフランシスコ", lat:37.7749, lon:-122.4194, hint:"都市・アメリカ西海岸" },
  { name:"ベルリン", lat:52.5200, lon:13.4050, hint:"ドイツの首都" },
  { name:"ローマ", lat:41.9028, lon:12.4964, hint:"イタリアの首都" },
  { name:"ソウル", lat:37.5665, lon:126.9780, hint:"韓国の首都" },
  { name:"北京", lat:39.9042, lon:116.4074, hint:"中国の首都" },
  { name:"ニューデリー", lat:28.6139, lon:77.2090, hint:"インドの首都" },
  { name:"シドニー", lat:-33.8688, lon:151.2093, hint:"豪州最大都市" },
  { name:"メルボルン", lat:-37.8136, lon:144.9631, hint:"豪州都市" },
  { name:"リオデジャネイロ", lat:-22.9068, lon:-43.1729, hint:"ブラジル都市" },
  { name:"ブエノスアイレス", lat:-34.6037, lon:-58.3816, hint:"アルゼンチン首都" },
  { name:"カイロ", lat:30.0444, lon:31.2357, hint:"エジプトの首都" }
];

// --- 世界の湖沼 ---
const LAKES = [
  { name:"カスピ海", lat:41.7, lon:50.6, hint:"内海・ユーラシア" },
  { name:"アラル海", lat:45.0, lon:60.5, hint:"中央アジア・縮小" },
  { name:"バルハシ湖", lat:45.7, lon:74.0, hint:"カザフスタン" },
  { name:"バイカル湖", lat:53.5, lon:108.2, hint:"ロシア・世界最深" },
  { name:"スペリオル湖", lat:47.7, lon:-87.5, hint:"北米・五大湖" },
  { name:"ミシガン湖", lat:44.0, lon:-87.0, hint:"北米・五大湖" },
  { name:"ヒューロン湖", lat:45.3, lon:-82.4, hint:"北米・五大湖" },
  { name:"エリー湖", lat:42.2, lon:-81.2, hint:"北米・五大湖" },
  { name:"オンタリオ湖", lat:43.7, lon:-77.8, hint:"北米・五大湖" },
  { name:"ラドガ湖", lat:60.8, lon:31.5, hint:"ロシア" },
  { name:"グレートベア湖", lat:66.0, lon:-121.0, hint:"カナダ北部" },
  { name:"グレートスレーブ湖", lat:62.0, lon:-114.0, hint:"カナダ北部" },
  { name:"マラカイボ湖", lat:10.9, lon:-71.5, hint:"ベネズエラ" },
  { name:"ニカラグア湖", lat:11.5, lon:-85.0, hint:"ニカラグア" },
  { name:"チチカカ湖", lat:-15.8, lon:-69.4, hint:"ペルー/ボリビア" },
  { name:"チャド湖", lat:13.0, lon:14.5, hint:"アフリカ" },
  { name:"アルバート湖", lat:1.7, lon:30.9, hint:"アフリカ大地溝帯" },
  { name:"トゥルカナ湖", lat:3.5, lon:36.0, hint:"ケニア/エチオピア" },
  { name:"ウィニペグ湖", lat:52.0, lon:-98.5, hint:"カナダ" },
  { name:"ヴィクトリア湖", lat:-1.0, lon:33.0, hint:"アフリカ最大湖" },
  { name:"タンガニーカ湖", lat:-6.0, lon:29.6, hint:"アフリカ大地溝帯" },
  { name:"マラウイ湖", lat:-12.3, lon:34.6, hint:"アフリカ大地溝帯" },
  { name:"エーヤル湖", lat:36.4, lon:138.6, hint:"（仮・学習用）" }
];

// --- 世界の大河 ---
const RIVERS = [
  { name:"ナイル川", lat:23.5, lon:32.5, hint:"アフリカ北東" },
  { name:"アマゾン川", lat:-3.0, lon:-62.0, hint:"南米北部" },
  { name:"長江", lat:31.0, lon:112.0, hint:"中国" },
  { name:"ミシシッピ川", lat:35.0, lon:-90.0, hint:"北米中部" },
  { name:"エニセイ川", lat:66.0, lon:86.0, hint:"ロシア" },
  { name:"黄河", lat:36.0, lon:102.0, hint:"中国" },
  { name:"オビ川", lat:62.0, lon:66.5, hint:"ロシア西シベリア" },
  { name:"パラナ川", lat:-28.0, lon:-58.0, hint:"南米" },
  { name:"コンゴ川", lat:-2.0, lon:23.5, hint:"アフリカ中部" },
  { name:"アムール川", lat:52.0, lon:134.0, hint:"中露国境" },
  { name:"レナ川", lat:66.0, lon:124.0, hint:"東シベリア" },
  { name:"メコン川", lat:16.0, lon:104.0, hint:"東南アジア" },
  { name:"マッケンジー川", lat:64.0, lon:-124.0, hint:"カナダ" },
  { name:"ニジェール川", lat:14.0, lon:5.0, hint:"西アフリカ" },
  { name:"ヴォルガ川", lat:50.0, lon:45.0, hint:"ロシア" },
  { name:"ザンベジ川", lat:-16.0, lon:27.0, hint:"南部アフリカ" },
  { name:"ユーコン川", lat:64.0, lon:-155.0, hint:"アラスカ/カナダ" },
  { name:"リオグランデ川", lat:29.0, lon:-104.0, hint:"米墨国境" },
  { name:"シルダリア川", lat:44.0, lon:67.0, hint:"中央アジア" },
  { name:"アムダリア川", lat:41.0, lon:62.0, hint:"中央アジア" },
  { name:"ティグリス川", lat:34.0, lon:44.0, hint:"西アジア" },
  { name:"ユーフラテス川", lat:33.0, lon:41.0, hint:"西アジア" },
  { name:"ドナウ川", lat:47.0, lon:20.5, hint:"欧州" },
  { name:"コロラド川", lat:36.0, lon:-112.0, hint:"北米南西部" }
];

// --- 世界の山脈・高原 ---
const MOUNTAINS_PLATEAUS = [
  { name:"アルプス山脈", lat:46.5, lon:10.5, hint:"欧州" },
  { name:"カフカス山脈", lat:42.5, lon:45.5, hint:"欧亜境界" },
  { name:"テンシャン山脈", lat:42.0, lon:80.0, hint:"中央アジア" },
  { name:"スカンディナヴィア山脈", lat:63.0, lon:12.0, hint:"北欧" },
  { name:"ウラル山脈", lat:61.0, lon:59.0, hint:"欧亜境界" },
  { name:"ロッキー山脈", lat:45.0, lon:-113.0, hint:"北米西部" },
  { name:"アパラチア山脈", lat:38.0, lon:-81.0, hint:"北米東部" },
  { name:"アトラス山脈", lat:31.0, lon:-6.0, hint:"北アフリカ" },
  { name:"グレートディヴァイディング山脈", lat:-25.0, lon:148.0, hint:"豪州東部" },
  { name:"ヒマラヤ山脈", lat:28.0, lon:86.0, hint:"世界最高峰地帯" },
  { name:"クンルン山脈", lat:35.0, lon:82.0, hint:"中国西部" },
  { name:"アンデス山脈", lat:-22.0, lon:-68.0, hint:"南米西岸" },
  { name:"パミール高原", lat:38.5, lon:73.5, hint:"中央アジア" },
  { name:"モンゴル高原", lat:46.0, lon:103.0, hint:"東アジア内陸" },
  { name:"ラブラドル高原", lat:54.0, lon:-64.0, hint:"カナダ東部" },
  { name:"イラン高原", lat:32.0, lon:54.0, hint:"西アジア" },
  { name:"中央シベリア高原", lat:65.0, lon:100.0, hint:"ロシア" },
  { name:"コロラド高原", lat:37.0, lon:-110.0, hint:"米国南西部" },
  { name:"チベット高原", lat:32.0, lon:88.0, hint:"アジア高所" },
  { name:"メキシコ高原", lat:23.0, lon:-102.0, hint:"北米南部" },
  { name:"デカン高原", lat:17.5, lon:77.0, hint:"インド中南部" },
  { name:"エチオピア高原", lat:9.0, lon:39.0, hint:"東アフリカ" },
  { name:"ブラジル高原", lat:-16.0, lon:-50.0, hint:"南米中東部" }
];

// --- 世界の平野・盆地（広域は中央付近） ---
const PLAINS_BASINS = [
  { name:"グレートプレーンズ", lat:44.0, lon:-101.0, hint:"北米中央部" },
  { name:"プレリー", lat:52.0, lon:-106.0, hint:"カナダ平原" },
  { name:"中央平原", lat:41.0, lon:-90.0, hint:"北米中東部" },
  { name:"アマゾン盆地", lat:-5.0, lon:-62.0, hint:"南米北部" },
  { name:"カンポ", lat:-15.0, lon:-47.0, hint:"ブラジル高原の草原" },
  { name:"パンパ", lat:-36.0, lon:-61.0, hint:"アルゼンチン平原" },
  { name:"フランス平原", lat:47.0, lon:2.0, hint:"西欧" },
  { name:"北ドイツ平原", lat:53.0, lon:10.0, hint:"中欧" },
  { name:"東ヨーロッパ平原", lat:54.0, lon:30.0, hint:"欧露" },
  { name:"西シベリア低地", lat:63.0, lon:73.0, hint:"ロシア" },
  { name:"ハンガリー盆地", lat:47.0, lon:19.0, hint:"中欧" },
  { name:"トランス低地", lat:46.0, lon:21.0, hint:"ルーマニア周辺" },
  { name:"タリム盆地", lat:40.0, lon:83.0, hint:"新疆ウイグル" },
  { name:"トンペイ平原", lat:44.0, lon:125.0, hint:"中国東北" },
  { name:"華北平原", lat:36.5, lon:115.0, hint:"中国北部" },
  { name:"ヒンドスタン平原", lat:27.0, lon:77.0, hint:"インド北部" },
  { name:"コンゴ盆地", lat:-2.0, lon:23.0, hint:"中部アフリカ" },
  { name:"グレートアーディシアン盆地（大鑽井盆地）", lat:-24.0, lon:137.0, hint:"豪州内陸" }
];

// --- その他（ランドマーク・世界遺産など） ---
const OTHERS = [
  { name:"エッフェル塔", lat:48.8584, lon:2.2945, hint:"パリ" },
  { name:"自由の女神", lat:40.6892, lon:-74.0445, hint:"ニューヨーク" },
  { name:"ギザの大ピラミッド", lat:29.9792, lon:31.1342, hint:"エジプト" },
  { name:"タージ・マハル", lat:27.1751, lon:78.0421, hint:"インド" },
  { name:"コロッセオ", lat:41.8902, lon:12.4922, hint:"ローマ" },
  { name:"サグラダ・ファミリア", lat:41.4036, lon:2.1744, hint:"バルセロナ" },
  { name:"ストーンヘンジ", lat:51.1789, lon:-1.8262, hint:"イングランド" },
  { name:"万里の長城", lat:40.4319, lon:116.5704, hint:"中国" },
  { name:"クレムリン", lat:55.7520, lon:37.6173, hint:"モスクワ" },
  { name:"モン・サン＝ミシェル", lat:48.6360, lon:-1.5116, hint:"フランス" },
  { name:"オペラハウス", lat:-33.8568, lon:151.2153, hint:"シドニー" },
  { name:"アンコール・ワット", lat:13.4125, lon:103.8670, hint:"カンボジア" },
  { name:"パルテノン神殿", lat:37.9715, lon:23.7267, hint:"アテネ" },
  { name:"ブルジュ・ハリファ", lat:25.1972, lon:55.2744, hint:"ドバイ" },
  { name:"アルハンブラ宮殿", lat:37.1761, lon:-3.5881, hint:"グラナダ" },
  { name:"ノートルダム大聖堂", lat:48.8530, lon:2.3499, hint:"パリ" },
  { name:"グレート・バリア・リーフ", lat:-18.2871, lon:147.6992, hint:"オーストラリア" },
  { name:"古代ローマの遺跡", lat:41.8902, lon:12.4922, hint:"ローマ" },
  { name:"アヤソフィア", lat:41.0082, lon:28.9784, hint:"イスタンブール" },
  { name:"マチュ・ピチュ", lat:-13.1631, lon:-72.5450, hint:"ペルー" },
  { name:"ペトラ", lat:30.3285, lon:35.4444, hint:"ヨルダン" },
  { name:"ウフィツィ美術館", lat:43.7695, lon:11.2558, hint:"フィレンツェ" },
  { name:"シーギリヤ", lat:7.9572, lon:80.7603, hint:"スリランカ" },
  { name:"アブ・シンベル神殿", lat:22.3372, lon:31.6209, hint:"エジプト" },
  { name:"エルミタージュ美術館", lat:59.9343, lon:30.3351, hint:"サンクトペテルブルク" },
  { name:"ナスカの地上絵", lat:-14.7390, lon:-75.1300, hint:"ペルー" }
];

// ===== モード定義 =====
const MODE_LIST = [
  "オールイン",
  "世界の国・都市",
  "世界の湖沼",
  "世界の大河",
  "世界の山脈・高原",
  "世界の平野・盆地",
  "その他"
];

function normalize(raw){
  return raw.map((r,idx)=>({ id: idx+1, name:r.name, hint:r.hint || "", coord:[r.lat, r.lon] }));
}

function getQuestionsByMode(mode){
  const byMode = {
    "世界の国・都市": normalize(COUNTRIES_CITIES),
    "世界の湖沼": normalize(LAKES),
    "世界の大河": normalize(RIVERS),
    "世界の山脈・高原": normalize(MOUNTAINS_PLATEAUS),
    "世界の平野・盆地": normalize(PLAINS_BASINS),
    "その他": normalize(OTHERS),
  };
  if (mode === "オールイン") {
    return normalize([
      ...COUNTRIES_CITIES,
      ...LAKES,
      ...RIVERS,
      ...MOUNTAINS_PLATEAUS,
      ...PLAINS_BASINS,
      ...OTHERS
    ]);
  }
  return byMode[mode] || [];
}

// ===== URL params =====
function getParams(){
  const dur = Math.max(10, Math.min(600, Number(getParam("dur", GAME_DURATION_DEFAULT))));
  const km  = Math.max(10, Math.min(2000, Number(getParam("km", PASS_KM_DEFAULT))));
  const seed = getParam("seed", null);
  const music = getParam("music","on");
  const mode = getParam("mode", "オールイン");
  return { dur, km, seed, music, mode };
}

// ===== App =====
export default function App() {
  const globeRef = useRef();
  const bgmRef = useRef(null);
  const okRef  = useRef(null);
  const ngRef  = useRef(null);
  const btnRef = useRef(null);

  const params = getParams();
  const MUSIC_URL  = DEFAULT_MUSIC_URL;
  const OK_URL     = DEFAULT_OK_URL;
  const NG_URL     = DEFAULT_NG_URL;
  const BUTTON_URL = DEFAULT_BUTTON_URL;

  const [selectedMode, setSelectedMode] = useState(params.mode || "オールイン");

  // 音
  const [musicOn, setMusicOn] = useState(params.music !== "off");
  const [volume, setVolume] = useState(0.4);
  const [audioReady, setAudioReady] = useState(false);

  // ゲーム状態
  const [started, setStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [timeLeft, setTimeLeft] = useState(params.dur);

  const baseQuestions = useMemo(() => getQuestionsByMode(selectedMode), [selectedMode]);
  const [order, setOrder] = useState(() =>
    params.seed ? seededShuffle(baseQuestions, params.seed) : shuffle(baseQuestions)
  );
  useEffect(()=>{ // モード切替で順序再生成
    const seed = params.seed || `${Date.now()}`;
    setOrder(seededShuffle(getQuestionsByMode(selectedMode), seed));
    setQIndex(0);
  }, [selectedMode]);

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

  const current = order[qIndex % Math.max(order.length, 1)];

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
    unlockOne(btnRef.current);
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

  // ===== Audio volume / on-off =====
  useEffect(() => {
    if (bgmRef.current) bgmRef.current.volume = Math.max(0, Math.min(1, volume));
    if (okRef.current)  okRef.current.volume  = 0.9;
    if (ngRef.current)  ngRef.current.volume  = 0.9;
    if (btnRef.current) btnRef.current.volume = 0.9;
  }, [volume]);

  // BGMはゲーム中のみ
  useEffect(() => {
    const bgm = bgmRef.current;
    if (!bgm) return;
    if (started && musicOn) {
      try { bgm.currentTime = 0; bgm.play(); } catch {}
    } else {
      try { bgm.pause(); } catch {}
    }
  }, [started, musicOn]);

  // ===== Auto-rotate control =====
  useEffect(() => {
    const controls = globeRef.current?.controls?.();
    if (!controls) return;
    // モード選択表示 or 未開始 or 休憩中は回す
    const rotate = !started ? AUTO_ROTATE_BEFORE_START : AUTO_ROTATE_IN_GAME;
    controls.autoRotate = rotate;
    controls.autoRotateSpeed = 0.5;
  }, [started, selectedMode]);

  function focusOn([lat, lon]) {
    const g = globeRef.current;
    if (!g) return;
    const doSet = () => g.pointOfView({ lat, lng: lon, altitude: 1.8 }, 800);
    if (g.pointOfView) doSet(); else setTimeout(doSet, 50);
  }

  function startGame() {
    if (!baseQuestions.length) return;
    setGameOver(false);
    const seed = params.seed || `${Date.now()}`;
    const newOrder = seededShuffle(baseQuestions, seed);
    setOrder(newOrder);
    setStarted(true);
    setTimeLeft(params.dur);
    setScore(0); setAnswered(0); setCorrect(0);
    setQIndex(0); setGuess(null); setResult(null);
    // BGMは useEffect(started/musicOn) で開始
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
    const gained = Math.max(0, Math.round(250 - distKm)); // 0〜250（近いほど高得点）
    setScore(s => s + gained);
    setAnswered(n => n + 1);
    if (ok) setCorrect(n => n + 1);
    setResult({ distKm, correct: ok, gained, qId: current.id });

    // 効果音
    try {
      if (ok) { okRef.current && (okRef.current.currentTime = 0, okRef.current.play()); }
      else    { ngRef.current && (ngRef.current.currentTime = 0, ngRef.current.play()); }
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
      mode: selectedMode
    });
    if (navigator.share) {
      navigator.share({ title: "セラ地理", text: "同じ順番でタイムアタック！", url }).catch(()=>{});
    } else {
      navigator.clipboard?.writeText(url);
      alert("共有リンクをコピーしました\n" + url);
    }
  }

  function selectMode(mode){
    // モード選択音
    try { btnRef.current && (btnRef.current.currentTime = 0, btnRef.current.play()); } catch {}
    setSelectedMode(mode);
    // モード切替後はスタート待ち（BGMは started=true のみ再生）
    setStarted(false);
    setGameOver(false);
  }

  // ===== Layers =====
  const points = useMemo(() => {
    const arr = [];
    if (result && current && result.qId === current.id) {
      arr.push({
        name: result.correct ? "正解" : "不正解",
        color: result.correct ? "#22C55E" : "#EF4444",
        lat: current.coord[0], lng: current.coord[1]
      });
    }
    return arr;
  }, [result, current]);

  const arcs = useMemo(() => {
    if (!result || !guess || !current || result.qId !== current.id) return [];
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
        .mode-grid { display:grid; gap:10px; grid-template-columns: repeat(auto-fit,minmax(180px,1fr)); }
        .mode-btn { font-weight:800; padding:14px 16px; border-radius:16px; background:#111827aa; color:#fff; border:1px solid rgba(255,255,255,.2); backdrop-filter: blur(4px); box-shadow:0 8px 18px rgba(0,0,0,.35); }
        .mode-btn:hover { transform: translateY(-1px); }
      `}</style>

      {/* ====== Audios ====== */}
      <audio ref={bgmRef} src={MUSIC_URL} loop preload="auto" playsInline crossOrigin="anonymous" />
      <audio ref={okRef}  src={OK_URL} preload="auto" playsInline crossOrigin="anonymous" />
      <audio ref={ngRef}  src={NG_URL} preload="auto" playsInline crossOrigin="anonymous" />
      <audio ref={btnRef} src={BUTTON_URL} preload="auto" playsInline crossOrigin="anonymous" />

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
            正解: <b>{correct}</b> / 解答: <b>{answered}</b> ／ 残り <b>{started ? timeLeft : params.dur}s</b> ／ モード：<b>{selectedMode}</b>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => setMusicOn(v => !v)} style={btn()}>音楽: {musicOn ? "ON" : "OFF"}</button>
          <input title="音量" type="range" min={0} max={1} step={0.01} value={volume} onChange={(e)=>setVolume(Number(e.target.value))} />
          <button onClick={handleShare} style={btn()}>共有</button>
        </div>
      </header>

      {/* ====== Main ====== */}
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "8px 12px" }}>
        <div style={{ position:"relative", height: globeHeight, borderRadius: 16, overflow: "hidden" }}>
          {/* スタート前の中央タイトル・モード選択オーバーレイ */}
          {!started && !gameOver && (
            <div style={{
              position: "absolute", inset: 0, zIndex: 9,
              display: "flex", alignItems: "center", justifyContent: "center",
              textAlign: "center"
            }}>
              <div style={{ pointerEvents:"auto", maxWidth: 880, width: "92%" }}>
                <div style={{
                  fontWeight: 900, fontSize: 44, color: "#fff",
                  WebkitTextStroke: "2px #000", textShadow: "0 3px 8px rgba(0,0,0,.8)", marginBottom: 10
                }}>モードを選択</div>
                <div className="mode-grid">
                  {MODE_LIST.map(mode => (
                    <button key={mode} onClick={() => selectMode(mode)} className="mode-btn">{mode}</button>
                  ))}
                </div>
                <div style={{ marginTop:12, color:"#cbd5e1" }}>
                  選択後、下の「スタート」でゲーム開始！
                </div>
              </div>
            </div>
          )}

          {/* ゲーム中の問題バナー */}
          {started && current && (
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
          {started && result && current && result.qId === current?.id && (
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

          {/* タイムアップの巨大スコア表示 + モード選択ボタン */}
          {gameOver && (
            <div style={{ position:'absolute', inset:0, zIndex: 12,
              display:'flex', alignItems:'center', justifyContent:'center',
              background:'radial-gradient(closest-side, rgba(0,0,0,.5), rgba(0,0,0,.2), transparent)' }}>
              <div style={{ textAlign:'center' }}>
                <div style={{ color:'#e5e7eb', fontSize:18, marginBottom:6 }}>Time Up!</div>
                <div style={{
                  fontSize: 64, fontWeight: 900, color:'#fff',
                  WebkitTextStroke: "2px rgba(0,0,0,.6)",
                  textShadow:"0 6px 18px rgba(0,0,0,.55)"
                }}>
                  SCORE: {score}
                </div>
                <div style={{ color:'#cbd5e1', marginTop:8, fontSize:14 }}>
                  正解 {correct}／解答 {answered}
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

                <div style={{ display:"flex", gap:8, justifyContent:"center", marginTop:14 }}>
                  <button onClick={()=>{ setGameOver(false); startGame(); }} style={primaryBtn()}>もう一度</button>
                  <button onClick={()=>{ setGameOver(false); setStarted(false); }} style={btn()}>
                    モード選択に戻る
                  </button>
                </div>
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

        {/* 待機の結果カード（直前のスコアを残す） */}
        {!started && !gameOver && answered > 0 && (
          <div style={{
            marginTop: 12, background: "rgba(255,255,255,0.06)", borderRadius: 12,
            padding: 12, border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0'
          }}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>結果</div>
            <div style={{ fontSize: 14 }}>
              正解：<b>{correct}</b> / 解答：<b>{answered}</b> ／ スコア：<b>{score}</b>
            </div>
            <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 6 }}>モードを選んで「スタート」で再チャレンジ！</div>
          </div>
        )}

        {/* 待機のトップ3 */}
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
            残り <b>{started ? timeLeft : params.dur}s</b> ／ モード：<b>{selectedMode}</b>
          </div>
          {!started ? (
            <button onClick={startGame} style={primaryBtn()} disabled={!baseQuestions.length}>
              スタート
            </button>
          ) : (
            <button onClick={() => setStarted(false)} style={btn()}>一時停止</button>
          )}
          <button onClick={handleShare} style={primaryBtn()}>共有</button>
        </div>
      </div>

      {/* ====== iOS Audio enable bubble ====== */}
      {!audioReady && (
        <div style={{ position:'fixed', right: 12, top: headerH + 8, zIndex: 20,
          background:'rgba(0,0,0,.75)', color:'#fff', padding:'10px 12px', borderRadius:12,
          boxShadow:'0 6px 16px rgba(0,0,0,.35)' }}>
          <div style={{ fontSize: 13, marginBottom: 6 }}>iPhoneは初回に音の有効化が必要です</div>
          <button onClick={enableAudioManually} style={primaryBtn()}>音を有効にする</button>
        </div>
      )}
    </div>
  );
}

// ===== styles helpers =====
function btn(){ return { padding:"8px 12px", borderRadius:12, background:"rgba(255,255,255,0.1)", color:'#fff', border:"1px solid rgba(255,255,255,0.2)", boxShadow:"0 1px 2px rgba(0,0,0,0.4)" }; }
function primaryBtn(){ return { padding:"8px 12px", borderRadius:12, background:"#16a34a", color:"#fff", border:"1px solid #16a34a", boxShadow:"0 2px 8px rgba(0,0,0,0.4)" }; }

// ===== optional exports =====
export { haversineKm, seededShuffle, buildShareUrl };
