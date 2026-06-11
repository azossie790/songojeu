const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const gameLogic = require('./gameLogic');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Utilisation d'un Map pour les salles (plus fiable)
const rooms = new Map();

function generateRoomCode() {
    // Codes plus lisibles
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
    let code;
    do {
        code = '';
        for (let i = 0; i < 6; i++) {
            code += chars[Math.floor(Math.random() * chars.length)];
        }
    } while (rooms.has(code));
    return code;
}

// API: Créer une partie
app.post('/api/create-room', (req, res) => {
    const code = generateRoomCode();
    const roomId = crypto.randomUUID(); // ID interne unique
    
    rooms.set(code, {
        id: roomId,
        gameState: gameLogic.createInitialState(),
        players: { sud: null, nord: null },
        playerSessions: new Map(),
        createdAt: Date.now(),
        lastActivity: Date.now()
    });
    
    console.log(`[SERVER] Salle créée: ${code} - Total salles: ${rooms.size}`);
    
    res.json({ success: true, roomCode: code });
});

// API: Rejoindre
app.post('/api/join-room', (req, res) => {
    const { roomCode, playerId } = req.body;
    const room = rooms.get(roomCode);
    
    console.log(`[SERVER] Tentative join: code=${roomCode}, player=${playerId?.substring(0,8)}...`);
    
    if (!room) {
        console.log(`[SERVER] Salle ${roomCode} inexistante`);
        return res.json({ success: false, reason: "Code invalide" });
    }
    
    room.lastActivity = Date.now();
    
    if (!room.players.sud) {
        room.players.sud = playerId;
        room.playerSessions.set(playerId, { camp: gameLogic.SUD });
        console.log(`[SERVER] ${playerId} rejoint comme SUD dans ${roomCode}`);
        return res.json({ success: true, camp: gameLogic.SUD, roomCode });
    } 
    else if (!room.players.nord && room.players.sud !== playerId) {
        room.players.nord = playerId;
        room.playerSessions.set(playerId, { camp: gameLogic.NORD });
        console.log(`[SERVER] ${playerId} rejoint comme NORD dans ${roomCode} - PARTIE PRÊTE !`);
        return res.json({ success: true, camp: gameLogic.NORD, roomCode });
    }
    else if (room.players.sud === playerId || room.players.nord === playerId) {
        const camp = room.playerSessions.get(playerId)?.camp;
        console.log(`[SERVER] ${playerId} rejoint comme ${camp} (reconnexion)`);
        return res.json({ success: true, camp, roomCode });
    }
    
    return res.json({ success: false, reason: "Partie pleine" });
});

// API: État du jeu
app.get('/api/game-state/:roomCode', (req, res) => {
    const room = rooms.get(req.params.roomCode);
    const { playerId } = req.query;
    
    if (!room) {
        return res.json({ gameActive: false, error: "Salle inexistante" });
    }
    
    const hasBothPlayers = room.players.sud && room.players.nord;
    const myCamp = playerId ? room.playerSessions.get(playerId)?.camp : null;
    
    // Log de debug (désactivable)
    // console.log(`[STATE] Salle ${req.params.roomCode}: sud=${!!room.players.sud}, nord=${!!room.players.nord}`);
    
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
    const room = rooms.get(req.params.roomCode);
    const { playerId, caseIndex } = req.body;
    
    if (!room) {
        return res.json({ success: false, reason: "Salle inexistante" });
    }
    
    if (!room.playerSessions.has(playerId)) {
        return res.json({ success: false, reason: "Joueur non reconnu" });
    }
    
    const camp = room.playerSessions.get(playerId).camp;
    const game = room.gameState;
    
    if (!game.gameActive) {
        return res.json({ success: false, reason: "Partie terminée" });
    }
    
    if (game.currentTurn !== camp) {
        return res.json({ success: false, reason: "Ce n'est pas votre tour" });
    }
    
    if (!room.players.sud || !room.players.nord) {
        return res.json({ success: false, reason: "En attente d'un adversaire" });
    }
    
    const result = gameLogic.executeMove(game.board, game.scores, camp, caseIndex);
    
    if (!result.success) {
        return res.json({ success: false, reason: result.reason });
    }
    
    game.lastMove = { player: camp, caseIndex, timestamp: Date.now() };
    
    const gameEnded = gameLogic.checkGameOver(game.board, game.scores, game);
    
    if (!gameEnded) {
        game.currentTurn = gameLogic.getAdversaire(camp);
    }
    
    room.lastActivity = Date.now();
    res.json({ success: true });
});

// API: Réinitialiser
app.post('/api/reset/:roomCode', (req, res) => {
    const room = rooms.get(req.params.roomCode);
    if (room) {
        room.gameState = gameLogic.createInitialState();
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

// Nettoyage des salles inactives (toutes les 5 minutes)
setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
        if (now - room.lastActivity > 3600000) { // 1h d'inactivité
            rooms.delete(code);
            console.log(`[CLEANUP] Salle ${code} supprimée (inactive)`);
        }
    }
}, 300000);

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Serveur Awélé sur http://localhost:${PORT}`);
    console.log(`Process ID: ${process.pid}`);
});
