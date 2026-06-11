const express = require('express');
const cors = require('cors');
const path = require('path');
const gameLogic = require('./gameLogic');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Stockage des salles
const rooms = {};

// Générer un code aléatoire à 6 caractères
function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

// Nettoyer les salles vides toutes les heures
setInterval(() => {
    for (const [code, room] of Object.entries(rooms)) {
        const now = Date.now();
        if (room.gameState.gameActive === false && now - room.createdAt > 3600000) {
            delete rooms[code];
        }
        if (room.players.sud === null && room.players.nord === null && now - room.createdAt > 1800000) {
            delete rooms[code];
        }
    }
}, 3600000);

// API: Créer une partie
app.post('/api/create-room', (req, res) => {
    let code = generateRoomCode();
    while (rooms[code]) {
        code = generateRoomCode();
    }
    
    rooms[code] = {
        gameState: gameLogic.createInitialState(),
        players: { sud: null, nord: null },
        playerSessions: {},
        createdAt: Date.now()
    };
    
    res.json({ success: true, roomCode: code });
});

// API: Rejoindre une partie
app.post('/api/join-room', (req, res) => {
    const { roomCode, playerId } = req.body;
    const room = rooms[roomCode];
    
    if (!room) {
        return res.json({ success: false, reason: "Code invalide" });
    }
    
    if (!room.players.sud) {
        room.players.sud = playerId;
        room.playerSessions[playerId] = { camp: gameLogic.SUD, roomCode };
        return res.json({ success: true, camp: gameLogic.SUD, roomCode, message: "Vous êtes SUD" });
    } 
    else if (!room.players.nord && room.players.sud !== playerId) {
        room.players.nord = playerId;
        room.playerSessions[playerId] = { camp: gameLogic.NORD, roomCode };
        return res.json({ success: true, camp: gameLogic.NORD, roomCode, message: "Vous êtes NORD" });
    }
    else if (room.players.sud === playerId || room.players.nord === playerId) {
        const camp = room.playerSessions[playerId]?.camp;
        return res.json({ success: true, camp, roomCode, message: "Reconnexion" });
    }
    else {
        return res.json({ success: false, reason: "Partie pleine" });
    }
});

// API: État du jeu
app.get('/api/game-state/:roomCode', (req, res) => {
    const room = rooms[req.params.roomCode];
    const { playerId } = req.query;
    
    if (!room) {
        return res.json({ gameActive: false, error: "Salle inexistante" });
    }
    
    const hasBothPlayers = room.players.sud && room.players.nord;
    const myCamp = playerId ? room.playerSessions[playerId]?.camp : null;
    
    res.json({
        board: hasBothPlayers ? room.gameState.board : null,
        scores: hasBothPlayers ? room.gameState.scores : null,
        currentTurn: room.gameState.currentTurn,
        gameActive: room.gameState.gameActive,
        winner: room.gameState.winner,
        winnerScore: room.gameState.winnerScore,
        waiting: !hasBothPlayers,
        myCamp: myCamp,
        players: {
            sud: !!room.players.sud,
            nord: !!room.players.nord
        }
    });
});

// API: Jouer un coup
app.post('/api/move/:roomCode', (req, res) => {
    const room = rooms[req.params.roomCode];
    const { playerId, caseIndex } = req.body;
    
    if (!room) {
        return res.json({ success: false, reason: "Salle inexistante" });
    }
    
    if (!room.playerSessions[playerId]) {
        return res.json({ success: false, reason: "Joueur non reconnu" });
    }
    
    const camp = room.playerSessions[playerId].camp;
    
    if (!room.gameState.gameActive) {
        return res.json({ success: false, reason: "Partie terminée", gameOver: true });
    }
    
    if (room.gameState.currentTurn !== camp) {
        return res.json({ success: false, reason: "Ce n'est pas votre tour" });
    }
    
    if (!room.players.sud || !room.players.nord) {
        return res.json({ success: false, reason: "En attente d'un adversaire" });
    }
    
    const result = gameLogic.executeMove(room.gameState.board, room.gameState.scores, camp, caseIndex);
    
    if (!result.success) {
        return res.json({ success: false, reason: result.reason });
    }
    
    room.gameState.lastMove = { player: camp, caseIndex, timestamp: Date.now() };
    
    const gameEnded = gameLogic.checkGameOver(room.gameState.board, room.gameState.scores, room.gameState);
    
    if (!gameEnded) {
        room.gameState.currentTurn = gameLogic.getAdversaire(camp);
    }
    
    res.json({ success: true });
});

// API: Réinitialiser
app.post('/api/reset/:roomCode', (req, res) => {
    const room = rooms[req.params.roomCode];
    if (room) {
        room.gameState = gameLogic.createInitialState();
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Serveur Awélé sur http://localhost:${PORT}`);
});