// src/App.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import Globe from "react-globe.gl";
import * as THREE from "three";

/* ================= 設定 ================= */
const BEFORE_START_AUTO_ROTATE = true;   // スタート前は自動回転ON
const IN_GAME_AUTO_ROTATE     = false;   // ゲーム中は自動回転OFF
const AUTO_FOCUS_WRONG_ONLY   = true;    // 不正解のときだけ正解地点へ寄せる
const PAUSE_BEFORE_NEXT_MS    = 1000;    // 次の問題へ行くまでの停止

// BGM / 効果音（public配下）。?song= / ?ok= / ?ng= で上書き可能
const DEFAULT_MUSIC_URL  = "/sera-geo.mp3";
const DEFAULT_OK_SFX_URL = "/correct.mp3";
const DEFAULT_NG_SFX_URL = "/wrong.mp3";

/* ================ ユーティリティ ================ */
const toRad = (d) => (d * Math.PI) / 180;
const haversineKm = ([a, b], [c, d]) => {
  const R = 6371, dLat = toRad(c - a), dLon = toRad(d - b);
  const x = Math.sin(dLat/2)**2 + Math.cos(toRad(a))*Math.cos(toRad(c))*Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(x));
};
const xmur3 = (str) => { let h = 1779033703 ^ str.length;
  for (let i=0;i<str.length;i++){ h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h<<13)|(h>>>19); }
  return () => { h = Math.imul(h ^ (h>>>16), 2246822507); h = Math.imul(h ^ (h>>>13), 3266489909); h ^= h>>>16; return h>>>0; };
};
const mulberry32 = (a) => () => { let t=(a+=0x6d2b79f5); t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return ((t^(t>>>14))>>>0)/4294967296; };
const seededShuffle = (arr, seedStr="default") => { const seed=xmur3(seedStr)(), r=mulberry32(seed); const a=arr.slice();
  for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a; };
const qs = () => new URLSearchParams(typeof window!=="undefined"?window.location.search:"");
const musicUrl = () => qs().get("song") || DEFAULT_MUSIC_URL;
const okSfxUrl = () => qs().get("ok")   || DEFAULT_OK_SFX_URL;
const ngSfxUrl = () => qs().get("ng")   || DEFAULT_NG_SFX_URL;

/* ================ 問題データ ================ */
// …（前回と同じ RAW 配列。長いので省略せず使ってね）
const RAW = [
  { name: "ニューヨーク", lat: 40.7128, lon: -74.006, hint: "都市・アメリカ" },
  { name: "東京", lat: 35.6762, lon: 139.6503, hint: "日本の首都" },
  { name: "ロンドン", lat: 51.5074, lon: -0.1278, hint: "イギリスの首都" },
  { name: "サンフランシスコ", lat: 37.7749, lon: -122.4194, hint: "都市・アメリカ西海岸" },
  { name: "シンガポール", lat: 1.3521, lon: 103.8198, hint: "都市国家・東南アジア" },
  { name: "イスタンブール", lat: 41.0082, lon: 28.9784, hint: "都市・トルコ（欧亜境界）" },
  { name: "ドバイ", lat: 25.276987, lon: 55.296249, hint: "都市・UAE" },
  { name: "エッフェル塔", lat: 48.8584, lon: 2.2945, hint: "ランドマーク・パリ" },
  { name: "自由の女神", lat: 40.6892, lon: -74.0445, hint: "ランドマーク・NY" },
  // …（省略せず既存の全リストをここに貼ってください）
  { name: "ナスカの地上絵", lat: -14.739, lon: -75.13, hint: "ペルー・地上絵" }
];
const QUESTIONS = RAW.map((r,i)=>({ id:i+1, name:r.name, hint:r.hint||"", coord:[r.lat,r.lon] }));

