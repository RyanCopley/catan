"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shuffle = shuffle;
exports.generateGameId = generateGameId;
function shuffle(array) {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}
function generateGameId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}
//# sourceMappingURL=utils.js.map