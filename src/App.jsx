import React, { useState, useRef, useEffect } from "react";
import Globe from "react-globe.gl";

// ==== Audio URLs ====
export const DEFAULT_MUSIC_URL   = "/sera-geo.mp3";
export const DEFAULT_CORRECT_URL = "/correct.mp3";
export const DEFAULT_WRONG_URL   = "/wrong.mp3";

function getParam(name, fallback) {
  const p = new URLSearchParams(window.location.search);
  return p.get(name) || fallback;
}

function resolveUrl(defaultUrl){
  const key =
    defaultUrl === DEFAULT_MUSIC_URL   ? "song"    :
    defaultUrl === DEFAULT_CORRECT_URL ? "correct" :
    "wrong";
  return getParam(key, defaultUrl);
}

export default function App() {
  const [started, setStarted] = useState(false);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [result, setResult] = useState(null);

  const bgmRef     = useRef(null);
  const correctRef = useRef(null);
  const wrongRef   = useRef(null);
  const globeRef   = useRef();

  const MUSIC_URL   = resolveUrl(DEFAULT_MUSIC_URL);
  const CORRECT_URL = resolveUrl(DEFAULT_CORRECT_URL);
  const WRONG_URL   = resolveUrl(DEFAULT_WRONG_URL);

  const questions = [
    { name: "ニューヨーク", lat: 40.7128, lon: -74.0060 },
    { name: "東京", lat: 35.6762, lon: 139.6503 },
    { name: "ロンドン", lat: 51.5074, lon: -0.1278 },
    { name: "エッフェル塔", lat: 48.8584, lon: 2.2945 }
  ];

  // 次の問題へ
  function nextQuestion() {
    const q = questions[Math.floor(Math.random() * questions.length)];
    setCurrentQuestion(q);
  }

  // 効果音再生
  function playSfx(ref) {
    if (ref && ref.current) {
      ref.current.currentTime = 0;
      ref.current.play().catch(() => {});
    }
  }

  // 回答処理
  function answer(lat, lon) {
    if (!currentQuestion) return;
    const dx = lat - currentQuestion.lat;
    const dy = lon - currentQuestion.lon;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const ok = dist < 5; // 適当な許容距離

    if (ok) {
      setScore(s => s + 1);
      playSfx(correctRef);
    } else {
      playSfx(wrongRef);
      // 正解位置に回転
      globeRef.current.pointOfView({ lat: currentQuestion.lat, lng: currentQuestion.lon, altitude: 1.5 }, 1000);
    }

    setResult({ correct: ok, qId: currentQuestion.name });

    setTimeout(() => {
      setResult(null);
      nextQuestion();
    }, 1000);
  }

  // スタート
  function startGame() {
    setStarted(true);
    setScore(0);
    setTimeLeft(60);
    nextQuestion();
    bgmRef.current.play().catch(() => {});
  }

  // タイマー
  useEffect(() => {
    if (!started) return;
    if (timeLeft <= 0) return;

    const id = setTimeout(() => setTimeLeft(t => t - 1), 1000);
    return () => clearTimeout(id);
  }, [started, timeLeft]);

  // ゲーム終了表示
  const gameOver = started && timeLeft <= 0;

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      {!started && (
        <div style={{ textAlign: "center", marginTop: "2rem" }}>
          <h1>Geo Quiz Game</h1>
          <button onClick={startGame}>スタート</button>
        </div>
      )}

      {started && !gameOver && (
        <div style={{ textAlign: "center" }}>
          <h2>残り時間: {timeLeft}s</h2>
          <h3>スコア: {score}</h3>
          <h2>Q: {currentQuestion?.name}</h2>
        </div>
      )}

      {gameOver && (
        <div style={{ textAlign: "center", marginTop: "2rem" }}>
          <h1>ゲーム終了!</h1>
          <h2>あなたのスコア: {score}</h2>
        </div>
      )}

      <div style={{ flex: 1 }}>
        <Globe
          ref={globeRef}
          globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
          bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
          backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
          onGlobeClick={({ lat, lng }) => {
            if (started && !gameOver) answer(lat, lng);
          }}
        />
      </div>

      {/* 音源 */}
      <audio ref={bgmRef}     src={MUSIC_URL}   loop preload="auto" playsInline />
      <audio ref={correctRef} src={CORRECT_URL}      preload="auto" playsInline />
      <audio ref={wrongRef}   src={WRONG_URL}        preload="auto" playsInline />
    </div>
  );
}
