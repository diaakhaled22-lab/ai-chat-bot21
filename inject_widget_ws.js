const fs = require('fs');
let code = fs.readFileSync('artifacts/api-server/public/widget.js', 'utf8');

// We need to inject a WebSocket connection logic in init()
const wsCode = `
  var ws = null;
  function connectWebSocket() {
    if (ws) return;
    var wsBase = apiBase.replace(/^http/, "ws");
    var wsUrl = wsBase + "/widget/ws?sessionId=" + encodeURIComponent(sessionId);
    ws = new WebSocket(wsUrl);
    ws.onmessage = function(event) {
      try {
        var data = JSON.parse(event.data);
        if (data.type === "new_message") {
          addMessage(data.role, data.text);
          if (autoSpeak) speak(data.text);
          if (!isOpen && !hasStoredFabPosition) {
             // Maybe show a badge? 
             var badge = document.getElementById("cw-badge");
             if (badge) badge.style.display = "block";
          }
        }
      } catch(e) {}
    };
    ws.onclose = function() {
      ws = null;
      setTimeout(connectWebSocket, 3000);
    };
  }
`;

if (!code.includes('function connectWebSocket()')) {
    // Inject wsCode before init()
    code = code.replace('function init() {', wsCode + '\n  function init() {\n    connectWebSocket();');
    fs.writeFileSync('artifacts/api-server/public/widget.js', code);
    console.log('Injected WebSocket client into widget.js');
}
