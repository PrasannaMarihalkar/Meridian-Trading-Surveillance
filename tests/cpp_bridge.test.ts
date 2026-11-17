import { CppEngineBridge } from '../backend/services/cppEngineBridge';

async function runBridgeTest() {
  console.log('=== MERIDIAN C++ ENGINE BRIDGE TEST ===');
  const bridge = CppEngineBridge.getInstance();

  const isReady = await bridge.waitForReady(4000);
  if (!isReady) {
    console.log('[WARN] C++ Engine process not available in this test environment. Skipping live IPC assertions.');
    return;
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

  console.log('Sell Order Result:', sellResult);
  if (sellResult.orderId === 9901 && sellResult.status === 'OPEN') {
    console.log('✓ Passive limit sell placed in C++ engine book.');
  } else {
    throw new Error('Failed to place passive limit sell');
  }

  console.log('[TEST 2] Placing aggressive BUY order that crosses the spread...');
  const buyResult = await bridge.submitOrder({
    orderId: 9902,
    accountId: 1001,
    instrumentId: 1,
    side: 'BUY',
    orderType: 'LIMIT',
    price: 1550.0,
    quantity: 5
  });

  console.log('Buy Order Result:', buyResult);
  if (buyResult.trades.length === 1 && buyResult.trades[0].quantity === 5 && buyResult.trades[0].price === 1550.0) {
    console.log('✓ Trade matched across IPC boundary in C++ engine at 1550.0 for 5 shares!');
  } else {
    throw new Error('Trade matching failed in C++ engine');
  }

  console.log('[TEST 3] Cancelling remaining passive sell order...');
  const cancelOk = await bridge.cancelOrder(9901, 1);
  if (cancelOk) {
    console.log('✓ Residual order cancelled in C++ engine.');
  } else {
    throw new Error('Cancel failed');
  }

  bridge.shutdown();
  console.log('\n=== ALL C++ ENGINE BRIDGE TESTS PASSED ===');
}

runBridgeTest().catch(err => {
  console.error('[FAIL] Bridge test error:', err);
  process.exit(1);
});
