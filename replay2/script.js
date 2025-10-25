// --- DOM要素の取得 ---
const startBtn = document.getElementById('startBtn');
const delaySecondsInput = document.getElementById('delaySeconds');
const delayValueDisplay = document.getElementById('delayValue');
const gridToggle = document.getElementById('gridToggle');
const videoWrapper = document.querySelector('.video-wrapper');
const mirrorToggle = document.getElementById('mirrorToggle');
const gridCountInput = document.getElementById('gridCount');
const gridOverlay = document.getElementById('gridOverlay');

// ▼▼▼ 修正 (Canvas API ベースに変更) ▼▼▼
const previewVideo = document.getElementById('previewVideo');
const delayedCanvas = document.getElementById('delayedCanvas');
const ctx = delayedCanvas.getContext('2d');

let mediaStream = null;
let frameQueue = []; // フレームをためるキュー
let animationFrameId = null; // ループ管理用
// ▲▲▲ 修正 ▲▲▲

// --- ローカルストレージ用のキー (変更なし) ---
const DELAY_STORAGE_KEY = 'delaySecondsValue';
const GRID_COUNT_STORAGE_KEY = 'gridCountValue';
const GRID_TOGGLE_STORAGE_KEY = 'gridToggleState';
const MIRROR_TOGGLE_STORAGE_KEY = 'mirrorToggleState';


// --- スライダーの値が表示に反映されるようにする ---
delaySecondsInput.addEventListener('input', () => {
    delayValueDisplay.textContent = parseFloat(delaySecondsInput.value).toFixed(1);
});

// --- グリッド関連の処理 ---
gridToggle.addEventListener('change', () => {
    if (gridToggle.checked) {
        resizeElements(); // ★リサイズ関数呼び出し
        gridOverlay.style.display = 'block';
    } else {
        gridOverlay.style.display = 'none';
    }
});
gridCountInput.addEventListener('input', updateGridStyle);

// (generateGradient 関数は変更なし)
function generateGradient(direction, count) {
    let stops = [];
    const step = 100 / (count + 1);
    for (let i = 1; i <= count; i++) {
        const pos = (i * step).toFixed(2);
        stops.push(
            `transparent ${pos}%,` +
            `rgba(255, 255, 255, 0.4) ${pos}%,` +
            `rgba(255, 255, 255, 0.4) calc(${pos}% + 1px),` +
            `transparent calc(${pos}% + 1px)`
        );
    }
    return `linear-gradient(${direction}, ${stops.join(', ')})`;
}

// (updateGridStyle 関数は変更なし)
function updateGridStyle() {
    const lineCount = parseInt(gridCountInput.value, 10);
    if (isNaN(lineCount) || lineCount <= 0) {
        gridOverlay.style.setProperty('--grid-lines-v', 'none');
        gridOverlay.style.setProperty('--grid-lines-h', 'none');
        return;
    }
    const gradientV = generateGradient('to right', lineCount);
    const gradientH = generateGradient('to bottom', lineCount);
    gridOverlay.style.setProperty('--grid-lines-v', gradientV);
    gridOverlay.style.setProperty('--grid-lines-h', gradientH);
}

// (loadSettings 関数は変更なし)
function loadSettings() {
    const savedDelay = localStorage.getItem(DELAY_STORAGE_KEY);
    if (savedDelay !== null) {
        delaySecondsInput.value = savedDelay;
        delayValueDisplay.textContent = parseFloat(savedDelay).toFixed(1);
    }
    const savedGridCount = localStorage.getItem(GRID_COUNT_STORAGE_KEY);
    if (savedGridCount !== null) {
        gridCountInput.value = savedGridCount;
    }
    const savedGridToggle = localStorage.getItem(GRID_TOGGLE_STORAGE_KEY);
    if (savedGridToggle !== null) {
        gridToggle.checked = (savedGridToggle === 'true');
        gridToggle.dispatchEvent(new Event('change'));
    }
    const savedMirrorToggle = localStorage.getItem(MIRROR_TOGGLE_STORAGE_KEY);
    if (savedMirrorToggle !== null) {
        mirrorToggle.checked = (savedMirrorToggle === 'true');
        mirrorToggle.dispatchEvent(new Event('change'));
    }
    updateGridStyle();
}

// --- ▼▼▼ 修正: CanvasとGridのリサイズ関数 ▼▼▼ ---
function resizeElements() {
    // ソースは非表示の previewVideo
    const videoWidth = previewVideo.videoWidth;
    const videoHeight = previewVideo.videoHeight;
    const wrapperWidth = videoWrapper.clientWidth;
    const wrapperHeight = videoWrapper.clientHeight;

    if (!videoWidth || !videoHeight || !wrapperWidth || !wrapperHeight) {
        return;
    }

    const videoRatio = videoWidth / videoHeight;
    const wrapperRatio = wrapperWidth / wrapperHeight;
    let newWidth, newHeight, top, left;

    // object-fit: contain の計算
    if (videoRatio > wrapperRatio) {
        newWidth = wrapperWidth;
        newHeight = newWidth / videoRatio;
        top = (wrapperHeight - newHeight) / 2;
        left = 0;
    } else {
        newHeight = wrapperHeight;
        newWidth = newHeight * videoRatio;
        left = (wrapperWidth - newWidth) / 2;
        top = 0;
    }

    // 1. 表示キャンバスのサイズと位置を設定
    delayedCanvas.width = newWidth; // 描画解像度
    delayedCanvas.height = newHeight;
    delayedCanvas.style.width = `${newWidth}px`; // 表示サイズ
    delayedCanvas.style.height = `${newHeight}px`;
    delayedCanvas.style.top = `${top}px`;
    delayedCanvas.style.left = `${left}px`;
    
    // 2. グリッドのサイズと位置を設定
    gridOverlay.style.width = `${newWidth}px`;
    gridOverlay.style.height = `${newHeight}px`;
    gridOverlay.style.top = `${top}px`;
    gridOverlay.style.left = `${left}px`;
}
// ▲▲▲ 修正 ▲▲▲

