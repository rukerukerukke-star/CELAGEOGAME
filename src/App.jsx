// App.jsx
// === Sera-Geo: モード選択 + 本編統合 完成版 ===
// - 8モード：オールイン / レギュラーモード / 世界の国・都市 / 世界の湖沼 / 世界の大河 / 世界の山脈・高原 / 世界の平野・盆地 / その他
// - モード選択は地球儀の上に大きくオーバーレイ表示（スタート前は地球が回転）
// - モード選択ボタンを押すと button.mp3 が鳴る
// - BGM（sera-geo.mp3）は ゲーム中のみ 再生（音楽ON/OFF切替あり）
// - 正解/不正解の効果音：correct.mp3 / wrong.mp3
// - 不正解時は正解地点へ自動回転→1秒静止→次の問題
// - 共有リンク生成、ローカルトップ3、iOSのオーディオ有効化対応
// - クリア後の称号（250点刻み）を表示：
//    0-249 方角方向オンチ / 250-499 地理は寝てた勢 / 500-749 地図帳は観賞用 / 750-999 夢の中で世界一周
//    1000-1249 いつも地図帳持ち歩いてる人 / 1250-1499 グーグルアース中毒者 / 1500+ 歩く地球儀

// ===== feature flags =====
const AUTO_ROTATE_BEFORE_START = true;   // スタート前は地球を回す
const AUTO_ROTATE_IN_GAME      = false;  // ゲーム中は回さない
const AUTO_FOCUS_ON_QUESTION   = false;  // 問題切替では自動寄せしない（不正解時のみ寄せる）
const INCORRECT_PAUSE_MS       = 1000;   // 不正解後に1秒静止して次へ
const GAME_DURATION_DEFAULT    = 60;     // デフォゲーム時間
const PASS_KM_DEFAULT          = 600;    // 正解判定の距離しきい値（km）- より広い範囲で正解
const LEADERBOARD_KEY          = "sera-geo-top3";
const STATS_KEY                = "sera-geo-stats";
const BADGES_KEY               = "sera-geo-badges";
const WRONG_ANSWERS_KEY        = "sera-geo-wrong-answers";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Globe from "react-globe.gl";
import * as THREE from "three";

// ==== Audio files ====
// BASE_URLを使って正しいパスを生成（GitHub Pages対応）
const getAssetUrl = (filename) => `${import.meta.env.BASE_URL}${filename}`;
export const DEFAULT_MUSIC_URL   = getAssetUrl("sera-geo.mp3");
export const DEFAULT_OK_URL      = getAssetUrl("correct.mp3");
export const DEFAULT_NG_URL      = getAssetUrl("wrong.mp3");
export const DEFAULT_BUTTON_URL  = getAssetUrl("button.mp3");

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

// --- helper: データセットから名前で抜き出す ---
function pickByNames(raw, names) {
  const set = new Set(names);
  return raw.filter(d => set.has(d.name));
}

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

