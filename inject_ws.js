const fs = require('fs');
let code = fs.readFileSync('artifacts/api-server/src/index.ts', 'utf8');

code = code.replace(
  'app.listen(port, "0.0.0.0", (err?: Error) => {',
  'const server = app.listen(port, "0.0.0.0", (err?: Error) => {'
);

code = code.replace(
  'logger.info({ port }, "Server listening");\n  });',
  'logger.info({ port }, "Server listening");\n  });\n\n  import("./lib/ws").then(ws => ws.initWebSocket(server));'
);

fs.writeFileSync('artifacts/api-server/src/index.ts', code);
console.log('Injected WebSocket server into index.ts');
