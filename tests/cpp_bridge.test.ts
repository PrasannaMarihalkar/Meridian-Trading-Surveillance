import { CppEngineBridge } from '../backend/services/cppEngineBridge';

async function runBridgeTest() {
  console.log('=== MERIDIAN C++ ENGINE BRIDGE TEST ===\n');
  const bridge = CppEngineBridge.getInstance();

  try {
    const isReady = await bridge.waitForReady(8000);
    if (!isReady) {
      throw new Error('[FAIL] C++ Engine process failed to start within timeout. Aborting test.');
    }

    console.log('[TEST 1] Placing passive SELL limit order into C++ engine...');
    const sellResult = await bridge.submitOrder({
      orderId: 9901,
      accountId: 1002,
      instrumentId: 1,
      side: 'SELL',
      orderType: 'LIMIT',
      price: 1550.0,
      quantity: 10
    });

    console.log('  Sell Order Result:', sellResult);
    if (sellResult.orderId === 9901 && sellResult.status === 'OPEN') {
      console.log('  ✓ Passive limit sell placed in C++ engine book.');
    } else {
      throw new Error(`Failed to place passive limit sell: unexpected result ${JSON.stringify(sellResult)}`);
    }

    console.log('\n[TEST 2] Verifying Level 2 depth snapshot from C++ engine...');
    const snap1 = await bridge.getSnapshot(1);
    console.log('  Snapshot 1 Result:', snap1);
    if (snap1.asks.length === 1 && snap1.asks[0].price === 1550.0 && snap1.asks[0].quantity === 10) {
      console.log('  ✓ Snapshot correctly reflects 10 resting shares at ask 1550.0.');
    } else {
      throw new Error(`Snapshot 1 validation failed: ${JSON.stringify(snap1)}`);
    }

    console.log('\n[TEST 3] Placing aggressive BUY order that crosses the spread...');
    const buyResult = await bridge.submitOrder({
      orderId: 9902,
      accountId: 1001,
      instrumentId: 1,
      side: 'BUY',
      orderType: 'LIMIT',
      price: 1550.0,
      quantity: 5
    });

    console.log('  Buy Order Result:', buyResult);
    if (buyResult.trades.length === 1 && buyResult.trades[0].quantity === 5 && buyResult.trades[0].price === 1550.0) {
      console.log('  ✓ Trade matched across IPC boundary in C++ engine at 1550.0 for 5 shares!');
    } else {
      throw new Error(`Trade matching failed in C++ engine: ${JSON.stringify(buyResult)}`);
    }

    console.log('\n[TEST 4] Verifying depth snapshot after partial execution...');
    const snap2 = await bridge.getSnapshot(1);
    console.log('  Snapshot 2 Result:', snap2);
    if (snap2.asks.length === 1 && snap2.asks[0].quantity === 5) {
      console.log('  ✓ Snapshot correctly reflects 5 remaining shares at ask 1550.0.');
    } else {
      throw new Error(`Snapshot 2 validation failed: ${JSON.stringify(snap2)}`);
    }

    console.log('\n[TEST 5] Cancelling remaining passive sell order...');
    const cancelOk = await bridge.cancelOrder(9901, 1);
    if (cancelOk) {
      console.log('  ✓ Residual order cancelled in C++ engine.');
    } else {
      throw new Error('Cancel failed in C++ engine');
    }

    console.log('\n[TEST 6] Verifying book is empty after cancellation...');
    const snap3 = await bridge.getSnapshot(1);
    console.log('  Snapshot 3 Result:', snap3);
    if (snap3.asks.length === 0 && snap3.bids.length === 0) {
      console.log('  ✓ Snapshot confirms order book is completely clean.');
    } else {
      throw new Error(`Snapshot 3 validation failed: ${JSON.stringify(snap3)}`);
    }

    console.log('\n=== ALL C++ ENGINE BRIDGE TESTS PASSED ===\n');
  } finally {
    bridge.shutdown();
  }
}

runBridgeTest().catch(err => {
  console.error('[FAIL] Bridge test error:', err);
  process.exit(1);
});
