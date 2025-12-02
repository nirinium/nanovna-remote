const express = require('express');
const WebSocket = require('ws');
const screenshot = require('screenshot-desktop');
const robot = require('robotjs');
const sharp = require('sharp');
const path = require('path');
const { spawn } = require('child_process');

const app = express();
const PORT = 3000;

// Serve static files
app.use(express.static('public'));

const server = app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Access from your phone at http://YOUR_PC_IP:${PORT}`);
  console.log(`\nMake sure NanoVNA-App is running before connecting!`);
});

// WebSocket server for streaming
const wss = new WebSocket.Server({ server });

// Track NanoVNA window position and size
let windowBounds = null;

// Function to find NanoVNA-App window (Windows-specific)
function findNanoVNAWindow() {
  try {
    // Use PowerShell to find the window
    const powershell = spawn('powershell', [
      '-Command',
      `Add-Type @"
        using System;
        using System.Runtime.InteropServices;
        using System.Text;
        public class Window {
            [DllImport("user32.dll")]
            public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
            [DllImport("user32.dll")]
            public static extern bool GetWindowRect(IntPtr hwnd, out RECT lpRect);
            [DllImport("user32.dll")]
            public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
            [DllImport("user32.dll")]
            public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);
            public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
        }
        public struct RECT {
            public int Left;
            public int Top;
            public int Right;
            public int Bottom;
        }
"@;
$windows = @();
[Window]::EnumWindows({
    param($hwnd, $lParam)
    $sb = New-Object System.Text.StringBuilder 256;
    [void][Window]::GetWindowText($hwnd, $sb, $sb.Capacity);
    $title = $sb.ToString();
    if ($title -like "*NanoVNA*" -or $title -like "*nanovna*") {
        $rect = New-Object RECT;
        [void][Window]::GetWindowRect($hwnd, [ref]$rect);
        Write-Output "$($rect.Left),$($rect.Top),$($rect.Right),$($rect.Bottom)";
    }
    return $true;
}, [IntPtr]::Zero);`
    ]);

    let output = '';
    powershell.stdout.on('data', (data) => {
      output += data.toString();
    });

    powershell.on('close', (code) => {
      const lines = output.trim().split('\n');
      if (lines.length > 0 && lines[0]) {
        const coords = lines[0].split(',').map(Number);
        if (coords.length === 4) {
          windowBounds = {
            x: coords[0],
            y: coords[1],
            width: coords[2] - coords[0],
            height: coords[3] - coords[1]
          };
          console.log('NanoVNA window found:', windowBounds);
        }
      }
    });
  } catch (error) {
    console.error('Error finding window:', error);
  }
}

wss.on('connection', (ws) => {
  console.log('Client connected');
  let streaming = false;
  let streamInterval;

  // Try to find NanoVNA window on connection
  findNanoVNAWindow();

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case 'start':
          streaming = true;
          console.log('Starting stream...');
          
          // Stream screen at ~15 FPS
          streamInterval = setInterval(async () => {
            if (!streaming) return;

            try {
              // Capture full screen or specific window
              const img = await screenshot({ format: 'png' });
              
              // Compress image for faster transmission
              const compressed = await sharp(img)
                .resize(1280, null, { fit: 'inside' })
                .jpeg({ quality: 60 })
                .toBuffer();

              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'frame',
                  data: compressed.toString('base64')
                }));
              }
            } catch (error) {
              console.error('Screenshot error:', error);
            }
          }, 66); // ~15 FPS
          break;

        case 'stop':
          streaming = false;
          if (streamInterval) clearInterval(streamInterval);
          console.log('Stream stopped');
          break;

        case 'mousedown':
          const downX = Math.round(data.x * robot.getScreenSize().width);
          const downY = Math.round(data.y * robot.getScreenSize().height);
          robot.moveMouse(downX, downY);
          robot.mouseToggle('down', data.button || 'left');
          break;

        case 'mouseup':
          const upX = Math.round(data.x * robot.getScreenSize().width);
          const upY = Math.round(data.y * robot.getScreenSize().height);
          robot.moveMouse(upX, upY);
          robot.mouseToggle('up', data.button || 'left');
          break;

        case 'rightclick':
          const rcX = Math.round(data.x * robot.getScreenSize().width);
          const rcY = Math.round(data.y * robot.getScreenSize().height);
          robot.moveMouse(rcX, rcY);
          robot.mouseClick('right');
          console.log(`Right-click at ${rcX}, ${rcY}`);
          break;

        case 'doubleclick':
          const dcX = Math.round(data.x * robot.getScreenSize().width);
          const dcY = Math.round(data.y * robot.getScreenSize().height);
          robot.moveMouse(dcX, dcY);
          robot.mouseClick('left', true); // double click
          console.log(`Double-click at ${dcX}, ${dcY}`);
          break;

        case 'mousemove':
          const moveX = Math.round(data.x * robot.getScreenSize().width);
          const moveY = Math.round(data.y * robot.getScreenSize().height);
          robot.moveMouse(moveX, moveY);
          break;

        case 'scroll':
          robot.scrollMouse(0, data.delta);
          break;

        case 'key':
          robot.keyTap(data.key);
          break;

        case 'text':
          // Type text character by character
          robot.typeString(data.text);
          console.log(`Typed: ${data.text}`);
          break;

        case 'keycombo':
          // Handle key combinations like Ctrl+C, Ctrl+Alt+Del
          const modifiers = [];
          const keys = data.keys || [];
          
          keys.forEach(key => {
            if (['control', 'alt', 'shift', 'command'].includes(key)) {
              modifiers.push(key);
            }
          });
          
          const mainKey = keys.find(k => !['control', 'alt', 'shift', 'command'].includes(k));
          
          if (mainKey) {
            robot.keyTap(mainKey, modifiers);
            console.log(`Key combo: ${keys.join('+')}`);
          }
          break;

        case 'findWindow':
          findNanoVNAWindow();
          ws.send(JSON.stringify({
            type: 'windowBounds',
            bounds: windowBounds
          }));
          break;
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  });

  ws.on('close', () => {
    streaming = false;
    if (streamInterval) clearInterval(streamInterval);
    console.log('Client disconnected');
  });
});

process.on('SIGINT', () => {
  console.log('\nShutting down...');
  server.close();
  process.exit(0);
});
