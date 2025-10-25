// --- DOM要素の取得 ---
const startBtn = document.getElementById('startBtn');
const delaySecondsInput = document.getElementById('delaySeconds');
const delayedVideo = document.getElementById('delayedVideo');
const delayValueDisplay = document.getElementById('delayValue');
const gridToggle = document.getElementById('gridToggle');
const videoWrapper = document.querySelector('.video-wrapper');
const mirrorToggle = document.getElementById('mirrorToggle');
const gridCountInput = document.getElementById('gridCount');
const gridOverlay = document.getElementById('gridOverlay');

// --- ローカルストレージ用のキー ---
const DELAY_STORAGE_KEY = 'delaySecondsValue';
const GRID_COUNT_STORAGE_KEY = 'gridCountValue';
const GRID_TOGGLE_STORAGE_KEY = 'gridToggleState';
const MIRROR_TOGGLE_STORAGE_KEY = 'mirrorToggleState';

let mediaStream = null;
let mediaRecorder = null;
let mediaSource = null;
let sourceBuffer = null;
let dataQueue = [];
let delayTimer = null;
let queueTimer = null;

// --- ▼▼▼ 修正: 録画と再生のMIMEタイプ ▼▼▼ ---
// MediaRecorder (録画) と MediaSource (再生) の両方がサポートする形式を探す
const mimeType = [
    'video/mp4; codecs="avc1.42E01E, mp4a.40.2"',
    'video/mp4; codecs="avc1, mp4a.40.2"',
    'video/mp4',
    'video/webm; codecs="vp8, opus"',
    'video/webm; codecs=vp8',
    'video/webm'
].find(type => 
    MediaRecorder.isTypeSupported(type) &&
    MediaSource.isTypeSupported(type) // ★再生側もサポートしているかチェック
);

console.log("選択されたMIMEタイプ:", mimeType);
// --- ▲▲▲ 修正 ▲▲▲ ---

if (!mimeType) {
    alert('お使いのブラウザは、録画とストリーミング再生に必要なMIMEタイプに対応していません。\n(iPhoneの場合、iOSのバージョンが古いか、MediaSource APIがMP4に対応していない可能性があります)');
}

// --- スライダーの値が表示に反映されるようにする ---
delaySecondsInput.addEventListener('input', () => {
    delayValueDisplay.textContent = parseFloat(delaySecondsInput.value).toFixed(1);
});

// --- グリッド関連の処理 ---
gridToggle.addEventListener('change', () => {
    if (gridToggle.checked) {
        resizeGridOverlay();
        gridOverlay.style.display = 'block';
    } else {
        gridOverlay.style.display = 'none';
    }
});

gridCountInput.addEventListener('input', () => {
    updateGridStyle();
});

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
 * グリッドをリサイズする関数
 */
function resizeGridOverlay() {
    const videoWidth = delayedVideo.videoWidth;
    const videoHeight = delayedVideo.videoHeight;
    const wrapperWidth = videoWrapper.clientWidth;
    const wrapperHeight = videoWrapper.clientHeight;

    if (!videoWidth || !videoHeight || !wrapperWidth || !wrapperHeight) {
        return;
    }

    const videoRatio = videoWidth / videoHeight;
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

    gridOverlay.style.width = `${newWidth}px`;
    gridOverlay.style.height = `${newHeight}px`;
    gridOverlay.style.top = `${top}px`;
    gridOverlay.style.left = `${left}px`;
}

// イベントリスナーを追加
delayedVideo.addEventListener('resize', resizeGridOverlay);
window.addEventListener('resize', resizeGridOverlay);


// --- 左右反転チェックボックスの処理 ---
mirrorToggle.addEventListener('change', () => {
    delayedVideo.classList.toggle('mirror-active', mirrorToggle.checked);
});


// --- 開始ボタンの処理 ---
startBtn.onclick = async () => {
    
    // ★ mimeType が見つからなかったら開始しない
    if (!mimeType) {
        alert('このブラウザでは実行に必要な機能がサポートされていません。');
        return;
    }

    try {
        // 1. カメラ映像の取得
        mediaStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });

        // 2. MediaSource (遅延再生側) の準備
        mediaSource = new MediaSource();
        mediaSource.addEventListener('sourceopen', () => {
            if (mediaSource.sourceBuffers.length > 0) return;
            try {
                sourceBuffer = mediaSource.addSourceBuffer(mimeType);
            } catch (e) {
                console.error("addSourceBuffer エラー:", e);
                stopRecording();
                return;
            }
            delayedVideo.play().catch(e => {
                console.warn("Play() に失敗しました:", e);
            });
            const delayInMs = parseFloat(delaySecondsInput.value) * 1000;
            delayTimer = setTimeout(processQueue, delayInMs);
        }, { once: true });
        delayedVideo.src = URL.createObjectURL(mediaSource);

        // 3. MediaRecorder (録画側) の準備
        mediaRecorder = new MediaRecorder(mediaStream, { mimeType: mimeType });
        mediaRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
                dataQueue.push(event.data);
            }
        };
        mediaRecorder.start(500);

        // UIの制御
        startBtn.textContent = '停止'; 
        startBtn.classList.add('stop-button');
        startBtn.onclick = stopRecording; 
        delaySecondsInput.disabled = true; 

    } catch (err) {
        console.error('エラー:', err);
        // ★ エラー内容をアラートで表示（デバッグ用）
        alert('カメラの起動に失敗しました。\n(HTTPS接続でないか、カメラへのアクセスを許可しませんでした)\n' + err.message);
        location.reload();
    }
};

// --- キューを処理して再生バッファに追加する関数 ---
async function processQueue() {
    if (!sourceBuffer) {
        return;
    }
    if (dataQueue.length > 0 && !sourceBuffer.updating) {
        const blob = dataQueue.shift(); 
        try {
            const buffer = await blob.arrayBuffer();
            if (sourceBuffer && mediaSource && mediaSource.readyState === 'open') {
                sourceBuffer.appendBuffer(buffer);
            } else {
                dataQueue.unshift(blob);
            }
        } catch (e) {
            console.error('SourceBufferへの追加エラー:', e);
        }
    }
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        queueTimer = setTimeout(processQueue, 450);
    }
}


// --- 停止ボタンの処理 ---
function stopRecording() {
    
    // リロードする直前に、現在の設定をすべて保存する
    localStorage.setItem(DELAY_STORAGE_KEY, delaySecondsInput.value);
    localStorage.setItem(GRID_COUNT_STORAGE_KEY, gridCountInput.value);
    localStorage.setItem(GRID_TOGGLE_STORAGE_KEY, gridToggle.checked);
    localStorage.setItem(MIRROR_TOGGLE_STORAGE_KEY, mirrorToggle.checked);

    // ページ全体をリロード
    location.reload();
}


// --- ページ読み込み時に設定を読み込む ---
loadSettings();