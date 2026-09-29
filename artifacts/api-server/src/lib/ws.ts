import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { logger } from './logger';

const widgetSockets = new Map<string, WebSocket>();

export function initWebSocket(server: Server) {
    const wss = new WebSocketServer({ server, path: '/api/widget/ws' });

    wss.on('connection', (ws, req) => {
        try {
            const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
            const sessionId = url.searchParams.get('sessionId');
            
            if (sessionId) {
                widgetSockets.set(sessionId, ws);
                
                ws.on('close', () => {
                    if (widgetSockets.get(sessionId) === ws) {
                        widgetSockets.delete(sessionId);
                    }
                });
                
                ws.on('error', (err) => {
                    logger.error({ err }, "WebSocket error");
                });
            } else {
                ws.close();
            }
        } catch (e) {
            ws.close();
        }
    });
}

export function notifyWidgetClient(sessionId: string, message: any) {
    const ws = widgetSockets.get(sessionId);
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
        return true;
    }
    return false;
}
