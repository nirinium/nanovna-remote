class NanoVNARemote {
    constructor() {
        this.ws = null;
        this.streaming = false;
        this.lastFrameTime = 0;
        this.zoomLevel = 1.0;
        this.minZoom = 0.5;
        this.maxZoom = 8.0;
        this.panX = 0;
        this.panY = 0;
        this.isPanning = false;
        this.lastPanX = 0;
        this.lastPanY = 0;
        this.lastTouchDistance = 0;
        this.viewMode = true; // true = pan/zoom, false = control
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        this.mouseButtonDown = null;
        
        this.screen = document.getElementById('screen');
        this.screenWrapper = document.getElementById('screenWrapper');
        this.loading = document.getElementById('loading');
        this.status = document.getElementById('status');
        this.latency = document.getElementById('latency');
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.cursor = document.getElementById('cursor');
        this.zoomControls = document.getElementById('zoomControls');
        this.zoomIn = document.getElementById('zoomIn');
        this.zoomOut = document.getElementById('zoomOut');
        this.zoomReset = document.getElementById('zoomReset');
        this.zoomLevelDisplay = document.getElementById('zoomLevel');
        this.toolbar = document.getElementById('toolbar');
        this.toggleToolbar = document.getElementById('toggleToolbar');
        this.textInput = document.getElementById('textInput');
        this.mouseMode = document.getElementById('mouseMode');
        this.modeText = document.getElementById('modeText');
        this.instructions = document.getElementById('instructions');

        this.setupEventListeners();
        this.connect();
    }

    connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            console.log('Connected to server');
            this.status.textContent = 'Connected';
            this.status.classList.add('connected');
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                
                if (data.type === 'frame') {
                    this.screen.src = 'data:image/jpeg;base64,' + data.data;
                    this.screenWrapper.style.display = 'block';
                    this.loading.style.display = 'none';
                    this.zoomControls.style.display = 'flex';
                    this.toggleToolbar.style.display = 'flex';
                    this.mouseMode.style.display = 'block';
                    this.instructions.style.display = 'block';
                    this.updateModeUI();
                    
                    // Calculate latency
                    const now = Date.now();
                    if (this.lastFrameTime) {
                        const fps = Math.round(1000 / (now - this.lastFrameTime));
                        this.latency.textContent = `${fps} FPS`;
                    }
                    this.lastFrameTime = now;
                }
            } catch (error) {
                console.error('Error processing message:', error);
            }
        };

        this.ws.onclose = () => {
            console.log('Disconnected from server');
            this.status.textContent = 'Disconnected';
            this.status.classList.remove('connected');
            this.streaming = false;
            this.updateButtons();
            
            // Reconnect after 2 seconds
            setTimeout(() => this.connect(), 2000);
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    }

    setupEventListeners() {
        this.startBtn.addEventListener('click', () => this.startStream());
        this.stopBtn.addEventListener('click', () => this.stopStream());

        // Zoom controls
        this.zoomIn.addEventListener('click', () => this.zoom(0.2));
        this.zoomOut.addEventListener('click', () => this.zoom(-0.2));
        this.zoomReset.addEventListener('click', () => this.resetZoom());

        // Toolbar controls
        this.toggleToolbar.addEventListener('click', () => {
            this.toolbar.classList.toggle('visible');
        });

        document.getElementById('sendText').addEventListener('click', () => this.sendTextInput());
        document.getElementById('sendEnter').addEventListener('click', () => this.sendKey('enter'));
        document.getElementById('ctrlAltDel').addEventListener('click', () => this.sendKeyCombo(['control', 'alt', 'delete']));
        document.getElementById('ctrlC').addEventListener('click', () => this.sendKeyCombo(['control', 'c']));
        document.getElementById('ctrlV').addEventListener('click', () => this.sendKeyCombo(['control', 'v']));
        document.getElementById('toggleViewMode').addEventListener('click', () => this.toggleMode());

        this.textInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendTextInput();
            }
        });

        // Mouse events
        this.screen.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.screen.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.screen.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.screen.addEventListener('dblclick', (e) => this.handleDoubleClick(e));
        
        // Touch events for mobile
        this.screen.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
        this.screen.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });
        this.screen.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
        
        // Scroll/pinch
        this.screen.addEventListener('wheel', (e) => this.handleWheel(e));

        // Track cursor position
        document.addEventListener('mousemove', (e) => this.updateCursor(e));
        document.addEventListener('touchmove', (e) => this.updateCursorTouch(e));

        // Global mouse up for panning
        document.addEventListener('mouseup', () => {
            this.isPanning = false;
            this.isDragging = false;
        });

        // Prevent context menu and handle right-click
        this.screen.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (!this.viewMode) {
                this.handleRightClick(e);
            }
        });
    }

    startStream() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'start' }));
            this.streaming = true;
            this.updateButtons();
        }
    }

    stopStream() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'stop' }));
            this.streaming = false;
            this.updateButtons();
        }
    }

    updateButtons() {
        this.startBtn.disabled = this.streaming;
        this.stopBtn.disabled = !this.streaming;
    }

    getRelativeCoords(event) {
        const rect = this.screen.getBoundingClientRect();
        // Calculate position relative to the actual image, accounting for zoom and pan
        let x = (event.clientX - rect.left) / rect.width;
        let y = (event.clientY - rect.top) / rect.height;
        
        // Clamp to [0, 1] range
        x = Math.max(0, Math.min(1, x));
        y = Math.max(0, Math.min(1, y));
        
        return { x, y };
    }

    handleMouseDown(event) {
        event.preventDefault();
        if (!this.streaming) return;
        
        if (this.viewMode) {
            // Pan mode - drag to pan the view
            this.isPanning = true;
            this.lastPanX = event.clientX;
            this.lastPanY = event.clientY;
            this.screen.style.cursor = 'grabbing';
        } else {
            // Control mode - send click to remote
            const coords = this.getRelativeCoords(event);
            const button = event.button === 2 ? 'right' : event.button === 1 ? 'middle' : 'left';
            this.mouseButtonDown = button;
            this.send({ type: 'mousedown', x: coords.x, y: coords.y, button });
        }
    }

    handleMouseUp(event) {
        event.preventDefault();
        if (!this.streaming) return;
        
        if (this.viewMode) {
            this.isPanning = false;
            this.screen.style.cursor = 'grab';
        } else if (this.mouseButtonDown) {
            const coords = this.getRelativeCoords(event);
            this.send({ type: 'mouseup', x: coords.x, y: coords.y, button: this.mouseButtonDown });
            this.mouseButtonDown = null;
        }
    }

    handleMouseMove(event) {
        if (!this.streaming) return;
        
        if (this.viewMode) {
            if (this.isPanning) {
                // Pan the view
                const dx = event.clientX - this.lastPanX;
                const dy = event.clientY - this.lastPanY;
                this.panX += dx;
                this.panY += dy;
                this.lastPanX = event.clientX;
                this.lastPanY = event.clientY;
                this.constrainPan();
                this.updateZoom();
            }
        } else {
            // Always update cursor position in control mode
            const coords = this.getRelativeCoords(event);
            
            // Send movement to remote (throttled by coordinate changes)
            if (Math.abs(coords.x - this.lastMouseX) > 0.001 || Math.abs(coords.y - this.lastMouseY) > 0.001) {
                this.send({ type: 'mousemove', x: coords.x, y: coords.y });
                this.lastMouseX = coords.x;
                this.lastMouseY = coords.y;
            }
        }
    }

    updateCursor(event) {
        if (!this.viewMode) {
            this.cursor.style.left = event.clientX + 'px';
            this.cursor.style.top = event.clientY + 'px';
            this.cursor.style.display = 'block';
        }
    }

    updateCursorTouch(event) {
        if (event.touches.length === 1 && !this.viewMode) {
            const touch = event.touches[0];
            this.cursor.style.left = touch.clientX + 'px';
            this.cursor.style.top = touch.clientY + 'px';
            this.cursor.style.display = 'block';
        }
    }

    handleDoubleClick(event) {
        event.preventDefault();
        if (!this.streaming || this.viewMode) return;
        
        const coords = this.getRelativeCoords(event);
        this.send({ type: 'doubleclick', x: coords.x, y: coords.y });
    }

    handleTouchStart(event) {
        event.preventDefault();
        if (!this.streaming) return;
        
        // Handle two-finger gestures (pinch zoom)
        if (event.touches.length === 2) {
            const distance = this.getTouchDistance(event.touches);
            this.lastTouchDistance = distance;
            this.lastPanX = (event.touches[0].clientX + event.touches[1].clientX) / 2;
            this.lastPanY = (event.touches[0].clientY + event.touches[1].clientY) / 2;
            return;
        }
        
        const touch = event.touches[0];
        
        if (this.viewMode) {
            this.isPanning = true;
            this.lastPanX = touch.clientX;
            this.lastPanY = touch.clientY;
        } else {
            const coords = this.getRelativeCoords(touch);
            this.mouseButtonDown = 'left';
            this.send({ type: 'mousedown', x: coords.x, y: coords.y, button: 'left' });
        }
    }

    handleTouchEnd(event) {
        event.preventDefault();
        if (!this.streaming) return;
        
        this.lastTouchDistance = 0;
        this.isPanning = false;
        
        if (!this.viewMode && this.mouseButtonDown) {
            const touch = event.changedTouches[0];
            const coords = this.getRelativeCoords(touch);
            this.send({ type: 'mouseup', x: coords.x, y: coords.y, button: this.mouseButtonDown });
            this.mouseButtonDown = null;
        }
    }

    handleTouchMove(event) {
        event.preventDefault();
        if (!this.streaming) return;
        
        // Handle two-finger pinch zoom
        if (event.touches.length === 2) {
            const distance = this.getTouchDistance(event.touches);
            const centerX = (event.touches[0].clientX + event.touches[1].clientX) / 2;
            const centerY = (event.touches[0].clientY + event.touches[1].clientY) / 2;
            
            if (this.lastTouchDistance > 0) {
                const delta = (distance - this.lastTouchDistance) * 0.01;
                this.zoom(delta, centerX, centerY);
                
                // Pan while pinching
                if (this.lastPanX !== 0 && this.lastPanY !== 0) {
                    this.panX += centerX - this.lastPanX;
                    this.panY += centerY - this.lastPanY;
                    this.constrainPan();
                    this.updateZoom();
                }
            }
            this.lastTouchDistance = distance;
            this.lastPanX = centerX;
            this.lastPanY = centerY;
            return;
        }
        
        const touch = event.touches[0];
        
        if (this.viewMode && this.isPanning) {
            // Pan with single finger in view mode
            const dx = touch.clientX - this.lastPanX;
            const dy = touch.clientY - this.lastPanY;
            this.panX += dx;
            this.panY += dy;
            this.lastPanX = touch.clientX;
            this.lastPanY = touch.clientY;
            this.constrainPan();
            this.updateZoom();
        } else if (!this.viewMode) {
            // Send touch movement in control mode
            const coords = this.getRelativeCoords(touch);
            this.send({ type: 'mousemove', x: coords.x, y: coords.y });
        }
    }

    handleWheel(event) {
        event.preventDefault();
        if (!this.streaming) return;
        
        // Ctrl+Wheel for zoom, regular wheel for scroll
        if (event.ctrlKey) {
            const delta = event.deltaY > 0 ? -0.1 : 0.1;
            this.zoom(delta);
        } else {
            const delta = Math.sign(event.deltaY) * -3;
            this.send({ type: 'scroll', delta });
        }
    }

    getTouchDistance(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    zoom(delta, centerX = null, centerY = null) {
        const oldZoom = this.zoomLevel;
        this.zoomLevel = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoomLevel + delta));
        
        // Zoom towards center of screen to keep content in frame
        if (centerX === null || centerY === null) {
            const container = document.getElementById('streamContainer');
            centerX = container.offsetWidth / 2;
            centerY = container.offsetHeight / 2;
        }
        
        if (delta !== 0 && oldZoom !== this.zoomLevel) {
            const rect = this.screenWrapper.getBoundingClientRect();
            const containerRect = document.getElementById('streamContainer').getBoundingClientRect();
            
            // Calculate the point we're zooming towards relative to the wrapper
            const pointX = centerX - rect.left;
            const pointY = centerY - rect.top;
            
            // Calculate new pan to keep the point under the cursor
            const zoomRatio = this.zoomLevel / oldZoom;
            this.panX = centerX - containerRect.left - pointX * zoomRatio;
            this.panY = centerY - containerRect.top - pointY * zoomRatio;
            
            // Constrain panning to keep content visible
            this.constrainPan();
        }
        
        this.updateZoom();
    }

    constrainPan() {
        const container = document.getElementById('streamContainer');
        const containerRect = container.getBoundingClientRect();
        const imgWidth = this.screen.naturalWidth || this.screen.width;
        const imgHeight = this.screen.naturalHeight || this.screen.height;
        
        // Calculate the scaled dimensions
        const scaledWidth = imgWidth * this.zoomLevel;
        const scaledHeight = imgHeight * this.zoomLevel;
        
        // Calculate bounds - allow some negative pan but keep most content visible
        const maxPanX = containerRect.width * 0.8;
        const minPanX = containerRect.width - scaledWidth - containerRect.width * 0.8;
        const maxPanY = containerRect.height * 0.8;
        const minPanY = containerRect.height - scaledHeight - containerRect.height * 0.8;
        
        // Only constrain if content is larger than container
        if (scaledWidth > containerRect.width) {
            this.panX = Math.max(minPanX, Math.min(maxPanX, this.panX));
        } else {
            // Center if smaller than container
            this.panX = (containerRect.width - scaledWidth) / 2;
        }
        
        if (scaledHeight > containerRect.height) {
            this.panY = Math.max(minPanY, Math.min(maxPanY, this.panY));
        } else {
            // Center if smaller than container
            this.panY = (containerRect.height - scaledHeight) / 2;
        }
    }

    resetZoom() {
        this.zoomLevel = 1.0;
        this.panX = 0;
        this.panY = 0;
        this.updateZoom();
    }

    updateZoom() {
        this.screenWrapper.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoomLevel})`;
        this.zoomLevelDisplay.textContent = Math.round(this.zoomLevel * 100) + '%';
    }

    toggleMode() {
        this.viewMode = !this.viewMode;
        this.updateModeUI();
    }

    updateModeUI() {
        this.modeText.textContent = this.viewMode ? 'View Mode' : 'Control Mode';
        
        if (this.viewMode) {
            this.cursor.style.display = 'none';
            this.screen.style.cursor = 'grab';
            this.isPanning = false;
            this.mouseButtonDown = null;
        } else {
            this.cursor.style.display = 'block';
            this.screen.style.cursor = 'none';
        }
    }

    handleRightClick(event) {
        const coords = this.getRelativeCoords(event);
        this.send({ type: 'rightclick', x: coords.x, y: coords.y });
    }

    sendTextInput() {
        const text = this.textInput.value;
        if (text) {
            this.send({ type: 'text', text });
            this.textInput.value = '';
        }
    }

    sendKey(key) {
        this.send({ type: 'key', key });
    }

    sendKeyCombo(keys) {
        this.send({ type: 'keycombo', keys });
    }

    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }
}

// Initialize the app
const app = new NanoVNARemote();
