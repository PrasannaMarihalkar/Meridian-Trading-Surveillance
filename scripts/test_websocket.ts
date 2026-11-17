import WebSocket from 'ws';

async function testWebSocket() {
  console.log('=== WEBSOCKET CLIENT INTEGRATION TEST ===');
  return new Promise<void>((resolve, reject) => {
    const ws = new WebSocket('ws://localhost:4000/ws');
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('WebSocket test timed out after 5000ms'));
    }, 5000);

    let ackReceived = false;

    ws.on('open', () => {
      console.log('✓ Connected to ws://localhost:4000/ws');
    });

    ws.on('message', (data: WebSocket.Data) => {
      const msg = JSON.parse(data.toString());
      console.log('  Received frame:', msg);

      if (msg.type === 'CONNECTION_ACK') {
        ackReceived = true;
        // Send PING
        console.log('  Transmitting PING frame...');
        ws.send(JSON.stringify({ type: 'PING' }));
      } else if (msg.type === 'PONG') {
        if (!ackReceived) {
          clearTimeout(timeout);
          ws.close();
          reject(new Error('PONG received before CONNECTION_ACK'));
          return;
        }
        console.log('✓ PONG frame received from server.');
        clearTimeout(timeout);
        ws.close();
        resolve();
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

testWebSocket()
  .then(() => {
    console.log('\n[ALL CHECKS PASSED] WebSocket server is operating cleanly.\n');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n[FAILED] WebSocket test failed:', err);
    process.exit(1);
  });
