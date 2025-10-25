// --- DOM要素の取得 ---
const startBtn = document.getElementById('startBtn');
const delaySecondsInput = document.getElementById('delaySeconds');
const delayValueDisplay = document.getElementById('delayValue');
const gridToggle = document.getElementById('gridToggle');
const videoWrapper = document.querySelector('.video-wrapper');
const mirrorToggle = document.getElementById('mirrorToggle');
const gridCountInput = document.getElementById('gridCount');
const gridOverlay = document.getElementById('gridOverlay');

const previewVideo = document.getElementById('previewVideo');
const delayedCanvas = document.getElementById('delayedCanvas');
const ctx = delayedCanvas.getContext('2d');

let mediaStream = null;
let frameQueue = []; // フレームをためるキュー
let animationFrameId = null; // ループ管理用

// --- ローカルストレージ用のキー ---
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
        resizeElements(); // サイズを再計算
        gridOverlay.style.display = 'block';
    } else {
        gridOverlay.style.display = 'none';
    }
});
gridCountInput.addEventListener('input', updateGridStyle);

/**
 * CSSの linear-gradient 文字列を動的に生成する関数
 */
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

/**
 * グリッド本数の入力に基づき、CSS変数を更新する関数
 */
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

/**
 * 設定を読み込む関数
 */
function loadSettings() {
    // 1. 遅延秒数を読み込む
    const savedDelay = localStorage.getItem(DELAY_STORAGE_KEY);
    if (savedDelay !== null) {
        delaySecondsInput.value = savedDelay;
        delayValueDisplay.textContent = parseFloat(savedDelay).toFixed(1);
    }
    // 2. グリッド本数を読み込む
    const savedGridCount = localStorage.getItem(GRID_COUNT_STORAGE_KEY);
    if (savedGridCount !== null) {
        gridCountInput.value = savedGridCount;
    }
    // 3. グリッド表示チェックを読み込む
    const savedGridToggle = localStorage.getItem(GRID_TOGGLE_STORAGE_KEY);
    if (savedGridToggle !== null) {
        gridToggle.checked = (savedGridToggle === 'true');
        gridToggle.dispatchEvent(new Event('change'));
    }
    // 4. ミラーリングチェックを読み込む
    const savedMirrorToggle = localStorage.getItem(MIRROR_TOGGLE_STORAGE_KEY);
    if (savedMirrorToggle !== null) {
        mirrorToggle.checked = (savedMirrorToggle === 'true');
        mirrorToggle.dispatchEvent(new Event('change'));
    }
    // 5. 読み込んだ値でグリッドスタイルを初期化
    updateGridStyle();
}

/**
 * CanvasとGridのリサイズ関数
 */
function resizeElements() {
    // CSSの変更が適用されるのを少し待つ
    setTimeout(() => {
        const videoWidth = previewVideo.videoWidth;
        const videoHeight = previewVideo.videoHeight;
        const wrapperWidth = videoWrapper.clientWidth;
        const wrapperHeight = videoWrapper.clientHeight;

        if (!videoWidth || !videoHeight || !wrapperWidth || !wrapperHeight || videoWidth === 0 || videoHeight === 0) {
            return;
        }

        const isDeviceLandscape = window.matchMedia("(orientation: landscape)").matches;
        const isVideoPortrait = videoHeight > videoWidth;

        let videoW = videoWidth;
        let videoH = videoHeight;

        if (isDeviceLandscape && isVideoPortrait) {
            [videoW, videoH] = [videoHeight, videoWidth];
        }

        const videoRatio = videoW / videoH;
        const wrapperRatio = wrapperWidth / wrapperHeight;
        let newWidth, newHeight, top, left;

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

        delayedCanvas.width = newWidth;
        delayedCanvas.height = newHeight;
        delayedCanvas.style.width = `${newWidth}px`;
        delayedCanvas.style.height = `${newHeight}px`;
        delayedCanvas.style.top = `${top}px`;
        delayedCanvas.style.left = `${left}px`;
        
        gridOverlay.style.width = `${newWidth}px`;
        gridOverlay.style.height = `${newHeight}px`;
        gridOverlay.style.top = `${top}px`;
        gridOverlay.style.left = `${left}px`;
    }, 100); // 100ms (0.1秒) 待機
}

