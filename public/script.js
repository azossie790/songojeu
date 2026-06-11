// script.js - Client avec gestion des salles

let playerId = null;
let currentRoomCode = null;
let myCamp = null;
let pollingInterval = null;
let currentGameState = null;
let isWaitingForMoveResponse = false;

function generatePlayerId() {
    let id = localStorage.getItem('awale_player_id');
    if (!id) {
        id = 'player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('awale_player_id', id);
    }
    return id;
}

function showScreen(screenName) {
    document.getElementById('homeScreen').classList.add('hidden');
    document.getElementById('createScreen').classList.add('hidden');
    document.getElementById('joinScreen').classList.add('hidden');
    document.getElementById('gameScreen').classList.add('hidden');
    document.getElementById(`${screenName}Screen`).classList.remove('hidden');
}

async function createRoom() {
    playerId = generatePlayerId();
    
    try {
        const response = await fetch('/api/create-room', { method: 'POST' });
        const data = await response.json();
        
        if (data.success) {
            currentRoomCode = data.roomCode;
            document.getElementById('roomCodeDisplay').textContent = currentRoomCode;
            document.getElementById('currentRoomCode').textContent = currentRoomCode;
            showScreen('create');
            waitForGameStart();
        }
    } catch (error) {
        console.error(error);
    }
}

async function joinRoom() {
    const roomCode = document.getElementById('roomCodeInput').value.toUpperCase().trim();
    if (!roomCode || roomCode.length !== 6) {
        document.getElementById('joinError').textContent = 'Code invalide (6 caractères)';
        return;
    }
    
    playerId = generatePlayerId();
    
    try {
        const response = await fetch('/api/join-room', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomCode, playerId })
        });
        const data = await response.json();
        
        if (data.success) {
            currentRoomCode = data.roomCode;
            myCamp = data.camp;
            document.getElementById('currentRoomCode').textContent = currentRoomCode;
            startGame();
        } else {
            document.getElementById('joinError').textContent = data.reason;
        }
    } catch (error) {
        document.getElementById('joinError').textContent = 'Erreur de connexion';
    }
}

function waitForGameStart() {
    if (pollingInterval) clearInterval(pollingInterval);
    
    const checkInterval = setInterval(async () => {
        try {
            const response = await fetch(`/api/game-state/${currentRoomCode}?playerId=${playerId}`);
            const state = await response.json();
            
            if (state.players && state.players.sud && state.players.nord) {
                clearInterval(checkInterval);
                myCamp = state.myCamp;
                startGame();
            }
        } catch (error) {}
    }, 1000);
}

function startGame() {
    showScreen('game');
    createBoard();
    startPolling();
    
    if (myCamp === 'sud') {
        document.getElementById('sudPlayerStatus').innerHTML = '(vous)';
        document.getElementById('sudPlayerStatus').style.color = '#2ecc71';
    } else {
        document.getElementById('nordPlayerStatus').innerHTML = '(vous)';
        document.getElementById('nordPlayerStatus').style.color = '#2ecc71';
    }
}

function startPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(() => fetchGameState(), 500);
}

async function fetchGameState() {
    try {
        const response = await fetch(`/api/game-state/${currentRoomCode}?playerId=${playerId}`);
        const state = await response.json();
        
        if (state.error) {
            showMessage('Partie introuvable');
            leaveGame();
            return;
        }
        
        if (state.waiting) {
            document.getElementById('turnMessage').innerHTML = '⏳ En attente du second joueur...';
            return;
        }
        
        currentGameState = state;
        updateUI(state);
        
        if (!state.gameActive && state.winner) {
            if (state.winner === myCamp) {
                showMessage(`🎉 VICTOIRE ! ${state.winnerScore} points ! 🎉`);
            } else if (state.winner) {
                showMessage(`Défaite... L'adversaire a ${state.winnerScore} points`);
            }
        }
    } catch (error) {}
}

