# MB Arena multiplayer server
Requires Node.js 18+.
1. `cd mb-arena-server && npm install && npm start`
2. Open `http://localhost:8080` (server serves MB_Arena.html). Friends on your Wi-Fi use `http://<your-PC-IP>:8080`.
3. For internet play, host on any Node host (Render/Railway/Fly/VPS) or port-forward 8080; with HTTPS the game auto-uses `wss://`.
4. In the game: Menu > Friends & Rooms. Your 8-digit UID is your Player ID. Add friends, create a room (Room ID + 4-digit password), friends join, everyone presses Ready, host presses Start.
Data (players/friends) is stored in data.json beside server.js.
