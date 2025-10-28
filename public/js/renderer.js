class BoardRenderer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.board = null;
    this.baseScale = 80; // Increased from 60 for larger board
    this.scale = 80;
    this.displayWidth = 0;
    this.displayHeight = 0;
    this.pixelRatio = window.devicePixelRatio || 1;
    this.zoom = 1.0;
    this.minZoom = 0.5;
    this.maxZoom = 3.0;
    this.offsetX = 0;
    this.offsetY = 0;
    this.isPanning = false;
    this.panStart = { x: 0, y: 0 };
    this.selectedVertex = null;
    this.selectedEdge = null;
    this.buildMode = null; // 'settlement', 'road', 'city'
    this.hoveredVertex = null;
    this.hoveredEdge = null;
    this.currentRoll = null;

    this.colors = {
      forest: '#228B22',
      pasture: '#90EE90',
      fields: '#FFD700',
      hills: '#CD853F',
      mountains: '#808080',
      desert: '#DEB887',
      water: '#4a90a4'
    };

    this.playerColors = {
      red: '#ff6b6b',
      blue: '#4dabf7',
      white: '#f8f9fa',
      orange: '#ff922b'
    };

    this.resizeCanvas();
    this.centerBoard();
    this.setupEventListeners();
  }

  resizeCanvas() {
    const container = this.canvas.parentElement;
    this.displayWidth = container.clientWidth;
    this.displayHeight = container.clientHeight;

    this.pixelRatio = window.devicePixelRatio || 1;

    this.canvas.style.width = `${this.displayWidth}px`;
    this.canvas.style.height = `${this.displayHeight}px`;

    this.canvas.width = Math.round(this.displayWidth * this.pixelRatio);
    this.canvas.height = Math.round(this.displayHeight * this.pixelRatio);

    this.ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    this.centerBoard();
    if (this.board) {
      this.render();
    }
  }

  centerBoard() {
    this.offsetX = this.displayWidth / 2;
    this.offsetY = this.displayHeight / 2;
  }

  setupEventListeners() {
    this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    this.canvas.addEventListener('click', (e) => this.handleClick(e));
    this.canvas.addEventListener('wheel', (e) => this.handleWheel(e));
    this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
    this.canvas.addEventListener('mouseleave', (e) => this.handleMouseUp(e));
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  handleWheel(e) {
    e.preventDefault();

    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Calculate world position before zoom
    const worldXBefore = (mouseX - this.offsetX) / this.scale;
    const worldYBefore = (mouseY - this.offsetY) / this.scale;

    // Update zoom
    const zoomDelta = e.deltaY > 0 ? 0.9 : 1.1;
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * zoomDelta));
    this.scale = this.baseScale * this.zoom;

    // Calculate world position after zoom
    const worldXAfter = (mouseX - this.offsetX) / this.scale;
    const worldYAfter = (mouseY - this.offsetY) / this.scale;

    // Adjust offset to keep mouse position fixed
    this.offsetX += (worldXAfter - worldXBefore) * this.scale;
    this.offsetY += (worldYAfter - worldYBefore) * this.scale;

    this.render();
  }

  handleMouseDown(e) {
    if (e.button === 0 && !this.buildMode) {
      // Only pan if not in build mode
      this.isPanning = true;
      this.panStart = { x: e.clientX, y: e.clientY };
      this.canvas.style.cursor = 'grabbing';
    }
  }

  handleMouseUp(e) {
    if (this.isPanning) {
      this.isPanning = false;
      this.canvas.style.cursor = 'default';
    }
  }

  setBoard(board) {
    this.board = board;
    this.render();
  }

  setRoll(roll) {
    this.currentRoll = roll;
    this.render();
  }

  setBuildMode(mode) {
    this.buildMode = mode;
    this.selectedVertex = null;
    this.selectedEdge = null;
  }

  clearBuildMode() {
    this.buildMode = null;
    this.selectedVertex = null;
    this.selectedEdge = null;
    this.hoveredVertex = null;
    this.hoveredEdge = null;
    this.hoveredHex = null;
    this.render();
  }

  handleMouseMove(e) {
    if (!this.board) return;

    // Handle panning
    if (this.isPanning) {
      const dx = e.clientX - this.panStart.x;
      const dy = e.clientY - this.panStart.y;
      this.offsetX += dx;
      this.offsetY += dy;
      this.panStart = { x: e.clientX, y: e.clientY };
      this.render();
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check if we're in robber mode (either from rolling 7 or playing Knight card)
    const gameClient = window.gameClient;
    const isRobberMode = (gameClient && gameClient.gameState && gameClient.gameState.turnPhase === 'robber') || this.buildMode === 'robber';

    if (isRobberMode) {
      // Find hovered hex
      this.hoveredHex = null;
      this.board.hexes.forEach(hex => {
        if (this.isPointInHex(x, y, hex)) {
          this.hoveredHex = hex;
        }
      });
      this.render();
    } else if (this.buildMode) {
      if (this.buildMode === 'settlement' || this.buildMode === 'city') {
        // Find nearest vertex
        let minDist = 20;
        this.hoveredVertex = null;

        this.board.vertices.forEach(vertex => {
          const screenPos = this.hexToScreen(vertex.x, vertex.y);
          const dist = Math.sqrt((x - screenPos.x) ** 2 + (y - screenPos.y) ** 2);
          if (dist < minDist) {
            minDist = dist;
            this.hoveredVertex = vertex;
          }
        });

        this.render();
      } else if (this.buildMode === 'road') {
        // Find nearest edge
        let minDist = 15;
        this.hoveredEdge = null;

        this.board.edges.forEach(edge => {
          const p1 = this.hexToScreen(edge.v1.x, edge.v1.y);
          const p2 = this.hexToScreen(edge.v2.x, edge.v2.y);
          const dist = this.pointToLineDistance(x, y, p1.x, p1.y, p2.x, p2.y);
          if (dist < minDist) {
            minDist = dist;
            this.hoveredEdge = edge;
          }
        });

        this.render();
      }
    }
  }

  isPointInHex(px, py, hex) {
    // Convert axial coordinates to screen coordinates
    const size = this.scale;
    const x = size * (3/2 * hex.q);
    const y = size * (Math.sqrt(3)/2 * hex.q + Math.sqrt(3) * hex.r);
    const centerX = this.offsetX + x;
    const centerY = this.offsetY + y;

    // Check if point is within hexagon using distance from center
    const dx = px - centerX;
    const dy = py - centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    return dist < size * 0.9; // Slightly smaller than actual hex for better UX
  }

  handleClick(e) {
    if (!this.board) return;

    const gameClient = window.gameClient;

    // Don't allow clicks if spectating
    if (gameClient && gameClient.isSpectator) return;

    const isRobberMode = (gameClient && gameClient.gameState && gameClient.gameState.turnPhase === 'robber') || this.buildMode === 'robber';

    if (isRobberMode && this.hoveredHex) {
      // Handle hex click for robber movement
      if (gameClient) {
        gameClient.handleHexClick(this.hoveredHex);
      }
      return;
    }

    if (!this.buildMode) return;

    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (this.buildMode === 'settlement' || this.buildMode === 'city') {
      if (this.hoveredVertex) {
        this.selectedVertex = this.hoveredVertex;
        if (window.gameClient) {
          window.gameClient.handleVertexClick(this.selectedVertex);
        }
      }
    } else if (this.buildMode === 'road') {
      if (this.hoveredEdge) {
        this.selectedEdge = this.hoveredEdge;
        if (window.gameClient) {
          window.gameClient.handleEdgeClick(this.selectedEdge);
        }
      }
    }
  }

  pointToLineDistance(px, py, x1, y1, x2, y2) {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;

    if (lenSq !== 0) param = dot / lenSq;

    let xx, yy;

    if (param < 0) {
      xx = x1;
      yy = y1;
    } else if (param > 1) {
      xx = x2;
      yy = y2;
    } else {
      xx = x1 + param * C;
      yy = y1 + param * D;
    }

    const dx = px - xx;
    const dy = py - yy;
    return Math.sqrt(dx * dx + dy * dy);
  }

  hexToScreen(hexX, hexY) {
    return {
      x: this.offsetX + hexX * this.scale,
      y: this.offsetY + hexY * this.scale
    };
  }

  render() {
    if (!this.board) return;

    this.ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);

    // Clear canvas
    this.ctx.fillStyle = this.colors.water;
    this.ctx.fillRect(0, 0, this.displayWidth, this.displayHeight);

    // Draw hexes
    this.board.hexes.forEach(hex => {
      this.drawHex(hex);
    });

    // Draw ports
    if (this.board.ports) {
      this.board.ports.forEach(port => {
        this.drawPort(port);
      });
    }

    // Draw green borders for rolled hexes (before roads/buildings)
    if (this.currentRoll) {
      this.board.hexes.forEach(hex => {
        if (hex.number === this.currentRoll) {
          const size = this.scale;
          const x = size * (3/2 * hex.q);
          const y = size * (Math.sqrt(3)/2 * hex.q + Math.sqrt(3) * hex.r);
          const centerX = this.offsetX + x;
          const centerY = this.offsetY + y;

          this.ctx.strokeStyle = '#00ff00';
          this.ctx.lineWidth = 4;
          this.ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const angle = Math.PI / 3 * i;
            const vx = centerX + size * Math.cos(angle);
            const vy = centerY + size * Math.sin(angle);
            if (i === 0) {
              this.ctx.moveTo(vx, vy);
            } else {
              this.ctx.lineTo(vx, vy);
            }
          }
          this.ctx.closePath();
          this.ctx.stroke();
        }
      });
    }

    // Draw edges (roads) - on top of green borders
    this.board.edges.forEach(edge => {
      this.drawEdge(edge);
    });

    // Draw vertices (settlements/cities) - on top of green borders
    this.board.vertices.forEach(vertex => {
      this.drawVertex(vertex);
    });

    // Draw hovered elements
    if (this.hoveredHex) {
      // Highlight hovered hex for robber placement
      const size = this.scale;
      const x = size * (3/2 * this.hoveredHex.q);
      const y = size * (Math.sqrt(3)/2 * this.hoveredHex.q + Math.sqrt(3) * this.hoveredHex.r);
      const centerX = this.offsetX + x;
      const centerY = this.offsetY + y;

      this.ctx.strokeStyle = this.hoveredHex.hasRobber ? '#ff0000' : '#ffff00';
      this.ctx.lineWidth = 4;
      this.ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = Math.PI / 3 * i;
        const vx = centerX + size * Math.cos(angle);
        const vy = centerY + size * Math.sin(angle);
        if (i === 0) {
          this.ctx.moveTo(vx, vy);
        } else {
          this.ctx.lineTo(vx, vy);
        }
      }
      this.ctx.closePath();
      this.ctx.stroke();
    }

    if (this.hoveredVertex) {
      const pos = this.hexToScreen(this.hoveredVertex.x, this.hoveredVertex.y);
      this.ctx.strokeStyle = '#ffff00';
      this.ctx.lineWidth = 3;
      this.ctx.beginPath();
      this.ctx.arc(pos.x, pos.y, 12, 0, Math.PI * 2);
      this.ctx.stroke();
    }

    if (this.hoveredEdge) {
      const p1 = this.hexToScreen(this.hoveredEdge.v1.x, this.hoveredEdge.v1.y);
      const p2 = this.hexToScreen(this.hoveredEdge.v2.x, this.hoveredEdge.v2.y);
      this.ctx.strokeStyle = '#ffff00';
      this.ctx.lineWidth = 6;
      this.ctx.beginPath();
      this.ctx.moveTo(p1.x, p1.y);
      this.ctx.lineTo(p2.x, p2.y);
      this.ctx.stroke();
    }
  }

  drawHex(hex) {
    // Convert axial coordinates (q, r) to screen coordinates
    // Using flat-topped hexagon layout
    const size = this.scale;
    const x = size * (3/2 * hex.q);
    const y = size * (Math.sqrt(3)/2 * hex.q + Math.sqrt(3) * hex.r);

    const centerX = this.offsetX + x;
    const centerY = this.offsetY + y;

    // Draw hexagon (flat-topped, starting from right vertex)
    this.ctx.fillStyle = this.colors[hex.terrain];
    this.ctx.strokeStyle = '#333';
    this.ctx.lineWidth = 2;

    this.ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = Math.PI / 3 * i;
      const vx = centerX + size * Math.cos(angle);
      const vy = centerY + size * Math.sin(angle);
      if (i === 0) {
        this.ctx.moveTo(vx, vy);
      } else {
        this.ctx.lineTo(vx, vy);
      }
    }
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.stroke();

    // Draw number token
    if (hex.number) {
      this.ctx.fillStyle = '#f0e68c';
      this.ctx.strokeStyle = '#333';

      this.ctx.beginPath();
      this.ctx.arc(centerX, centerY, 20, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.stroke();

      this.ctx.fillStyle = hex.number === 6 || hex.number === 8 ? '#ff0000' : '#000';
      this.ctx.font = 'bold 18px Arial';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(hex.number.toString(), centerX, centerY);

      // Draw dots
      const dots = hex.number === 6 || hex.number === 8 ? 5 :
                   hex.number === 5 || hex.number === 9 ? 4 :
                   hex.number === 4 || hex.number === 10 ? 3 :
                   hex.number === 3 || hex.number === 11 ? 2 : 1;

      this.ctx.fillStyle = '#000';
      const dotSpacing = 5;
      const totalWidth = (dots - 1) * dotSpacing;
      const startX = centerX - totalWidth / 2;
      for (let i = 0; i < dots; i++) {
        this.ctx.beginPath();
        this.ctx.arc(startX + i * dotSpacing, centerY + 12, 2, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }

    // Draw robber
    if (hex.hasRobber) {
      this.ctx.fillStyle = '#000';
      this.ctx.beginPath();
      this.ctx.arc(centerX, centerY, 15, 0, Math.PI * 2);
      this.ctx.fill();

      this.ctx.fillStyle = '#fff';
      this.ctx.font = 'bold 12px Arial';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText('R', centerX, centerY);
    }
  }

  drawPort(port) {
    // Draw port between two vertices
    const v1 = this.hexToScreen(port.vertices[0].x, port.vertices[0].y);
    const v2 = this.hexToScreen(port.vertices[1].x, port.vertices[1].y);

    // Calculate midpoint between the two vertices
    const midX = (v1.x + v2.x) / 2;
    const midY = (v1.y + v2.y) / 2;

    // Get the hex center in screen coordinates to determine outward direction
    // Using the same formula as in drawHex
    const size = this.scale;
    const x = size * (3/2 * port.hex.q);
    const y = size * (Math.sqrt(3)/2 * port.hex.q + Math.sqrt(3) * port.hex.r);
    const hexCenterX = this.offsetX + x;
    const hexCenterY = this.offsetY + y;

    // Calculate direction from hex center to midpoint (pointing outward)
    const toMidX = midX - hexCenterX;
    const toMidY = midY - hexCenterY;
    const toMidLength = Math.sqrt(toMidX * toMidX + toMidY * toMidY);

    // Normalize the direction
    const dirX = toMidX / toMidLength;
    const dirY = toMidY / toMidLength;

    // Offset the port icon outward from the board
    const offset = 42;
    const portX = midX + dirX * offset;
    const portY = midY + dirY * offset;

    // Draw connection lines to vertices FIRST (so they appear behind the port chip)
    this.ctx.strokeStyle = '#f5deb3';
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([3, 3]);
    this.ctx.beginPath();
    this.ctx.moveTo(v1.x, v1.y);
    this.ctx.lineTo(portX, portY);
    this.ctx.moveTo(v2.x, v2.y);
    this.ctx.lineTo(portX, portY);
    this.ctx.stroke();
    this.ctx.setLineDash([]);

    // Draw port background (on top of the lines)
    this.ctx.fillStyle = '#f5deb3';
    this.ctx.strokeStyle = '#8b7355';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.arc(portX, portY, 18, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.stroke();

    // Draw port text
    this.ctx.fillStyle = '#000';
    this.ctx.font = 'bold 11px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';

    if (port.type === '3:1') {
      this.ctx.fillText('3:1', portX, portY - 4);
      this.ctx.font = '9px Arial';
      this.ctx.fillText('?', portX, portY + 6);
    } else if (port.type === '2:1') {
      this.ctx.fillText('2:1', portX, portY - 4);

      // Draw resource emoji
      this.ctx.font = '10px Arial';
      const resourceEmoji = {
        wood: '🌲',
        brick: '🧱',
        sheep: '🐑',
        wheat: '🌾',
        ore: '⛰️'
      };

      this.ctx.fillStyle = '#000';
      this.ctx.fillText(resourceEmoji[port.resource] || '?', portX, portY + 7);
    }
  }

  drawVertex(vertex) {
    const pos = this.hexToScreen(vertex.x, vertex.y);

    if (vertex.building === 'settlement') {
      // Draw settlement (small house shape)
      const color = this.playerColors[this.getPlayerColor(vertex.playerId)];
      this.ctx.fillStyle = color;
      this.ctx.strokeStyle = '#000';
      this.ctx.lineWidth = 2;

      this.ctx.beginPath();
      this.ctx.moveTo(pos.x, pos.y - 8);
      this.ctx.lineTo(pos.x + 6, pos.y - 2);
      this.ctx.lineTo(pos.x + 6, pos.y + 6);
      this.ctx.lineTo(pos.x - 6, pos.y + 6);
      this.ctx.lineTo(pos.x - 6, pos.y - 2);
      this.ctx.closePath();
      this.ctx.fill();
      this.ctx.stroke();
    } else if (vertex.building === 'city') {
      // Draw city (larger building)
      const color = this.playerColors[this.getPlayerColor(vertex.playerId)];
      this.ctx.fillStyle = color;
      this.ctx.strokeStyle = '#000';
      this.ctx.lineWidth = 2;

      // Two towers
      this.ctx.fillRect(pos.x - 8, pos.y - 4, 6, 10);
      this.ctx.strokeRect(pos.x - 8, pos.y - 4, 6, 10);
      this.ctx.fillRect(pos.x + 2, pos.y - 8, 6, 14);
      this.ctx.strokeRect(pos.x + 2, pos.y - 8, 6, 14);
    } else if (!this.buildMode || (this.buildMode && this.hoveredVertex !== vertex)) {
      // Draw empty vertex point (small)
      this.ctx.fillStyle = '#fff';
      this.ctx.strokeStyle = '#666';
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.arc(pos.x, pos.y, 3, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.stroke();
    }
  }

  drawEdge(edge) {
    const p1 = this.hexToScreen(edge.v1.x, edge.v1.y);
    const p2 = this.hexToScreen(edge.v2.x, edge.v2.y);

    if (edge.road) {
      const color = this.playerColors[this.getPlayerColor(edge.playerId)];
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = 5;
      this.ctx.lineCap = 'round';
      this.ctx.beginPath();
      this.ctx.moveTo(p1.x, p1.y);
      this.ctx.lineTo(p2.x, p2.y);
      this.ctx.stroke();

      // Black outline
      this.ctx.strokeStyle = '#000';
      this.ctx.lineWidth = 7;
      this.ctx.globalAlpha = 0.3;
      this.ctx.beginPath();
      this.ctx.moveTo(p1.x, p1.y);
      this.ctx.lineTo(p2.x, p2.y);
      this.ctx.stroke();
      this.ctx.globalAlpha = 1;
    }
  }

  getPlayerColor(playerId) {
    // This should be provided by the game state
    // For now, return a default
    if (window.gameClient && window.gameClient.gameState) {
      const player = window.gameClient.gameState.players.find(p => p.id === playerId);
      return player ? player.color : 'white';
    }
    return 'white';
  }

  addLogMessage(message) {
    const log = document.getElementById('gameLog');
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.textContent = `${new Date().toLocaleTimeString()}: ${message}`;
    log.appendChild(entry);
    log.scrollTop = log.scrollHeight;
  }
}
