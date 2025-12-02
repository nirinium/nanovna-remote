# NanoVNA Remote Control

Stream and control your NanoVNA-App desktop application from any device with a web browser, including your phone.

## Features

- **Real-time Screen Streaming**: View your NanoVNA-App interface on any device
- **Full Mouse/Touch Control**: Click, drag, and interact with the app remotely
- **Mobile Optimized**: Touch-friendly interface for smartphones and tablets
- **Low Latency**: ~15 FPS streaming with compressed JPEG
- **Cross-Device**: Access from phones, tablets, or other computers on your network

## Prerequisites

- Node.js (v16 or later)
- NanoVNA-App installed and running on your Windows PC
- Both devices on the same network (or configure port forwarding for remote access)

## Installation

1. Navigate to the project directory:
```bash
cd C:\Users\nirinium\Documents\nanovna-remote
```

2. Install dependencies:
```bash
npm install
```

Note: `robotjs` requires Windows Build Tools. If installation fails, run:
```bash
npm install --global windows-build-tools
```

## Usage

1. **Start NanoVNA-App** on your desktop

2. **Start the server**:
```bash
npm start
```

3. **Find your PC's IP address**:
```bash
ipconfig
```
Look for "IPv4 Address" (e.g., 192.168.1.100)

4. **Access from your phone**:
   - Open a browser on your phone
   - Navigate to: `http://YOUR_PC_IP:3000`
   - Example: `http://192.168.1.100:3000`

5. **Click "Start Stream"** to begin viewing and controlling your NanoVNA-App

## Controls

- **Click/Tap**: Single click on the remote screen
- **Touch and Drag**: Hold and move to drag elements
- **Scroll**: Use two-finger scroll on mobile or mouse wheel on desktop
- **Pinch to Zoom**: Standard mobile pinch gestures (transmitted as scroll events)

## Configuration

Edit `server.js` to customize:

- **Port**: Change `PORT = 3000` to your preferred port
- **Frame Rate**: Adjust `setInterval` delay (currently 66ms for ~15 FPS)
- **Image Quality**: Modify `jpeg({ quality: 60 })` (1-100)
- **Resolution**: Change `resize(1280, null, ...)` for different max width

## Security Note

This server has no authentication and should only be used on trusted networks. For external access:

1. Add authentication middleware
2. Use HTTPS/WSS with SSL certificates
3. Set up a VPN or SSH tunnel
4. Configure firewall rules carefully

## Troubleshooting

**Can't connect from phone:**
- Ensure both devices are on the same Wi-Fi network
- Check Windows Firewall allows port 3000
- Verify the IP address is correct

**Screen not showing:**
- Make sure NanoVNA-App is running and visible
- Try clicking "Start Stream" again
- Check server console for error messages

**Controls not working:**
- Windows may require administrator privileges for `robotjs`
- Try running the server as administrator

**Poor performance:**
- Reduce image quality in `server.js`
- Lower frame rate (increase interval)
- Ensure good Wi-Fi signal strength

## Development

Run with auto-reload:
```bash
npm run dev
```

## How It Works

1. **Express Server**: Serves the web interface and handles HTTP requests
2. **WebSocket**: Provides real-time bidirectional communication
3. **screenshot-desktop**: Captures the screen at regular intervals
4. **Sharp**: Compresses images to JPEG for faster transmission
5. **RobotJS**: Simulates mouse and keyboard events on the desktop
6. **Client**: Receives frames and sends input events back to server

## Dependencies

- `express`: Web server framework
- `ws`: WebSocket server
- `screenshot-desktop`: Screen capture
- `robotjs`: Desktop automation (mouse/keyboard control)
- `sharp`: Image processing and compression

## License

MIT

## Future Enhancements

- Window-specific capture (isolate NanoVNA-App window)
- Authentication and encryption
- Multiple client support
- Virtual keyboard for text input
- Recording and playback
- Adjustable quality settings in UI
- Keyboard shortcut support