// ウィンドウリサイズと回転に対応
window.addEventListener('resize', resizeElements);
// ★★★ 画面回転のイベントリスナー ★★★
window.addEventListener('orientationchange', resizeElements); 
// ★★★ これが重要です ★★★


// --- 左右反転チェックボックスの処理 ---
mirrorToggle.addEventListener('change', () => {
    delayedCanvas.classList.toggle('mirror-active', mirrorToggle.checked);
});


// --- メインの描画ループ ---
function frameLoop() {
    animationFrameId = requestAnimationFrame(frameLoop);
    if (previewVideo.readyState >= 3) {
        const captureCanvas = document.createElement('canvas');
        captureCanvas.width = previewVideo.videoWidth;
        captureCanvas.height = previewVideo.videoHeight;
        captureCanvas.getContext('2d').drawImage(previewVideo, 0, 0);
        
        frameQueue.push({
            frame: captureCanvas,
            timestamp: Date.now()
        });
    }
    const now = Date.now();
    const targetDelayMs = parseFloat(delaySecondsInput.value) * 1000;
    let frameToDraw = null;
    while (frameQueue.length > 0) {
        const timeElapsed = now - frameQueue[0].timestamp;
        if (timeElapsed >= targetDelayMs) {
            frameToDraw = frameQueue.shift().frame;
        } else {
            break;
        }
    }
    if (frameToDraw) {
        ctx.save();
        const isDeviceLandscape = window.matchMedia("(orientation: landscape)").matches;
        const isVideoPortrait = previewVideo.videoHeight > previewVideo.videoWidth;

        if (mirrorToggle.checked) {
            if (!(isDeviceLandscape && isVideoPortrait)) {
                 ctx.translate(delayedCanvas.width, 0);
                 ctx.scale(-1, 1);
            }
        }

        if (isDeviceLandscape && isVideoPortrait) {
            ctx.translate(delayedCanvas.width / 2, delayedCanvas.height / 2);
            ctx.rotate(90 * Math.PI / 180);
            ctx.drawImage(frameToDraw, 
                -delayedCanvas.height / 2,
                -delayedCanvas.width / 2,
                delayedCanvas.height,
                delayedCanvas.width
            );
        } else {
            ctx.drawImage(frameToDraw, 0, 0, delayedCanvas.width, delayedCanvas.height);
        }
        ctx.restore();
    }
    const discardThreshold = targetDelayMs + 2000;
    while (frameQueue.length > 0 && (now - frameQueue[0].timestamp) > discardThreshold) {
        frameQueue.shift();
    }
}


// --- 開始ボタンの処理 (iOS対応) ---
startBtn.onclick = () => {
    
    previewVideo.play().catch(e => {
        console.warn("Play() (先行呼び出し) に失敗しました (iOSでは想定内):", e);
    });

    navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false
    })
    .then(stream => {
        console.log("カメラ起動成功");
        mediaStream = stream;
        previewVideo.srcObject = stream;
        
        previewVideo.addEventListener('loadedmetadata', () => {
            console.log("ビデオ解像度:", previewVideo.videoWidth, "x", previewVideo.videoHeight);
            resizeElements();
        });

        startBtn.textContent = '停止'; 
        startBtn.classList.add('stop-button');
        startBtn.onclick = stopRecording; 
        delaySecondsInput.disabled = true; 

        frameQueue = [];
        animationFrameId = requestAnimationFrame(frameLoop);
    })
    .catch(err => {
        console.error('エラー:', err);
        alert('カメラの起動に失敗しました。\n(HTTPS接続でないか、カメラへのアクセスを許可しませんでした)\n' + err.message);
        location.reload();
    });
};


// --- 停止ボタンの処理 ---
function stopRecording() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
    }
    localStorage.setItem(DELAY_STORAGE_KEY, delaySecondsInput.value);
    localStorage.setItem(GRID_COUNT_STORAGE_KEY, gridCountInput.value);
    localStorage.setItem(GRID_TOGGLE_STORAGE_KEY, gridToggle.checked);
    localStorage.setItem(MIRROR_TOGGLE_STORAGE_KEY, mirrorToggle.checked);
    location.reload();
}


// --- ページ読み込み時に設定を読み込む ---
loadSettings();