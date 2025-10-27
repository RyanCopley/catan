"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const path_1 = __importDefault(require("path"));
const socketHandlers_1 = require("./socketHandlers");
const app = (0, express_1.default)();
const server = (0, http_1.createServer)(app);
const io = new socket_io_1.Server(server);
const PORT = process.env.PORT || 3000;
// Serve static files
app.use(express_1.default.static(path_1.default.join(__dirname, '../public')));
// Store active games
const games = new Map();
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);
    (0, socketHandlers_1.setupSocketHandlers)(io, socket, games);
});
server.listen(PORT, () => {
    console.log(`Catan server running on port ${PORT}`);
});
//# sourceMappingURL=index.js.map