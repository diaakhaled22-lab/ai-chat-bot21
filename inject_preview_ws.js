const fs = require('fs');
let code = fs.readFileSync('artifacts/chatbot-admin/src/pages/client/ClientWidgetPreview.tsx', 'utf8');

const wsCode = `
    useEffect(() => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.host;
      const ws = new WebSocket(\`\${protocol}//\${host}/api/widget/ws?sessionId=\${sessionId}\`);
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "new_message") {
            setMessages((prev) => [...prev, { role: data.role as "bot", text: data.text }]);
          }
        } catch(e) {}
      };
      
      return () => ws.close();
    }, [sessionId]);
`;

if (!code.includes('new WebSocket')) {
    code = code.replace('const bottomRef = useRef<HTMLDivElement>(null);', wsCode + '\n    const bottomRef = useRef<HTMLDivElement>(null);');
    fs.writeFileSync('artifacts/chatbot-admin/src/pages/client/ClientWidgetPreview.tsx', code);
    console.log('Injected WebSocket client into ClientWidgetPreview.tsx');
}