async function sendMove(caseIndex) {
    if (isWaitingForMoveResponse) {
        showMessage("Attendez la réponse...");
        return;
    }
    
    if (!currentGameState || !currentGameState.gameActive) {
        showMessage("Partie terminée");
        return;
    }
    
    if (currentGameState.currentTurn !== myCamp) {
        showMessage("Ce n'est pas votre tour !");
        return;
    }
    
    isWaitingForMoveResponse = true;
    
    try {
        const response = await fetch(`/api/move/${currentRoomCode}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playerId, caseIndex })
        });
        
        const result = await response.json();
        
        if (result.success) {
            await fetchGameState();
        } else {
            showMessage(`❌ ${result.reason}`);
        }
    } catch (error) {
        showMessage("Erreur réseau");
    } finally {
        isWaitingForMoveResponse = false;
    }
}

async function resetGame() {
    try {
        await fetch(`/api/reset/${currentRoomCode}`, { method: 'POST' });
        showMessage("Partie réinitialisée !");
        await fetchGameState();
    } catch (error) {}
}

function leaveGame() {
    if (pollingInterval) clearInterval(pollingInterval);
    currentRoomCode = null;
    myCamp = null;
    showScreen('home');
}

function createBoard() {
    const northContainer = document.getElementById('northCells');
    northContainer.innerHTML = '';
    for (let i = 6; i >= 0; i--) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.id = `nord-${i}`;
        cell.innerHTML = `<div class="cell-number">Case ${i+1}</div><div class="cell-seeds">5</div>`;
        cell.addEventListener('click', (function(idx) { return function() { sendMove(idx); }; })(i));
        northContainer.appendChild(cell);
    }
    
    const southContainer = document.getElementById('southCells');
    southContainer.innerHTML = '';
    for (let i = 0; i < 7; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.id = `sud-${i}`;
        cell.innerHTML = `<div class="cell-number">Case ${i+1}</div><div class="cell-seeds">5</div>`;
        cell.addEventListener('click', (function(idx) { return function() { sendMove(idx); }; })(i));
        southContainer.appendChild(cell);
    }
}

function updateUI(state) {
    document.getElementById('sudScore').textContent = state.scores.sud;
    document.getElementById('nordScore').textContent = state.scores.nord;
    
    for (let i = 0; i < 7; i++) {
        const sudCell = document.getElementById(`sud-${i}`);
        if (sudCell) sudCell.querySelector('.cell-seeds').textContent = state.board.sud[i];
        const nordCell = document.getElementById(`nord-${i}`);
        if (nordCell) nordCell.querySelector('.cell-seeds').textContent = state.board.nord[i];
        
        const canPlaySud = state.gameActive && myCamp === 'sud' && state.currentTurn === 'sud' && state.board.sud[i] > 0;
        const canPlayNord = state.gameActive && myCamp === 'nord' && state.currentTurn === 'nord' && state.board.nord[i] > 0;
        
        if (sudCell) {
            if (canPlaySud && !isWaitingForMoveResponse) sudCell.classList.remove('disabled');
            else sudCell.classList.add('disabled');
        }
        if (nordCell) {
            if (canPlayNord && !isWaitingForMoveResponse) nordCell.classList.remove('disabled');
            else nordCell.classList.add('disabled');
        }
    }
    
    const turnMessage = document.getElementById('turnMessage');
    if (state.gameActive) {
        if (state.currentTurn === myCamp) {
            turnMessage.innerHTML = '🎯 VOTRE TOUR !';
            turnMessage.style.color = '#2ecc71';
        } else {
            turnMessage.innerHTML = `👀 Tour de l'adversaire (${state.currentTurn.toUpperCase()})`;
            turnMessage.style.color = '#e74c3c';
        }
    }
}

function showMessage(msg) {
    const msgDiv = document.getElementById('message');
    msgDiv.textContent = msg;
    setTimeout(() => {
        if (msgDiv.textContent === msg) msgDiv.textContent = '';
    }, 3000);
}

// Événements
document.getElementById('createRoomBtn').onclick = () => createRoom();
document.getElementById('joinRoomBtn').onclick = () => showScreen('join');
document.getElementById('confirmJoinBtn').onclick = () => joinRoom();
document.getElementById('backFromCreateBtn').onclick = () => leaveGame();
document.getElementById('backFromJoinBtn').onclick = () => showScreen('home');
document.getElementById('resetGameBtn').onclick = () => resetGame();
document.getElementById('leaveGameBtn').onclick = () => leaveGame();
document.getElementById('copyCodeBtn').onclick = () => {
    navigator.clipboard.writeText(currentRoomCode);
    showMessage('Code copié !');
};

playerId = generatePlayerId();
showScreen('home');