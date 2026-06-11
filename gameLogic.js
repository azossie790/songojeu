// gameLogic.js - Logique métier du jeu Awélé

const INITIAL_SEEDS = 5;
const WINNING_SCORE = 40;

const SUD = 'sud';
const NORD = 'nord';

function getNextPosition(camp, index) {
    if (camp === SUD) {
        if (index < 6) {
            return { camp: SUD, index: index + 1 };
        } else {
            return { camp: NORD, index: 6 };
        }
    } else {
        if (index > 0) {
            return { camp: NORD, index: index - 1 };
        } else {
            return { camp: SUD, index: 0 };
        }
    }
}

function getAdversaire(camp) {
    return camp === SUD ? NORD : SUD;
}

function copyBoard(board) {
    return {
        sud: [...board.sud],
        nord: [...board.nord]
    };
}

function simulateSeedsInAdversaire(board, joueur, caseIndex) {
    let graines = board[joueur][caseIndex];
    let pos = { camp: joueur, index: caseIndex };
    let seedsInAdversaire = 0;
    
    for (let g = 0; g < graines; g++) {
        pos = getNextPosition(pos.camp, pos.index);
        if (pos.camp === getAdversaire(joueur)) {
            seedsInAdversaire++;
        }
    }
    return seedsInAdversaire;
}

function isCampEmpty(board, camp) {
    return board[camp].every(seeds => seeds === 0);
}

function checkSolidarite(board, joueur, moveIndex) {
    const adversaire = getAdversaire(joueur);
    if (!isCampEmpty(board, adversaire)) return { possible: true, seedsGiven: 0 };
    
    let bestSeeds = 0;
    
    for (let i = 0; i < 7; i++) {
        if (board[joueur][i] === 0) continue;
        
        let graines = board[joueur][i];
        let pos = { camp: joueur, index: i };
        let seedsInAdversaire = 0;
        
        for (let g = 0; g < graines; g++) {
            pos = getNextPosition(pos.camp, pos.index);
            if (pos.camp === adversaire) {
                seedsInAdversaire++;
            }
        }
        
        if (seedsInAdversaire > bestSeeds) {
            bestSeeds = seedsInAdversaire;
        }
    }
    
    if (bestSeeds >= 7) {
        return { possible: true, seedsGiven: bestSeeds };
    } else if (bestSeeds > 0) {
        let simulatedSeeds = simulateSeedsInAdversaire(board, joueur, moveIndex);
        if (simulatedSeeds === bestSeeds) {
            return { possible: true, seedsGiven: simulatedSeeds };
        } else {
            return { possible: false, seedsGiven: 0, required: bestSeeds };
        }
    } else {
        return { possible: false, seedsGiven: 0, gameOver: true };
    }
}

function isMoveAllowed(board, joueur, caseIndex) {
    const seeds = board[joueur][caseIndex];
    if (seeds === 0) return { allowed: false, reason: "Case vide" };
    
    if (caseIndex === 6) {
        let seedsInAdversaire = simulateSeedsInAdversaire(board, joueur, caseIndex);
        if (seedsInAdversaire === 1 || seedsInAdversaire === 2) {
            return { allowed: false, reason: `Case 7 ne peut pas semer ${seedsInAdversaire} graine(s) chez l'adversaire` };
        }
    }
    
    const adversaire = getAdversaire(joueur);
    let tempBoard = copyBoard(board);
    tempBoard[joueur][caseIndex] = 0;
    let graines = seeds;
    let pos = { camp: joueur, index: caseIndex };
    
    for (let g = 0; g < graines; g++) {
        pos = getNextPosition(pos.camp, pos.index);
        tempBoard[pos.camp][pos.index] += 1;
    }
    
    if (tempBoard[adversaire].every(s => s === 0)) {
        return { allowed: false, reason: "Ce coup viderait le camp adverse" };
    }
    
    return { allowed: true };
}

function handleSpecialCaseOne(board, lastCamp, lastIndex, totalDistributed, joueur, scores) {
    if (lastCamp === getAdversaire(joueur) && lastIndex === 0 && totalDistributed >= 14) {
        if (board[lastCamp][lastIndex] > 0) {
            board[lastCamp][lastIndex] -= 1;
            scores[joueur] += 1;
            return { handled: true, collected: 1 };
        }
    }
    return { handled: false, collected: 0 };
}