// === レギュラーモード用 “やさしめ” セット ===
const EASY_COUNTRIES_CITIES_NAMES = [
  // 国
  "日本","中国","アメリカ合衆国","イギリス","フランス","ドイツ","インド","オーストラリア","ブラジル","エジプト",
  // 都市
  "東京","ロンドン","パリ","ニューヨーク","ソウル","北京","ニューデリー","シドニー","ローマ","カイロ"
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
const EASY_LAKES_NAMES = [
  "カスピ海","バイカル湖","スペリオル湖","ミシガン湖","エリー湖","オンタリオ湖","ヴィクトリア湖","タンガニーカ湖"
];

// --- 世界の大河 ---
const RIVERS = [
  { name:"ナイル川", lat:31.0, lon:31.4, hint:"エジプト地中海岸" },
  { name:"アマゾン川", lat:-0.5, lon:-50.5, hint:"ブラジル大西洋岸" },
  { name:"長江", lat:31.4, lon:121.8, hint:"上海付近" },
  { name:"ミシシッピ川", lat:29.0, lon:-89.25, hint:"メキシコ湾" },
  { name:"エニセイ川", lat:72.4, lon:80.5, hint:"カラ海" },
  { name:"黄河", lat:37.8, lon:119.3, hint:"渤海" },
  { name:"オビ川", lat:66.5, lon:66.6, hint:"カラ海" },
  { name:"パラナ川", lat:-34.7, lon:-58.4, hint:"ラプラタ川河口" },
  { name:"コンゴ川", lat:-6.0, lon:12.4, hint:"大西洋" },
  { name:"アムール川", lat:53.3, lon:140.8, hint:"オホーツク海" },
  { name:"レナ川", lat:72.4, lon:126.8, hint:"ラプテフ海" },
  { name:"メコン川", lat:8.6, lon:104.7, hint:"南シナ海" },
  { name:"マッケンジー川", lat:69.4, lon:-135.0, hint:"ボーフォート海" },
  { name:"ニジェール川", lat:4.8, lon:6.9, hint:"ギニア湾" },
  { name:"ヴォルガ川", lat:46.3, lon:48.0, hint:"カスピ海" },
  { name:"ザンベジ川", lat:-18.0, lon:36.5, hint:"インド洋" },
  { name:"ユーコン川", lat:62.6, lon:-164.4, hint:"ベーリング海" },
  { name:"リオグランデ川", lat:25.9, lon:-97.2, hint:"メキシコ湾" },
  { name:"シルダリア川", lat:45.4, lon:61.0, hint:"アラル海" },
  { name:"アムダリア川", lat:43.8, lon:59.0, hint:"アラル海" },
  { name:"ティグリス川", lat:30.9, lon:47.5, hint:"シャットゥルアラブ川経由ペルシャ湾" },
  { name:"ユーフラテス川", lat:30.9, lon:47.5, hint:"シャットゥルアラブ川経由ペルシャ湾" },
  { name:"ドナウ川", lat:45.2, lon:29.7, hint:"黒海" },
  { name:"コロラド川", lat:31.8, lon:-114.8, hint:"カリフォルニア湾" }
];
const EASY_RIVERS_NAMES = [
  "ナイル川","アマゾン川","長江","ミシシッピ川","黄河","ヴォルガ川","ドナウ川","メコン川","ザンベジ川","コロラド川"
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
const EASY_MOUNTAINS_PLATEAUS_NAMES = [
  "アルプス山脈","ヒマラヤ山脈","アンデス山脈","ロッキー山脈","ウラル山脈","アパラチア山脈","アトラス山脈","チベット高原"
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
const EASY_PLAINS_BASINS_NAMES = [
  "グレートプレーンズ","東ヨーロッパ平原","中央平原","アマゾン盆地","華北平原","ヒンドスタン平原","西シベリア低地","パンパ"
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
const EASY_OTHERS_NAMES = [
  "エッフェル塔","自由の女神","ギザの大ピラミッド","タージ・マハル","コロッセオ","サグラダ・ファミリア",
  "万里の長城","オペラハウス","マチュ・ピチュ","モン・サン＝ミシェル"
];

// ===== モード定義 =====
const MODE_LIST = [
  "オールイン",
  "レギュラーモード",
  "世界の国・都市",
  "世界の湖沼",
  "世界の大河",
  "世界の山脈・高原",
  "世界の平野・盆地",
  "その他"
];

// ===== バッジ定義 =====
const BADGES = [
  { id: "first_play", name: "初めての一歩", desc: "初めてゲームをプレイ", icon: "🎮", condition: (stats) => stats.totalGames >= 1 },
  { id: "perfect_game", name: "パーフェクト", desc: "1ゲームで全問正解", icon: "💯", condition: (stats) => stats.perfectGames >= 1 },
  { id: "answer_100", name: "百戦錬磨", desc: "累計100問解答", icon: "📚", condition: (stats) => stats.totalAnswered >= 100 },
  { id: "answer_500", name: "地理マニア", desc: "累計500問解答", icon: "🌍", condition: (stats) => stats.totalAnswered >= 500 },
  { id: "correct_50", name: "正解の達人", desc: "累計50問正解", icon: "✨", condition: (stats) => stats.totalCorrect >= 50 },
  { id: "correct_100", name: "地理博士", desc: "累計100問正解", icon: "🎓", condition: (stats) => stats.totalCorrect >= 100 },
  { id: "high_score_1000", name: "スコアマスター", desc: "1000点以上を達成", icon: "⭐", condition: (stats) => stats.highScore >= 1000 },
  { id: "high_score_1500", name: "スコアレジェンド", desc: "1500点以上を達成", icon: "🏆", condition: (stats) => stats.highScore >= 1500 },
  { id: "high_score_2000", name: "ガチ勢", desc: "2000点以上を達成", icon: "🔥", condition: (stats) => stats.highScore >= 2000 },
  { id: "high_score_3000", name: "神の領域", desc: "3000点以上を達成", icon: "👑", condition: (stats) => stats.highScore >= 3000 },
  { id: "high_score_4000", name: "セラ地理そのもの", desc: "4000点以上を達成", icon: "🌟", condition: (stats) => stats.highScore >= 4000 },
  { id: "accuracy_80", name: "高精度", desc: "正解率80%以上を達成", icon: "🎯", condition: (stats) => stats.totalAnswered >= 10 && (stats.totalCorrect / stats.totalAnswered) >= 0.8 },
  { id: "all_modes", name: "全モード制覇", desc: "全モードをプレイ", icon: "🌟", condition: (stats) => Object.keys(stats.modeStats || {}).length >= 8 },
  { id: "speed_demon", name: "スピードスター", desc: "平均解答速度3秒以下", icon: "⚡", condition: (stats) => stats.avgAnswerTime > 0 && stats.avgAnswerTime <= 3 },
  { id: "play_10", name: "常連プレイヤー", desc: "10回プレイ", icon: "🎪", condition: (stats) => stats.totalGames >= 10 },
  { id: "play_50", name: "ヘビープレイヤー", desc: "50回プレイ", icon: "🔥", condition: (stats) => stats.totalGames >= 50 },
];

// ===== 統計データ初期化 =====
function initStats() {
  return {
    totalGames: 0,
    totalAnswered: 0,
    totalCorrect: 0,
    highScore: 0,
    fastestTime: 0,
    perfectGames: 0,
    avgAnswerTime: 0,
    avgDistance: 0,
    modeStats: {},
    playHistory: []
  };
}

// ===== 統計データ読み込み =====
function loadStats() {
  try {
    const data = localStorage.getItem(STATS_KEY);
    return data ? JSON.parse(data) : initStats();
  } catch {
    return initStats();
  }
}

// ===== 統計データ保存 =====
function saveStats(stats) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch (e) {
    console.error("Failed to save stats:", e);
  }
}

// ===== 間違えた問題の読み込み =====
function loadWrongAnswers() {
  try {
    const data = localStorage.getItem(WRONG_ANSWERS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

// ===== 間違えた問題の保存 =====
function saveWrongAnswers(wrongAnswers) {
  try {
    // 最新100件まで保存
    const limited = wrongAnswers.slice(-100);
    localStorage.setItem(WRONG_ANSWERS_KEY, JSON.stringify(limited));
  } catch (e) {
    console.error("Failed to save wrong answers:", e);
  }
}

// ===== 獲得バッジの読み込み =====
function loadUnlockedBadges() {
  try {
    const data = localStorage.getItem(BADGES_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

// ===== 獲得バッジの保存 =====
function saveUnlockedBadges(badges) {
  try {
    localStorage.setItem(BADGES_KEY, JSON.stringify(badges));
  } catch (e) {
    console.error("Failed to save badges:", e);
  }
}

// ===== バッジチェック =====
function checkNewBadges(stats, unlockedBadges) {
  const newBadges = [];
  const unlockedIds = new Set(unlockedBadges.map(b => b.id));
  
  for (const badge of BADGES) {
    if (!unlockedIds.has(badge.id) && badge.condition(stats)) {
      newBadges.push(badge);
    }
  }
  
  return newBadges;
}

// ===== 称号判定（100点刻み・超詳細版） =====
function titleForScore(score){
  // 🟡 神ゾーン（セラ地理の先）
  if (score >= 4000) return "もう君がセラ地理";
  if (score >= 3500) return "地球の代弁者";
  if (score >= 3000) return "人間GPS";
  
  // 🔴 ガチ勢ゾーン（ここから面白くなる）
  if (score >= 2800) return "もはや地球";
  if (score >= 2600) return "地図帳をおかずに白飯３杯たべます。";
  if (score >= 2400) return "プレートの動きを妄想して寝てます。";
  if (score >= 2200) return "偏西風の気持ちがわかる";
  if (score >= 2000) return "等高線でダンスする系人間";
  
  // 🟣 上級者ゾーン（クセ強）
  if (score >= 1900) return "国境にロマン感じる民";
  if (score >= 1800) return "衛星写真で場所当てられます。";
  if (score >= 1700) return "歩く地球儀";
  if (score >= 1600) return "地形でテンション上がるヤツ";
  if (score >= 1500) return "グーグルアース中毒者";
  
  // 🔵 中級者ゾーン（リアル寄り）
  if (score >= 1400) return "グーグルマップ信者";
  if (score >= 1300) return "旅行で無駄に地図見るタイプ";
  if (score >= 1200) return "地図帳持ち歩いてますけどなにか。";
  if (score >= 1100) return "都道府県は全部言えますよ。";
  if (score >= 1000) return "方角くらいならわかります。";
  
  // 🟢 初心者ゾーン（ネタ強め）
  if (score >= 750)  return "地図帳は鍋敷きにしてます。";
  if (score >= 500)  return "地図帳は観賞用で置いてます。";
  if (score >= 250)  return "地理は寝てました。";
  
  return "方角方向オンチ";
}

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

  if (mode === "レギュラーモード") {
    const easy = [
      ...pickByNames(COUNTRIES_CITIES, EASY_COUNTRIES_CITIES_NAMES),
      ...pickByNames(LAKES, EASY_LAKES_NAMES),
      ...pickByNames(RIVERS, EASY_RIVERS_NAMES),
      ...pickByNames(MOUNTAINS_PLATEAUS, EASY_MOUNTAINS_PLATEAUS_NAMES),
      ...pickByNames(PLAINS_BASINS, EASY_PLAINS_BASINS_NAMES),
      ...pickByNames(OTHERS, EASY_OTHERS_NAMES),
    ];
    return normalize(easy);
  }

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

  // 統計とバッジ
  const [showStats, setShowStats] = useState(false);
  const [stats, setStats] = useState(() => loadStats());
  const [unlockedBadges, setUnlockedBadges] = useState(() => loadUnlockedBadges());
  const [wrongAnswers, setWrongAnswers] = useState(() => loadWrongAnswers());
  const [newBadges, setNewBadges] = useState([]);
  const [gameStartTime, setGameStartTime] = useState(null);

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
    setGameStartTime(Date.now());
    // BGMは useEffect(started/musicOn) で開始
    const first = newOrder[0];
    if (first) focusOn(first.coord);
  }

  function endGame() {
    setStarted(false);
    setGameOver(true);
    
    // 統計更新
    const gameTime = gameStartTime ? (Date.now() - gameStartTime) / 1000 : params.dur;
    const newStats = { ...stats };
    newStats.totalGames = (newStats.totalGames || 0) + 1;
    newStats.totalAnswered = (newStats.totalAnswered || 0) + answered;
    newStats.totalCorrect = (newStats.totalCorrect || 0) + correct;
    newStats.highScore = Math.max(newStats.highScore || 0, score);
    
    // パーフェクトゲーム判定
    if (answered > 0 && correct === answered) {
      newStats.perfectGames = (newStats.perfectGames || 0) + 1;
    }
    
    // 平均解答時間
    if (answered > 0) {
      const avgTime = gameTime / answered;
      newStats.avgAnswerTime = newStats.totalAnswered > answered 
        ? (newStats.avgAnswerTime * (newStats.totalAnswered - answered) + avgTime * answered) / newStats.totalAnswered
        : avgTime;
    }
    
    // モード別統計
    if (!newStats.modeStats) newStats.modeStats = {};
    if (!newStats.modeStats[selectedMode]) {
      newStats.modeStats[selectedMode] = { games: 0, answered: 0, correct: 0, highScore: 0 };
    }
    newStats.modeStats[selectedMode].games += 1;
    newStats.modeStats[selectedMode].answered += answered;
    newStats.modeStats[selectedMode].correct += correct;
    newStats.modeStats[selectedMode].highScore = Math.max(newStats.modeStats[selectedMode].highScore, score);
    
    // プレイ履歴（最新20件）
    if (!newStats.playHistory) newStats.playHistory = [];
    newStats.playHistory.push({
      date: new Date().toISOString(),
      mode: selectedMode,
      score,
      correct,
      answered,
      time: gameTime
    });
    newStats.playHistory = newStats.playHistory.slice(-20);
    
    setStats(newStats);
    saveStats(newStats);
    
    // バッジチェック
    const newlyUnlocked = checkNewBadges(newStats, unlockedBadges);
    if (newlyUnlocked.length > 0) {
      const updated = [...unlockedBadges, ...newlyUnlocked];
      setUnlockedBadges(updated);
      saveUnlockedBadges(updated);
      setNewBadges(newlyUnlocked);
    }
    
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
    // ポイント計算（最大300点、距離に応じて減少）
    const gained = Math.max(0, Math.round(300 - distKm * 0.5)); // 0〜300（近いほど高得点）
    setScore(s => s + gained);
    setAnswered(n => n + 1);
    if (ok) setCorrect(n => n + 1);
    setResult({ distKm, correct: ok, gained, qId: current.id });

    // 不正解の場合は履歴に追加
    if (!ok && current) {
      const newWrong = [...wrongAnswers, {
        name: current.name,
        hint: current.hint,
        coord: current.coord,
        mode: selectedMode,
        distKm,
        date: new Date().toISOString()
      }];
      setWrongAnswers(newWrong);
      saveWrongAnswers(newWrong);
    }

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
  const globeHeight = "calc(100svh - 120px)"; // ヘッダーとボトムバーを除いた高さ

  return (
    <div style={{
      minHeight: "100svh",
      color: "#e5f2ff",
      backgroundColor: "#000",
      fontFamily: "'Noto Sans JP', sans-serif",
      backgroundImage:
        "radial-gradient(1px 1px at 20% 30%, rgba(147,197,253,.9) 50%, transparent 51%),"+
        "radial-gradient(1px 1px at 40% 70%, rgba(196,181,253,.8) 50%, transparent 51%),"+
        "radial-gradient(2px 2px at 80% 20%, rgba(165,180,252,1) 50%, transparent 51%),"+
        "radial-gradient(2px 2px at 60% 50%, rgba(134,239,172,.7) 50%, transparent 51%),"+
        "radial-gradient(1px 1px at 10% 80%, rgba(251,207,232,.8) 50%, transparent 51%),"+
        "radial-gradient(1px 1px at 90% 60%, rgba(253,224,71,.7) 50%, transparent 51%),"+
        "radial-gradient(ellipse at 50% 120%, #0f172a 0%, #000 70%)",
      paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)"
    }}>
      <style>{`
        @keyframes popIn { 0%{transform:scale(.8);opacity:0} 40%{opacity:1} 70%{transform:scale(1.06)} 100%{transform:scale(1)} }
        @keyframes shimmer { 0%{background-position:-200% center} 100%{background-position:200% center} }
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
        @keyframes glow { 0%,100%{text-shadow:0 0 20px rgba(96,165,250,.6), 0 0 40px rgba(139,92,246,.4)} 50%{text-shadow:0 0 30px rgba(96,165,250,.8), 0 0 60px rgba(139,92,246,.6)} }
        .hide-on-mobile { display: none; }
        @media (min-width: 700px){ .hide-on-mobile { display: inline-flex; } }
        .mode-grid { display:grid; gap:8px; grid-template-columns: repeat(auto-fit,minmax(140px,1fr)); }
        @media (min-width: 700px){ .mode-grid { gap:14px; grid-template-columns: repeat(auto-fit,minmax(200px,1fr)); } }
        .mode-btn { 
          font-weight:700; padding:12px 14px; border-radius:16px; font-size: 14px;
          background: linear-gradient(135deg, rgba(99,102,241,.85) 0%, rgba(139,92,246,.85) 100%);
          color:#fff; border:2px solid rgba(167,139,250,.4); 
          backdrop-filter: blur(10px); 
          box-shadow:0 8px 20px rgba(99,102,241,.3), inset 0 1px 0 rgba(255,255,255,.2);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          cursor: pointer;
          position: relative;
          overflow: hidden;
        }
        @media (min-width: 700px){ .mode-btn { padding:16px 20px; border-radius:20px; font-size: 16px; } }
        .mode-btn::before {
          content: '';
          position: absolute;
          top: 0; left: -100%;
          width: 100%; height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.3), transparent);
          transition: left 0.5s;
        }
        .mode-btn:hover::before { left: 100%; }
        .mode-btn:hover { 
          transform: translateY(-3px) scale(1.02); 
          box-shadow:0 15px 35px rgba(99,102,241,.5), inset 0 1px 0 rgba(255,255,255,.3);
          border-color: rgba(167,139,250,.7);
        }
        .mode-btn:active { transform: translateY(-1px) scale(0.98); }
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
          <img src={`${import.meta.env.BASE_URL}sera-geo-earth-logo.png`} alt="セラ地理アース" style={{ height: 40, width: "auto", filter: "drop-shadow(0 2px 8px rgba(96,165,250,.4))" }} />
          <div className="hide-on-mobile" style={{ fontSize: 13, color: "#e0e7ff", fontWeight: 500 }}>
            正解: <b style={{color:"#86efac"}}>{correct}</b> / 解答: <b style={{color:"#93c5fd"}}>{answered}</b> ／ 残り <b style={{color:"#fbbf24"}}>{started ? timeLeft : params.dur}s</b> ／ モード：<b style={{color:"#c4b5fd"}}>{selectedMode}</b>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => setShowStats(true)} style={btn()} title="統計とバッジ">📊</button>
          <button onClick={() => setMusicOn(v => !v)} style={btn()}>音楽: {musicOn ? "ON" : "OFF"}</button>
          <input className="hide-on-mobile" title="音量" type="range" min={0} max={1} step={0.01} value={volume} onChange={(e)=>setVolume(Number(e.target.value))} style={{width: 80}} />
          <button onClick={handleShare} style={btn()}>共有</button>
        </div>
      </header>

      {/* ====== Main ====== */}
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "4px 8px", paddingBottom: `${bottomH + 8}px` }}>
        <div style={{ position:"relative", height: globeHeight, borderRadius: 16, overflow: "hidden" }}>
          {/* スタート前の中央タイトル・モード選択オーバーレイ */}
          {!started && !gameOver && (
            <div style={{
              position: "absolute", inset: 0, zIndex: 9,
              display: "flex", alignItems: "center", justifyContent: "center",
              textAlign: "center"
            }}>
              <div style={{ pointerEvents:"auto", maxWidth: 880, width: "92%" }}>
                <div style={{ marginBottom: "clamp(12px, 3vw, 20px)", display: "flex", justifyContent: "center" }}>
                  <img src={`${import.meta.env.BASE_URL}sera-geo-earth-logo.png`} alt="セラ地理アース" style={{ 
                    maxWidth: "min(600px, 90vw)", 
                    height: "auto",
                    filter: "drop-shadow(0 8px 24px rgba(96,165,250,.6)) drop-shadow(0 0 40px rgba(139,92,246,.4))",
                    animation: "float 3s ease-in-out infinite"
                  }} />
                </div>
                <div style={{ 
                  fontSize: "clamp(11px, 2vw, 14px)", 
                  color: "#cbd5e1", 
                  textAlign: "center", 
                  marginBottom: "clamp(10px, 2.5vw, 16px)",
                  opacity: 0.7,
                  fontWeight: 500
                }}>モードを選択</div>
                <div className="mode-grid">
                  {MODE_LIST.map(mode => (
                    <button key={mode} onClick={() => selectMode(mode)} className="mode-btn">{mode}</button>
                  ))}
                </div>
                <div style={{ marginTop:"clamp(8px, 2vw, 16px)", color:"#e0e7ff", fontSize: "clamp(12px, 2.5vw, 15px)", fontWeight: 500 }}>
                  選択後、下の「スタート」でゲーム開始！
                </div>
                <div style={{ 
                  marginTop: "clamp(12px, 3vw, 20px)", 
                  fontSize: "clamp(10px, 1.8vw, 12px)", 
                  color: "#64748b", 
                  textAlign: "center",
                  opacity: 0.6,
                  fontWeight: 400
                }}>
                  ver 2.51
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
                maxWidth: '90%', 
                background: 'linear-gradient(135deg, rgba(99,102,241,.75) 0%, rgba(139,92,246,.75) 100%)', 
                color: '#fff',
                padding: '10px 16px', borderRadius: 16, backdropFilter: 'blur(12px)',
                boxShadow: '0 8px 20px rgba(99,102,241,.4), inset 0 1px 0 rgba(255,255,255,.2)',
                border: '1px solid rgba(167,139,250,.3)'
              }}>
                <div style={{ fontWeight: 700, fontSize: 19, textAlign: 'center', textShadow: '0 2px 6px rgba(0,0,0,.4)', letterSpacing: '0.5px' }}>
                  問題：{current?.name}
                </div>
                <div style={{ fontSize: 13, opacity: .95, textAlign: 'center', marginTop: 4, color: '#e0e7ff' }}>
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
                fontSize: 72, fontWeight: 900, color: '#fff',
                WebkitTextStroke: `2px ${result.correct ? '#10b981' : '#f43f5e'}`,
                textShadow: result.correct
                  ? "0 0 25px rgba(16,185,129,.8), 0 0 50px rgba(16,185,129,.5), 0 0 75px rgba(16,185,129,.3)"
                  : "0 0 25px rgba(244,63,94,.8), 0 0 50px rgba(244,63,94,.5), 0 0 75px rgba(244,63,94,.3)",
                animation: 'popIn .5s ease-out both',
                filter: 'drop-shadow(0 4px 12px rgba(0,0,0,.6))'
              }}>{result.correct ? "正解！" : "不正解！"}</div>
            </div>
          )}

          {/* タイムアップの巨大スコア表示 + モード選択ボタン */}
          {gameOver && (
            <div style={{ position:'absolute', inset:0, zIndex: 12,
              display:'flex', alignItems:'center', justifyContent:'center',
              background:'radial-gradient(closest-side, rgba(15,23,42,.7), rgba(15,23,42,.3), transparent)',
              backdropFilter: 'blur(8px)' }}>
              <div style={{ textAlign:'center', background: 'rgba(15,23,42,.85)', padding: '32px', borderRadius: '24px', backdropFilter: 'blur(12px)', border: '2px solid rgba(139,92,246,.3)', boxShadow: '0 20px 50px rgba(0,0,0,.6)' }}>
                <div style={{ color:'#fbbf24', fontSize:20, marginBottom:10, fontWeight: 700, letterSpacing: '2px' }}>TIME UP!</div>
                <div style={{
                  fontFamily: "'Orbitron', 'Noto Sans JP', sans-serif",
                  fontSize: 72, fontWeight: 900,
                  background: "linear-gradient(135deg, #60a5fa 0%, #a78bfa 50%, #f472b6 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  filter: "drop-shadow(0 4px 12px rgba(96,165,250,.6))"
                }}>
                  SCORE: {score}
                </div>
                <div style={{ color:'#e0e7ff', marginTop:12, fontSize:18, fontWeight: 600 }}>
                  あなたは <b style={{color:'#fbbf24'}}>{titleForScore(score)}</b> です
                </div>
                <div style={{ color:'#cbd5e1', marginTop:10, fontSize:15 }}>
                  正解 <b style={{color:'#86efac'}}>{correct}</b>／解答 <b style={{color:'#93c5fd'}}>{answered}</b>
                </div>

                {/* トップ3 */}
                {top3.length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontWeight: 800, marginBottom: 6 }}>🏆 あなたのトップ3</div>
                    <ol style={{ margin: 0, paddingLeft: 18 }}>
                      {top3.map((s, i) => <li key={i}>{s}</li>)}
                    </ol>
                    <div style={{ marginTop:8 }}>
                      あなたの称号: <b>{titleForScore(score)}</b>（{selectedMode}）
                    </div>
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
            htmlElementsData={points}
            htmlElement={(d) => {
              const el = document.createElement('div');
              el.style.cssText = `
                width: 40px;
                height: 40px;
                position: relative;
                pointer-events: none;
                transform: translate(-50%, -50%);
              `;
              // 二重丸を描画
              const outerRing = document.createElement('div');
              outerRing.style.cssText = `
                position: absolute;
                width: 100%;
                height: 100%;
                border-radius: 50%;
                border: 3px solid ${d.color};
                opacity: 0.8;
                box-sizing: border-box;
              `;
              const innerRing = document.createElement('div');
              innerRing.style.cssText = `
                position: absolute;
                width: 60%;
                height: 60%;
                top: 20%;
                left: 20%;
                border-radius: 50%;
                border: 2px solid ${d.color};
                opacity: 1.0;
                box-sizing: border-box;
              `;
              el.appendChild(outerRing);
              el.appendChild(innerRing);
              return el;
            }}
            htmlAltitude={() => 0.01}
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
            <div style={{ marginTop:6, fontSize:14 }}>あなたは <b>{titleForScore(score)}</b> です</div>
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
            {answered > 0 && (
              <div style={{ marginTop:8 }}>
                あなたの称号: <b>{titleForScore(score)}</b>（{selectedMode}）
              </div>
            )}
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

      {/* ====== 統計・バッジモーダル ====== */}
      {showStats && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,.85)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16, overflowY: 'auto'
        }} onClick={() => setShowStats(false)}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(15,23,42,.95) 0%, rgba(17,24,39,.95) 100%)',
            borderRadius: 24, padding: 24, maxWidth: 800, width: '100%',
            maxHeight: '90vh', overflowY: 'auto',
            border: '2px solid rgba(139,92,246,.3)',
            boxShadow: '0 25px 50px rgba(0,0,0,.6)'
          }} onClick={(e) => e.stopPropagation()}>
            
            {/* ヘッダー */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{
                fontSize: 28, fontWeight: 900, margin: 0,
                background: 'linear-gradient(135deg, #60a5fa 0%, #a78bfa 50%, #f472b6 100%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}>📊 統計とバッジ</h2>
              <button onClick={() => setShowStats(false)} style={{
                ...btn(), padding: '8px 16px', fontSize: 20
              }}>✕</button>
            </div>

            {/* 新バッジ通知 */}
            {newBadges.length > 0 && (
              <div style={{
                background: 'linear-gradient(135deg, rgba(16,185,129,.2) 0%, rgba(5,150,105,.2) 100%)',
                border: '2px solid rgba(16,185,129,.5)',
                borderRadius: 16, padding: 16, marginBottom: 20,
                animation: 'popIn 0.5s ease-out'
              }}>
                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: '#86efac' }}>
                  🎉 新しいバッジを獲得！
                </div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {newBadges.map(badge => (
                    <div key={badge.id} style={{
                      background: 'rgba(255,255,255,.1)', borderRadius: 12, padding: '8px 12px',
                      display: 'flex', alignItems: 'center', gap: 8
                    }}>
                      <span style={{ fontSize: 24 }}>{badge.icon}</span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{badge.name}</div>
                        <div style={{ fontSize: 11, opacity: 0.8 }}>{badge.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={() => setNewBadges([])} style={{
                  ...primaryBtn(), marginTop: 12, padding: '6px 12px', fontSize: 13
                }}>確認</button>
              </div>
            )}

            {/* 全体統計 */}
            <div style={{
              background: 'rgba(99,102,241,.1)', borderRadius: 16, padding: 20, marginBottom: 20,
              border: '1px solid rgba(99,102,241,.3)'
            }}>
              <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, color: '#c4b5fd' }}>
                📈 全体統計
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16 }}>
                <StatCard label="プレイ回数" value={stats.totalGames || 0} icon="🎮" />
                <StatCard label="総解答数" value={stats.totalAnswered || 0} icon="📝" />
                <StatCard label="総正解数" value={stats.totalCorrect || 0} icon="✅" />
                <StatCard label="最高スコア" value={stats.highScore || 0} icon="⭐" />
                <StatCard label="正解率" value={stats.totalAnswered > 0 ? `${((stats.totalCorrect / stats.totalAnswered) * 100).toFixed(1)}%` : "0%"} icon="🎯" />
                <StatCard label="パーフェクト" value={stats.perfectGames || 0} icon="💯" />
              </div>
            </div>

            {/* バッジ一覧 */}
            <div style={{
              background: 'rgba(139,92,246,.1)', borderRadius: 16, padding: 20, marginBottom: 20,
              border: '1px solid rgba(139,92,246,.3)'
            }}>
              <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, color: '#c4b5fd' }}>
                🏆 バッジコレクション ({unlockedBadges.length}/{BADGES.length})
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
                {BADGES.map(badge => {
                  const unlocked = unlockedBadges.find(b => b.id === badge.id);
                  return (
                    <div key={badge.id} style={{
                      background: unlocked ? 'rgba(255,255,255,.15)' : 'rgba(255,255,255,.05)',
                      borderRadius: 12, padding: 12, textAlign: 'center',
                      border: unlocked ? '2px solid rgba(251,191,36,.5)' : '1px solid rgba(255,255,255,.1)',
                      opacity: unlocked ? 1 : 0.5,
                      transition: 'all 0.3s'
                    }}>
                      <div style={{ fontSize: 32, marginBottom: 4 }}>{badge.icon}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{badge.name}</div>
                      <div style={{ fontSize: 10, opacity: 0.8, lineHeight: 1.3 }}>{badge.desc}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* モード別統計 */}
            {stats.modeStats && Object.keys(stats.modeStats).length > 0 && (
              <div style={{
                background: 'rgba(96,165,250,.1)', borderRadius: 16, padding: 20, marginBottom: 20,
                border: '1px solid rgba(96,165,250,.3)'
              }}>
                <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, color: '#93c5fd' }}>
                  🎯 モード別統計
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {Object.entries(stats.modeStats).map(([mode, data]) => (
                    <div key={mode} style={{
                      background: 'rgba(255,255,255,.05)', borderRadius: 12, padding: 12,
                      border: '1px solid rgba(255,255,255,.1)'
                    }}>
                      <div style={{ fontWeight: 700, marginBottom: 8, color: '#e0e7ff' }}>{mode}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8, fontSize: 13 }}>
                        <div>プレイ: <b style={{color:'#93c5fd'}}>{data.games}</b></div>
                        <div>解答: <b style={{color:'#93c5fd'}}>{data.answered}</b></div>
                        <div>正解: <b style={{color:'#86efac'}}>{data.correct}</b></div>
                        <div>正解率: <b style={{color:'#fbbf24'}}>{data.answered > 0 ? `${((data.correct / data.answered) * 100).toFixed(1)}%` : '0%'}</b></div>
                        <div>最高: <b style={{color:'#f472b6'}}>{data.highScore}</b></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 間違えた問題 */}
            {wrongAnswers.length > 0 && (
              <div style={{
                background: 'rgba(244,63,94,.1)', borderRadius: 16, padding: 20,
                border: '1px solid rgba(244,63,94,.3)'
              }}>
                <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, color: '#fca5a5' }}>
                  ❌ 間違えた問題 (最新{Math.min(wrongAnswers.length, 20)}件)
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
                  {wrongAnswers.slice(-20).reverse().map((wrong, idx) => (
                    <div key={idx} style={{
                      background: 'rgba(255,255,255,.05)', borderRadius: 8, padding: 10,
                      border: '1px solid rgba(255,255,255,.1)', fontSize: 13
                    }}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>{wrong.name}</div>
                      <div style={{ opacity: 0.8, fontSize: 11 }}>
                        ヒント: {wrong.hint} | モード: {wrong.mode} | 距離: {wrong.distKm}km
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={() => {
                  if (confirm('間違えた問題の履歴を削除しますか？')) {
                    setWrongAnswers([]);
                    saveWrongAnswers([]);
                  }
                }} style={{
                  ...btn(), marginTop: 12, padding: '6px 12px', fontSize: 13
                }}>履歴をクリア</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ===== StatCard Component =====
function StatCard({ label, value, icon }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,.1)', borderRadius: 12, padding: 12,
      border: '1px solid rgba(255,255,255,.15)', textAlign: 'center'
    }}>
      <div style={{ fontSize: 24, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 2, color: '#fff' }}>{value}</div>
      <div style={{ fontSize: 11, opacity: 0.8 }}>{label}</div>
    </div>
  );
}

// ===== styles helpers =====
function btn(){ return { padding:"10px 16px", borderRadius:14, background:"linear-gradient(135deg, rgba(71,85,105,.9) 0%, rgba(51,65,85,.9) 100%)", color:'#fff', border:"1px solid rgba(148,163,184,.3)", boxShadow:"0 4px 12px rgba(0,0,0,.4)", fontWeight: 600, transition: 'all 0.2s', cursor: 'pointer' }; }
function primaryBtn(){ return { padding:"10px 20px", borderRadius:14, background:"linear-gradient(135deg, #10b981 0%, #059669 100%)", color:"#fff", border:"1px solid #059669", boxShadow:"0 4px 16px rgba(16,185,129,.4), inset 0 1px 0 rgba(255,255,255,.2)", fontWeight: 700, transition: 'all 0.2s', cursor: 'pointer' }; }

// ===== optional exports =====
export { haversineKm, seededShuffle, buildShareUrl };

// ===== lightweight self tests (console) =====
function __selfTests(){
  try {
    const d = Math.round(haversineKm([0,0],[0,1]));
    console.assert(Math.abs(d - 111) <= 2, "haversineKm ~111km per 1° lon at equator, got", d);
    const url = buildShareUrl({seed:1,dur:60,km:400,music:'on',mode:'オールイン'});
    console.assert(url.includes('seed=1') && url.includes('dur=60') && url.includes('km=400') && url.includes('music=on') && url.includes('mode=%E3%82%AA%E3%83%BC%E3%83%AB%E3%82%A4%E3%83%B3'), 'buildShareUrl encodes params');
    console.assert(titleForScore(0)==='方角方向オンチ' && titleForScore(250)==='地理は寝てた勢' && titleForScore(500)==='地図帳は観賞用' && titleForScore(750)==='夢の中で世界一周' && titleForScore(1000)==='いつも地図帳持ち歩いてる人' && titleForScore(1250)==='グーグルアース中毒者' && titleForScore(1500)==='歩く地球儀', 'titleForScore ladder ok');
  } catch(e){ console.warn('self tests error', e); }
}
if (typeof window !== 'undefined') { setTimeout(__selfTests, 0); }