// --- ▼▼▼ 修正: ミラーリングの対象を Canvas に変更 ▼▼▼ ---
mirrorToggle.addEventListener('change', () => {
    delayedCanvas.classList.toggle('mirror-active', mirrorToggle.checked);
});
// ▲▲▲ 修正 ▲▲▲


// --- ▼▼▼ 修正: メインの描画ループ ▼▼▼ ---
function frameLoop() {
    // 1. 描画ループを予約
    animationFrameId = requestAnimationFrame(frameLoop);

    // 2. フレームのキャプチャ (非表示ビデオ -> オフスクリーンCanvas)
    if (previewVideo.readyState >= 3) { // 3 = HAVE_FUTURE_DATA
        const captureCanvas = document.createElement('canvas');
        captureCanvas.width = previewVideo.videoWidth;
        captureCanvas.height = previewVideo.videoHeight;
        captureCanvas.getContext('2d').drawImage(previewVideo, 0, 0);
        
        frameQueue.push({
            frame: captureCanvas,
            timestamp: Date.now()
        });
    }

    // 3. 描画処理
    const now = Date.now();
    const targetDelayMs = parseFloat(delaySecondsInput.value) * 1000;
    let frameToDraw = null;

    // 遅延時間を満たしたフレームを探す
    while (frameQueue.length > 0) {
        const timeElapsed = now - frameQueue[0].timestamp;
        
        if (timeElapsed >= targetDelayMs) {
            // 描画すべきフレームが見つかった
            frameToDraw = frameQueue.shift().frame; // キューから取り出す
        } else {
            // フレームが新しすぎる = 待つ
            break;
        }
    }

    // 4. 描画
    if (frameToDraw) {
        ctx.save(); // ミラーリング設定を保存

        // ミラーリングが有効かチェック
        if (mirrorToggle.checked) {
            ctx.translate(delayedCanvas.width, 0);
            ctx.scale(-1, 1);
        }
        
        // メインのキャンバスに描画
        ctx.drawImage(frameToDraw, 0, 0, delayedCanvas.width, delayedCanvas.height);
        
        ctx.restore(); // ミラーリング設定を元に戻す
    }

    // 5. 古すぎるフレームの破棄 (遅延を短くした時など)
    const discardThreshold = targetDelayMs + 2000; // 2秒のバッファ
    while (frameQueue.length > 0 && (now - frameQueue[0].timestamp) > discardThreshold) {
        frameQueue.shift();
    }
}
// ▲▲▲ 修正 ▲▲▲


// --- ▼▼▼ 修正: 開始ボタンの処理 (iOS対応) ▼▼▼ ---
startBtn.onclick = () => {
    
    // 1. iOSのために、タップ操作と同期して play() を呼ぶ
    previewVideo.play().catch(e => {
        console.warn("Play() (先行呼び出し) に失敗しました (iOSでは想定内):", e);
    });

    // 2. カメラの起動
    navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false // ★音声なし
    })
    .then(stream => {
        // --- ▼ カメラ起動成功時 ---
        console.log("カメラ起動成功");
        mediaStream = stream;
        previewVideo.srcObject = stream;
        // play() はすでに呼ばれているので不要
        
        // ビデオのメタデータが読み込まれたら、リサイズ処理を開始
        previewVideo.addEventListener('loadedmetadata', () => {
            console.log("ビデオ解像度:", previewVideo.videoWidth, "x", previewVideo.videoHeight);
            resizeElements(); // 最初のサイズ調整
            
            // ★リサイズイベントを追加
            window.addEventListener('resize', resizeElements);
        });

        // 3. UIの制御
        startBtn.textContent = '停止'; 
        startBtn.classList.add('stop-button');
        startBtn.onclick = stopRecording; 
        delaySecondsInput.disabled = true; 

        // 4. メインループの開始
        frameQueue = []; // キューをリセット
        animationFrameId = requestAnimationFrame(frameLoop);
        // --- ▲ カメラ起動成功時ここまで ---
    })
    .catch(err => {
        // --- ▼ カメラ起動失敗時 ---
        console.error('エラー:', err);
        alert('カメラの起動に失敗しました。\n(HTTPS接続でないか、カメラへのアクセスを許可しませんでした)\n' + err.message);
        location.reload();
        // --- ▲ カメラ起動失敗時ここまで ---
    });
};
// ▲▲▲ 修正 ▲▲▲


// --- ▼▼▼ 修正: 停止ボタンの処理 ▼▼▼ ---
function stopRecording() {
    
    // 1. ループを止める
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }
    
    // 2. カメラを止める
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
    }

    // 3. 設定を保存
    localStorage.setItem(DELAY_STORAGE_KEY, delaySecondsInput.value);
    localStorage.setItem(GRID_COUNT_STORAGE_KEY, gridCountInput.value);
    localStorage.setItem(GRID_TOGGLE_STORAGE_KEY, gridToggle.checked);
    localStorage.setItem(MIRROR_TOGGLE_STORAGE_KEY, mirrorToggle.checked);

    // 4. ページ全体をリロード
    location.reload();
}
// ▲▲▲ 修正 ▲▲▲


// --- ページ読み込み時に設定を読み込む ---
loadSettings();