/* ================ App ================ */
export default function App() {
  const globeRef = useRef();

  // BGM & 効果音
  const bgmRef = useRef(null);
  const okRef  = useRef(null);
  const ngRef  = useRef(null);

  const params = (() => {
    const p = qs();
    return {
      seed: p.get("seed") || null,
      dur : Math.max(10, Math.min(600, Number(p.get("dur") || 60))),
      km  : Math.max(10, Math.min(2000, Number(p.get("km") || 300))),
      music: p.get("music") || "on"
    };
  })();

  const [musicOn, setMusicOn] = useState(params.music !== "off");
  const [volume, setVolume]   = useState(0.5);
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
  const [showFinal, setShowFinal] = useState(false);

  const current = order[qIndex % order.length];

  // iOSオーディオ解錠（BGM & 効果音すべて）
  const triedUnlockRef = useRef(false);
  const unlockOne = async (el) => {
    if (!el) return false;
    try { const m=el.muted; el.muted=true; await el.play(); el.pause(); el.muted=m; return true; } catch { return false; }
  };
  useEffect(() => {
    if (triedUnlockRef.current) return;
    const handler = async () => {
      triedUnlockRef.current = true;
      await Promise.all([unlockOne(bgmRef.current), unlockOne(okRef.current), unlockOne(ngRef.current)]);
      document.removeEventListener("pointerdown", handler);
      document.removeEventListener("touchstart", handler);
    };
    document.addEventListener("pointerdown", handler, { once:true });
    document.addEventListener("touchstart", handler, { once:true });
    return () => {
      document.removeEventListener("pointerdown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, []);

  // 音量・再生制御（BGM）
  useEffect(() => {
    const el = bgmRef.current;
    if (!el) return;
    el.volume = Math.max(0, Math.min(1, volume));
    if (started && musicOn) {
      el.play().catch(() => setAudioErr("自動再生がブロックされました。「音を有効にする」を押してください。"));
    } else {
      el.pause();
    }
  }, [started, musicOn, volume]);

  // 効果音再生
  const playOk = () => { const el = okRef.current; if (!el) return; el.currentTime = 0; el.play().catch(()=>{}); };
  const playNg = () => { const el = ngRef.current; if (!el) return; el.currentTime = 0; el.play().catch(()=>{}); };

  // タイマー
  useEffect(() => {
    if (!started) return;
    if (timeLeft <= 0) {
      setStarted(false);
      setShowFinal(true);
      applyAutoRotate(BEFORE_START_AUTO_ROTATE);
      return;
    }
    const t = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearTimeout(t);
  }, [started, timeLeft]);

  // 自動回転
  const applyAutoRotate = (on) => {
    const c = globeRef.current?.controls?.();
    if (c) { c.autoRotate = !!on; c.autoRotateSpeed = 0.5; }
  };
  useEffect(() => { applyAutoRotate(BEFORE_START_AUTO_ROTATE); }, []);

  // カメラ
  const focusOn = ([lat, lon], dur=800, alt=1.8) => {
    const g = globeRef.current; if (!g) return;
    const doSet = () => g.pointOfView({ lat, lng: lon, altitude: alt }, dur);
    g.pointOfView ? doSet() : setTimeout(doSet, 50);
  };

  // スタート
  const startGame = () => {
    const bgm = bgmRef.current;
    if (bgm) {
      bgm.src = musicUrl();
      bgm.load();
      if (musicOn) { bgm.currentTime = 0; bgm.play().catch(()=>setAudioErr("自動再生がブロックされました。")); }
    }
    // 効果音も読み込み
    okRef.current?.load();
    ngRef.current?.load();

    const seed = params.seed || `${Date.now()}`;
    const newOrder = seededShuffle(QUESTIONS, seed);
    setOrder(newOrder);
    setStarted(true);
    setShowFinal(false);
    setTimeLeft(params.dur);
    setScore(0); setAnswered(0); setCorrect(0);
    setQIndex(0); setGuess(null); setResult(null);
    applyAutoRotate(IN_GAME_AUTO_ROTATE);
  };

  // 次の問題
  const nextQuestion = () => {
    setGuess(null);
    setResult(null);
    setQIndex((i) => i + 1);
  };

  // 評価（SFX付き）
  const evaluate = (finalGuess) => {
    const distKm = finalGuess ? Math.round(haversineKm(finalGuess, current.coord)) : 20000;
    const ok = distKm <= (params.km || 300);
    const gained = Math.max(0, Math.round(250 - distKm));

    setScore((s) => s + gained);
    setAnswered((n) => n + 1);
    if (ok) setCorrect((n) => n + 1);

    setResult({ distKm, correct: ok, gained, qId: current.id });

    // 効果音
    ok ? playOk() : playNg();

    if (!ok && AUTO_FOCUS_WRONG_ONLY) focusOn(current.coord, 800, 1.8);

    setTimeout(nextQuestion, PAUSE_BEFORE_NEXT_MS);
  };

  const handleGlobeClick = ({ lat, lng }) => {
    if (!started) return;
    setGuess([lat, lng]);
    evaluate([lat, lng]);
  };

  // レイヤ
  const points = useMemo(() => {
    if (!result || result.qId !== current.id) return [];
    return [{ name: result.correct ? "正解" : "不正解", color: result.correct ? "#22C55E" : "#EF4444",
      lat: current.coord[0], lng: current.coord[1] }];
  }, [result, current]);

  const arcs = useMemo(() => {
    if (!result || !guess || result.qId !== current.id) return [];
    return [{ startLat: guess[0], startLng: guess[1], endLat: current.coord[0], endLng: current.coord[1] }];
  }, [guess, result, current]);

  // テクスチャ
  const earthDay  = "https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg";
  const earthBump = "https://unpkg.com/three-globe/example/img/earth-topology.png";
  const globeMat  = useMemo(() => new THREE.MeshPhongMaterial({ color: 0x87b5e5, specular: 0x333333, shininess: 5 }), []);

  // CSS（中央タイトル＆safe area対応）
  const css = `
    :root{--safe-top:env(safe-area-inset-top,0px);--safe-bottom:env(safe-area-inset-bottom,0px)}
    *{box-sizing:border-box} html,body,#root{height:100%}
    body{margin:0;background:#000;color:#e5f2ff;font-family:system-ui,-apple-system,Segoe UI,Roboto,Hiragino Kaku Gothic ProN,Meiryo,sans-serif}
    .container{max-width:1120px;margin:0 auto;padding:12px}
    .toolbar{position:sticky;top:0;z-index:20;display:flex;gap:8px;align-items:center;justify-content:space-between;padding:8px 4px;background:rgba(0,0,0,.4);backdrop-filter:blur(8px)}
    .title{margin:0;font-weight:900;letter-spacing:.2px;font-size:28px;text-shadow:0 2px 6px rgba(0,0,0,.6);-webkit-text-stroke:.6px rgba(0,0,0,.6)}
    .chip{padding:6px 10px;border-radius:12px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);color:#fff}
    .btn{padding:8px 12px;border-radius:12px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);color:#fff}
    .btnp{background:#16a34a;border-color:#16a34a}
    .globe{position:relative;height:min(70vh,78vw);border-radius:16px;overflow:hidden}
    .q-banner{position:absolute;left:8px;right:8px;top:calc(var(--safe-top) + 8px);display:flex;justify-content:center;z-index:10;pointer-events:none}
    .qbox{max-width:92%;background:rgba(0,0,0,.45);color:#fff;padding:8px 12px;border-radius:12px;backdrop-filter:blur(2px)}
    .center-title{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:9;pointer-events:none}
    .center-box{text-align:center}
    .ct1{font-weight:900;font-size:clamp(32px,10vw,72px);color:#fff;-webkit-text-stroke:2px #000;text-shadow:0 3px 8px rgba(0,0,0,.8)}
    .ct2{color:#cbd5e1;margin-top:6px}
    .flash{position:absolute;inset:0;z-index:11;display:flex;align-items:center;justify-content:center;pointer-events:none}
    .ft{font-size:clamp(36px,8vw,70px);font-weight:900;color:#fff;-webkit-text-stroke:3px #16a34a;text-shadow:0 0 18px rgba(34,197,94,.7),0 0 36px rgba(34,197,94,.4);animation:pop .5s ease-out both}
    .ft.bad{-webkit-text-stroke:3px #ef4444;text-shadow:0 0 18px rgba(239,68,68,.7),0 0 36px rgba(239,68,68,.4)}
    @keyframes pop{0%{transform:scale(.8);opacity:0}40%{opacity:1}70%{transform:scale(1.06)}100%{transform:scale(1)}}
    .bottom{position:fixed;left:0;right:0;bottom:0;background:rgba(0,0,0,.65);backdrop-filter:blur(6px);border-top:1px solid rgba(255,255,255,.08);z-index:25}
    .bottom-in{max-width:1120px;margin:0 auto;padding:8px 12px calc(8px + var(--safe-bottom));display:flex;align-items:center;justify-content:space-between;gap:8px}
    .final{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:15;pointer-events:none}
    .final-box{pointer-events:auto;background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.15);box-shadow:0 10px 30px rgba(0,0,0,.5);border-radius:16px;padding:18px 22px;text-align:center}
    .final-score{font-size:clamp(32px,10vw,84px);font-weight:900;color:#fff;-webkit-text-stroke:2px rgba(0,0,0,.4)}
    @media(max-width:768px){.title{font-size:22px}.globe{height:min(68vh,100vw)}}
  `;

  return (
    <div>
      <style>{css}</style>

      {/* オーディオ要素 */}
      <audio ref={bgmRef} src={musicUrl()} loop preload="auto" playsInline />
      <audio ref={okRef}  src={okSfxUrl()} preload="auto" playsInline />
      <audio ref={ngRef}  src={ngSfxUrl()} preload="auto" playsInline />

      <div className="container">
        {/* ヘッダー */}
        <div className="toolbar">
          <h1 className="title">セラ地理</h1>
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            <button className="btn" onClick={()=>setMusicOn(v=>!v)}>音楽: {musicOn?"ON":"OFF"}</button>
            <input title="音量" type="range" min={0} max={1} step={0.01} value={volume} onChange={(e)=>setVolume(Number(e.target.value))}/>
            <div className="chip">残り: <b>{started?timeLeft:params.dur}s</b></div>
            <div className="chip">正解: <b>{correct}</b> / 解答: <b>{answered}</b></div>
            {!started ? (
              <button className="btn btnp" onClick={startGame}>スタート</button>
            ) : (
              <button className="btn" onClick={()=>{setStarted(false);applyAutoRotate(BEFORE_START_AUTO_ROTATE);}}>一時停止</button>
            )}
            <button className="btn" onClick={()=>{
              const seed=params.seed||`${Date.now()}`;
              const url=(()=>{
                const u=new URLSearchParams({seed:String(seed),dur:String(params.dur),km:String(params.km),music:musicOn?"on":"off", song:musicUrl(), ok:okSfxUrl(), ng:ngSfxUrl()});
                return (typeof window!=="undefined"?window.location.origin+window.location.pathname:"")+"?"+u.toString();
              })();
              if(navigator.share){navigator.share({title:"セラ地理",text:"同じ順番で勝負しよう！",url}).catch(()=>{});}
              else{navigator.clipboard?.writeText(url); alert("共有リンクをコピーしました\n"+url);}
            }}>共有</button>
          </div>
        </div>

        {/* 地球 */}
        <div className="globe">
          {/* スタート前：中央タイトル */}
          {!started && !showFinal && (
            <div className="center-title">
              <div className="center-box">
                <div className="ct1">セラ地理</div>
                <div className="ct2">スタートを押してタイムアタック開始</div>
              </div>
            </div>
          )}

          {/* 問題バナー */}
          {started && (
            <div className="q-banner">
              <div className="qbox">
                <div style={{fontWeight:800,fontSize:18}}>問題：{current.name}</div>
                <div style={{fontSize:12,opacity:.95,marginTop:2}}>ヒント：{current.hint||"（なし）"}</div>
              </div>
            </div>
          )}

          {/* 正解/不正解フラッシュ */}
          {result && result.qId===current.id && (
            <div className="flash">
              <div className={`ft ${result.correct?"":"bad"}`}>{result.correct?"正解！":"不正解！"}</div>
            </div>
          )}

          {/* タイムアップ大表示 */}
          {showFinal && (
            <div className="final">
              <div className="final-box">
                <div style={{color:"#cbd5e1"}}>タイムアップ！あなたのスコア</div>
                <div className="final-score">{score}</div>
                <div style={{color:"#cbd5e1"}}>正解 {correct} / 解答 {answered}</div>
                <div style={{marginTop:10}}>
                  <button className="btn btnp" onClick={()=>{setShowFinal(false);}}>OK</button>
                </div>
              </div>
            </div>
          )}

          <Globe
            ref={globeRef}
            onGlobeClick={({lat,lng})=>{ if(started){ setGuess([lat,lng]); evaluate([lat,lng]); } }}
            globeImageUrl="https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
            bumpImageUrl="https://unpkg.com/three-globe/example/img/earth-topology.png"
            globeMaterial={globeMat}
            showAtmosphere
            atmosphereAltitude={0.18}
            atmosphereColor="#7dd3fc"
            pointsData={points}
            pointAltitude={() => 0.03}
            pointRadius={0.6}
            pointColor={(d)=>d.color}
            pointLabel={(d)=>`${d.name}`}
            arcsData={arcs}
            arcColor={() => ["#60A5FA","#3B82F6"]}
            arcDashLength={0.5}
            arcDashGap={0.15}
            arcDashAnimateTime={2000}
            backgroundColor="rgba(0,0,0,0)"
          />
        </div>

        <div style={{height:"72px"}}/>
      </div>

      {/* 下部バー */}
      <div className="bottom">
        <div className="bottom-in">
          <div style={{fontSize:13}}>残り <b>{started?timeLeft:params.dur}s</b></div>
          {!started ? (
            <button className="btn btnp" onClick={startGame}>スタート</button>
          ) : (
            <button className="btn" onClick={()=>{setStarted(false);applyAutoRotate(BEFORE_START_AUTO_ROTATE);}}>一時停止</button>
          )}
          <button className="btn btnp" onClick={()=>setMusicOn(v=>!v)}>{musicOn?"音楽OFF":"音楽ON"}</button>
        </div>
      </div>

      {/* 自動再生ブロック通知 */}
      {audioErr && (
        <div style={{position:"fixed",right:12,top:"calc(var(--safe-top) + 56px)",zIndex:30,background:"rgba(239,68,68,.95)",color:"#fff",padding:"8px 12px",borderRadius:10,display:"flex",gap:8}}>
          <span>{audioErr}</span>
          <button className="btn" style={{background:"#fff",color:"#ef4444",borderColor:"#fff"}} onClick={async()=>{
            await Promise.all([unlockOne(bgmRef.current), unlockOne(okRef.current), unlockOne(ngRef.current)]);
            try{ await bgmRef.current?.play(); setAudioErr(""); }catch{}
          }}>音を有効にする</button>
        </div>
      )}
    </div>
  );
}
