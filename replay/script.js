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

// --- 録画と再生のMIMEタイプ ---
const mimeType = [
    'video/mp4; codecs="avc1.42E01E, mp4a.40.2"',
    'video/mp4; codecs="avc1, mp4a.40.2"',
    'video/mp4',
    'video/webm; codecs="vp8, opus"',
    'video/webm; codecs=vp8',
    'video/webm'
].find(type => 
    MediaRecorder.isTypeSupported(type) &&
    MediaSource.isTypeSupported(type)
);

console.log("選択されたMIMEタイプ:", mimeType);

if (!mimeType) {
    alert('お使いのブラウザは、録画とストリーミング再生に必要なMIMEタイプに対応していません。\n(iPhoneの場合、iOSのバージョンが古いか、MediaSource APIがMP4に対応していない可能性があります)');
}

// --- (スライダー, グリッド, 設定ロード, リサイズ関数は変更なし) ---
// (省略)
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
delayedVideo.addEventListener('resize', resizeGridOverlay);
window.addEventListener('resize', resizeGridOverlay);

// --- 左右反転チェックボックスの処理 ---
mirrorToggle.addEventListener('change', () => {
    delayedVideo.classList.toggle('mirror-active', mirrorToggle.checked);
});


// --- ▼▼▼ 修正: 開始ボタンの処理 ▼▼▼ ---
startBtn.onclick = async () => {
    
    if (!mimeType) {
        alert('このブラウザでは実行に必要な機能がサポートされていません。');
        return;
    }

    try {
        // --- ★ 修正ポイント 1 ---
        // 最初に MediaSource を準備し、play() を呼ぶ
        
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
            
            // ★ sourceopen 内部でも play() を呼ぶ（2回目）
            // これが実際に再生を開始する
            delayedVideo.play().catch(e => {
                console.warn("Play() (sourceopen内) に失敗しました:", e);
            });
            
            const delayInMs = parseFloat(delaySecondsInput.value) * 1000;
            delayTimer = setTimeout(processQueue, delayInMs);
        }, { once: true });
        
        delayedVideo.src = URL.createObjectURL(mediaSource);

        // ★★★ await の前に play() を呼ぶ (iOSの制限対策) ★★★
        // これで "ユーザー操作" として 'play' が許可される (1回目)
        delayedVideo.play().catch(e => {
            console.warn("Play() (先行呼び出し) に失敗しました:", e);
        });

        // --- ★ 修正ポイント 2 ---
        // play() の後に await getUserMedia() を呼ぶ

        // 1. カメラ映像の取得
        mediaStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });

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
        alert('カメラの起動に失敗しました。\n(HTTPS接続でないか、カメラへのアクセスを許可しませんでした)\n' + err.message);
        location.reload();
    }
};
// --- ▲▲▲ 修正 ▲▲▲ ---


// --- (processQueue, stopRecording, loadSettings は変更なし) ---
// (省略)
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

function stopRecording() {
    localStorage.setItem(DELAY_STORAGE_KEY, delaySecondsInput.value);
    localStorage.setItem(GRID_COUNT_STORAGE_KEY, gridCountInput.value);
    localStorage.setItem(GRID_TOGGLE_STORAGE_KEY, gridToggle.checked);
    localStorage.setItem(MIRROR_TOGGLE_STORAGE_KEY, mirrorToggle.checked);
    location.reload();
}

loadSettings();