function collectSeeds(board, lastCamp, lastIndex, joueur, scores) {
    let adversaire = getAdversaire(joueur);
    let collected = 0;
    let collectPositions = [];
    let currentIndex = lastIndex;
    
    while (currentIndex >= 0 && board[adversaire][currentIndex] >= 2 && board[adversaire][currentIndex] <= 4) {
        if (currentIndex === 0 && lastCamp === adversaire && lastIndex === 0) {
            break;
        }
        collected += board[adversaire][currentIndex];
        collectPositions.push({ camp: adversaire, index: currentIndex });
        currentIndex--;
    }
    
    for (let pos of collectPositions) {
        board[pos.camp][pos.index] = 0;
    }
    
    if (collected > 0) {
        scores[joueur] += collected;
    }
    
    return collected;
}

function checkGameOver(board, scores, gameState) {
    const totalSeeds = board.sud.reduce((a, b) => a + b, 0) + board.nord.reduce((a, b) => a + b, 0);
    
    if (scores.sud >= WINNING_SCORE) {
        gameState.gameActive = false;
        gameState.winner = SUD;
        gameState.winnerScore = scores.sud;
        return true;
    }
    if (scores.nord >= WINNING_SCORE) {
        gameState.gameActive = false;
        gameState.winner = NORD;
        gameState.winnerScore = scores.nord;
        return true;
    }
    
    if (totalSeeds < 10) {
        gameState.gameActive = false;
        if (scores.sud > scores.nord) {
            gameState.winner = SUD;
            gameState.winnerScore = scores.sud;
        } else if (scores.nord > scores.sud) {
            gameState.winner = NORD;
            gameState.winnerScore = scores.nord;
        } else {
            gameState.winner = null;
        }
        return true;
    }
    
    return false;
}

function executeMove(board, scores, joueur, caseIndex) {
    const solidarite = checkSolidarite(board, joueur, caseIndex);
    if (!solidarite.possible) {
        if (solidarite.gameOver) {
            return { success: false, gameOver: true, reason: "Solidarité impossible" };
        }
        return { success: false, reason: `Solidarité: besoin de ${solidarite.required} graines` };
    }
    
    const allowed = isMoveAllowed(board, joueur, caseIndex);
    if (!allowed.allowed) {
        return { success: false, reason: allowed.reason };
    }
    
    let seeds = board[joueur][caseIndex];
    board[joueur][caseIndex] = 0;
    
    let pos = { camp: joueur, index: caseIndex };
    let totalDistributed = seeds;
    
    for (let i = 0; i < seeds; i++) {
        pos = getNextPosition(pos.camp, pos.index);
        board[pos.camp][pos.index] += 1;
    }
    
    let specialHandled = handleSpecialCaseOne(board, pos.camp, pos.index, totalDistributed, joueur, scores);
    
    if (!specialHandled.handled && pos.camp !== joueur) {
        if (!(pos.camp === getAdversaire(joueur) && pos.index === 0)) {
            if (board[pos.camp][pos.index] >= 2 && board[pos.camp][pos.index] <= 4) {
                collectSeeds(board, pos.camp, pos.index, joueur, scores);
            }
        }
    }
    
    return { success: true };
}

function createInitialState() {
    return {
        board: {
            sud: new Array(7).fill(INITIAL_SEEDS),
            nord: new Array(7).fill(INITIAL_SEEDS)
        },
        scores: { sud: 0, nord: 0 },
        currentTurn: SUD,
        gameActive: true,
        winner: null,
        winnerScore: 0,
        lastMove: null
    };
}

module.exports = {
    SUD, NORD,
    INITIAL_SEEDS, WINNING_SCORE,
    getNextPosition,
    getAdversaire,
    copyBoard,
    isCampEmpty,
    checkSolidarite,
    isMoveAllowed,
    handleSpecialCaseOne,
    collectSeeds,
    checkGameOver,
    executeMove,
    createInitialState
};