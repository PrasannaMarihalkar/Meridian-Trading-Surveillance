import React, { useState, useEffect } from 'react';
import { apiRequest } from '../api';
import { TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, RefreshCw, XCircle, ShieldAlert, CheckCircle2 } from 'lucide-react';

function generateClientUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

interface Instrument {
  instrument_id: number;
  symbol: string;
  name: string;
  sector: string;
  reference_price: string;
  best_bid: string;
  bid_size: string;
  best_ask: string;
  ask_size: string;
  spread: string | null;
}

interface OrderBookLevel {
  price: number;
  quantity: number;
  count: number;
}

interface OrderBookSnapshot {
  instrumentId: number;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

export function TradingTerminal({ user }: { user: any }) {
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [selectedInstId, setSelectedInstId] = useState<number>(1);
  const [orderBook, setOrderBook] = useState<OrderBookSnapshot | null>(null);
  const [activeTab, setActiveTab] = useState<'ORDERS' | 'TRADES' | 'POSITIONS' | 'WATCHLIST'>('ORDERS');

  // Order Ticket State
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [orderType, setOrderType] = useState<'LIMIT' | 'MARKET' | 'IOC'>('LIMIT');
  const [price, setPrice] = useState<string>('1400.00');
  const [quantity, setQuantity] = useState<string>('50');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [orderSuccess, setOrderSuccess] = useState<string | null>(null);
  const [activeIdempotencyKey, setActiveIdempotencyKey] = useState<string>(() => generateClientUuid());

  // Generate a new idempotency key when user changes order parameters
  useEffect(() => {
    setActiveIdempotencyKey(generateClientUuid());
  }, [selectedInstId, side, orderType, price, quantity]);

  // Table Data State
  const [orders, setOrders] = useState<any[]>([]);
  const [trades, setTrades] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [account, setAccount] = useState<any>(null);

  const fetchInstruments = async () => {
    try {
      const data = await apiRequest<Instrument[]>('/instruments');
      setInstruments(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchOrderBook = async (id: number) => {
    try {
      const data = await apiRequest<OrderBookSnapshot>(`/instruments/${id}/order-book?depth=8`);
      setOrderBook(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchOrders = async () => {
    try {
      const data = await apiRequest<any[]>('/orders?limit=30');
      setOrders(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchTrades = async () => {
    try {
      const data = await apiRequest<any[]>('/trades?limit=30');
      setTrades(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchPositions = async () => {
    if (!user?.accountId) return;
    try {
      const data = await apiRequest<any[]>(`/accounts/${user.accountId}/positions`);
      setPositions(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAccount = async () => {
    if (!user?.accountId) return;
    try {
      const data = await apiRequest<any>(`/accounts/${user.accountId}`);
      setAccount(data);
    } catch (e) {
      console.error(e);
    }
  };

  const refreshAll = () => {
    fetchInstruments();
    fetchOrderBook(selectedInstId);
    fetchOrders();
    fetchTrades();
    fetchPositions();
    fetchAccount();
  };

  useEffect(() => {
    refreshAll();
    const interval = setInterval(() => {
      fetchOrderBook(selectedInstId);
      fetchOrders();
      fetchTrades();
      fetchPositions();
    }, 3000);
    return () => clearInterval(interval);
  }, [selectedInstId, user?.accountId]);

  const selectedInst = instruments.find(i => i.instrument_id === selectedInstId) || instruments[0];

  const handleSelectInstrument = (inst: Instrument) => {
    setSelectedInstId(inst.instrument_id);
    setPrice(parseFloat(inst.reference_price).toFixed(2));
    fetchOrderBook(inst.instrument_id);
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.accountId) {
      setOrderError('Only users with an active trading account can submit orders.');
      return;
    }

    setIsSubmitting(true);
    setOrderError(null);
    setOrderSuccess(null);

    try {
      // Use stable client-supplied idempotency key preserved across retries
      const clientOrderId = activeIdempotencyKey;

      const res = await apiRequest<any>('/orders', {
        method: 'POST',
        headers: {
          'Idempotency-Key': clientOrderId
        },
        body: JSON.stringify({
          accountId: user.accountId,
          instrumentId: selectedInstId,
          side,
          orderType,
          price: parseFloat(price) || 0,
          quantity: parseInt(quantity, 10),
          clientOrderId
        })
      });

      // On successful submission, generate a fresh idempotency key for the next order
      setActiveIdempotencyKey(generateClientUuid());

      const tradeCount = res.trades?.length || 0;
      setOrderSuccess(
        `Order #${res.order.order_id} submitted (${res.order.status}). ${
          tradeCount > 0 ? `Matched in ${tradeCount} execution(s)!` : 'Resting on book.'
        }`
      );
      refreshAll();
    } catch (err: any) {
      setOrderError(err.message || 'Order failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelOrder = async (orderId: number) => {
    try {
      await apiRequest(`/orders/${orderId}/cancel`, { method: 'POST' });
      fetchOrders();
      fetchOrderBook(selectedInstId);
    } catch (err: any) {
      alert(`Cancel failed: ${err.message}`);
    }
  };

  // Calculations
  const numPrice = parseFloat(price) || 0;
  const numQty = parseInt(quantity, 10) || 0;
  const refPrice = selectedInst ? parseFloat(selectedInst.reference_price) : 0;
  const estimatedNotional = numPrice * numQty;
  const priceCollarDeviation = refPrice > 0 ? Math.abs((numPrice - refPrice) / refPrice) * 100 : 0;

  const maxBookQty = Math.max(
    ...(orderBook?.bids.map(b => b.quantity) || [1]),
    ...(orderBook?.asks.map(a => a.quantity) || [1])
  );

  return (
    <div className="space-y-4">
      {/* Top Banner: Instrument Selector & BBO Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        {instruments.map(inst => {
          const isSelected = inst.instrument_id === selectedInstId;
          const ref = parseFloat(inst.reference_price);
          const bb = parseFloat(inst.best_bid);
          const ba = parseFloat(inst.best_ask);
          return (
            <button
              key={inst.instrument_id}
              onClick={() => handleSelectInstrument(inst)}
              className={`text-left p-3 rounded-lg border transition ${
                isSelected
                  ? 'bg-slate-800/90 border-blue-500 shadow-md ring-1 ring-blue-500/50'
                  : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex justify-between items-start">
                <span className="font-bold text-white tracking-wider">{inst.symbol}</span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                  {inst.sector || 'Equities'}
                </span>
              </div>
              <div className="mt-2 flex items-baseline justify-between font-mono">
                <span className="text-base text-slate-200">₹{ref.toFixed(2)}</span>
                <span className="text-xs text-slate-400">
                  B: <span className="text-emerald-400">{bb > 0 ? bb.toFixed(2) : '-'}</span> / A:{' '}
                  <span className="text-rose-400">{ba > 0 ? ba.toFixed(2) : '-'}</span>
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Main Grid: Left = Order Book & Ticket, Right = Data Blotters */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column: Order Ticket (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Order Placement Ticket */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></div>
                <h3 className="font-semibold text-white tracking-wide">ORDER ENTRY TICKET</h3>
              </div>
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800">
                {selectedInst?.symbol}
              </span>
            </div>

            <form onSubmit={handlePlaceOrder} className="mt-4 space-y-4">
              {/* Buy / Sell Toggle */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950 rounded-lg border border-slate-800">
                <button
                  type="button"
                  onClick={() => setSide('BUY')}
                  className={`py-2 text-sm font-semibold rounded-md flex items-center justify-center space-x-1 transition ${
                    side === 'BUY'
                      ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <ArrowUpRight className="w-4 h-4" />
                  <span>BUY / LONG</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSide('SELL')}
                  className={`py-2 text-sm font-semibold rounded-md flex items-center justify-center space-x-1 transition ${
                    side === 'SELL'
                      ? 'bg-rose-600 text-white shadow-lg shadow-rose-900/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <ArrowDownRight className="w-4 h-4" />
                  <span>SELL / SHORT</span>
                </button>
              </div>

              {/* Order Type Toggle */}
              <div className="grid grid-cols-3 gap-2">
                {(['LIMIT', 'MARKET', 'IOC'] as const).map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setOrderType(type)}
                    className={`py-1.5 text-xs font-semibold rounded-md border transition ${
                      orderType === type
                        ? 'bg-slate-800 text-blue-400 border-blue-500'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>

              {/* Price & Quantity Inputs */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    LIMIT PRICE (INR)
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    disabled={orderType === 'MARKET'}
                    value={orderType === 'MARKET' ? refPrice.toFixed(2) : price}
                    onChange={e => setPrice(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    QUANTITY (UNITS)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={e => setQuantity(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Quick Qty buttons */}
              <div className="flex space-x-1.5">
                {[10, 25, 50, 100, 250].map(qty => (
                  <button
                    key={qty}
                    type="button"
                    onClick={() => setQuantity(qty.toString())}
                    className="flex-1 py-1 text-xs font-mono bg-slate-950 text-slate-400 hover:text-white rounded border border-slate-800 hover:border-slate-700"
                  >
                    {qty}
                  </button>
                ))}
              </div>

              {/* Pre-trade Risk & Notional Summary Card */}
              <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-3 space-y-1.5 text-xs font-mono">
                <div className="flex justify-between text-slate-400">
                  <span>Estimated Notional:</span>
                  <span className="text-white font-semibold">₹{estimatedNotional.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Reference Price:</span>
                  <span className="text-slate-300">₹{refPrice.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Price Collar Deviation:</span>
                  <span className={priceCollarDeviation > 5 ? 'text-rose-400 font-bold' : 'text-slate-300'}>
                    {priceCollarDeviation.toFixed(2)}% {priceCollarDeviation > 5 && '(EXCEEDS 5% LIMIT)'}
                  </span>
                </div>
                <div className="flex justify-between text-slate-400 pt-1 border-t border-slate-800">
                  <span>Account Cash Balance:</span>
                  <span className="text-emerald-400 font-semibold">
                    ₹{account ? parseFloat(account.cash_balance).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '---'}
                  </span>
                </div>
              </div>

              {orderError && (
                <div className="p-3 bg-rose-950/50 border border-rose-800 rounded-lg text-rose-300 text-xs flex items-start space-x-2">
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                  <span>{orderError}</span>
                </div>
              )}

              {orderSuccess && (
                <div className="p-3 bg-emerald-950/50 border border-emerald-800 rounded-lg text-emerald-300 text-xs flex items-start space-x-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
                  <span>{orderSuccess}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting || !user?.accountId}
                className={`w-full py-3 rounded-lg font-bold text-sm tracking-wider uppercase transition shadow-lg ${
                  side === 'BUY'
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/40'
                    : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/40'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {isSubmitting ? 'TRANSMITTING TO MATCHING ENGINE...' : `${side} ${quantity} ${selectedInst?.symbol}`}
              </button>
            </form>
          </div>

          {/* Level 2 Order Book Depth Ladder */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-xl">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold text-white tracking-wide text-xs">
                LEVEL 2 ORDER BOOK (PRICE-TIME FIFO LADDER)
              </h3>
              <span className="text-xs font-mono text-slate-400">
                Spread: <span className="text-white">{selectedInst?.spread ? `₹${parseFloat(selectedInst.spread).toFixed(2)}` : 'Flat'}</span>
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              {/* Asks (Sells) */}
              <div className="space-y-1">
                <div className="flex justify-between text-slate-500 pb-1 border-b border-slate-800 text-[10px]">
                  <span>ASK (PRICE)</span>
                  <span>QTY (DEPTH)</span>
                </div>
                {orderBook?.asks.length ? (
                  orderBook.asks.slice(0, 6).map((a, idx) => {
                    const depthPct = Math.min(100, (a.quantity / maxBookQty) * 100);
                    return (
                      <div
                        key={idx}
                        className="relative flex justify-between py-1 px-1.5 rounded overflow-hidden hover:bg-rose-950/20"
                      >
                        <div
                          className="absolute inset-y-0 right-0 bg-rose-900/25 pointer-events-none"
                          style={{ width: `${depthPct}%` }}
                        />
                        <span className="relative z-10 text-rose-400 font-semibold">₹{a.price.toFixed(2)}</span>
                        <span className="relative z-10 text-slate-300">{a.quantity}</span>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-slate-600 py-3 text-center">No asks on book</div>
                )}
              </div>

              {/* Bids (Buys) */}
              <div className="space-y-1">
                <div className="flex justify-between text-slate-500 pb-1 border-b border-slate-800 text-[10px]">
                  <span>BID (PRICE)</span>
                  <span>QTY (DEPTH)</span>
                </div>
                {orderBook?.bids.length ? (
                  orderBook.bids.slice(0, 6).map((b, idx) => {
                    const depthPct = Math.min(100, (b.quantity / maxBookQty) * 100);
                    return (
                      <div
                        key={idx}
                        className="relative flex justify-between py-1 px-1.5 rounded overflow-hidden hover:bg-emerald-950/20"
                      >
                        <div
                          className="absolute inset-y-0 left-0 bg-emerald-900/25 pointer-events-none"
                          style={{ width: `${depthPct}%` }}
                        />
                        <span className="relative z-10 text-emerald-400 font-semibold">₹{b.price.toFixed(2)}</span>
                        <span className="relative z-10 text-slate-300">{b.quantity}</span>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-slate-600 py-3 text-center">No bids on book</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Execution Blotters & Portfolios (7 cols) */}
        <div className="lg:col-span-7 bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col min-h-[500px]">
          {/* Subsystem Tabs */}
          <div className="flex space-x-1 border-b border-slate-800 pb-2 mb-4">
            <button
              onClick={() => setActiveTab('ORDERS')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${
                activeTab === 'ORDERS'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              Order Blotter ({orders.length})
            </button>
            <button
              onClick={() => setActiveTab('TRADES')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${
                activeTab === 'TRADES'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              Trade Blotter ({trades.length})
            </button>
            <button
              onClick={() => setActiveTab('POSITIONS')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${
                activeTab === 'POSITIONS'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              Portfolio Holdings ({positions.length})
            </button>
            <button
              onClick={refreshAll}
              className="ml-auto p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800"
              title="Refresh Data"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Tab 1: Orders Table */}
          {activeTab === 'ORDERS' && (
            <div className="overflow-x-auto flex-1 font-mono text-xs">
              <table className="w-full text-left">
                <thead className="text-[10px] text-slate-500 uppercase border-b border-slate-800 pb-1">
                  <tr>
                    <th className="py-2">Order ID</th>
                    <th className="py-2">Instrument</th>
                    <th className="py-2">Side</th>
                    <th className="py-2">Price</th>
                    <th className="py-2">Qty / Filled</th>
                    <th className="py-2">Status</th>
                    <th className="py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {orders.map(o => {
                    const isBuy = o.side === 'BUY';
                    const canCancel = o.status === 'OPEN' || o.status === 'PARTIALLY_FILLED';
                    return (
                      <tr key={o.order_id} className="hover:bg-slate-800/40">
                        <td className="py-2 text-slate-400 font-semibold">#{o.order_id}</td>
                        <td className="py-2 font-bold text-white">{o.symbol}</td>
                        <td className="py-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            isBuy ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-rose-950 text-rose-400 border border-rose-800'
                          }`}>
                            {o.side}
                          </span>
                        </td>
                        <td className="py-2 text-slate-200">₹{parseFloat(o.price).toFixed(2)}</td>
                        <td className="py-2 text-slate-300">
                          {o.filled_qty} / {o.quantity}
                        </td>
                        <td className="py-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            o.status === 'FILLED' ? 'bg-blue-950 text-blue-400 border border-blue-800' :
                            o.status === 'CANCELLED' ? 'bg-slate-800 text-slate-400' :
                            o.status === 'PARTIALLY_FILLED' ? 'bg-amber-950 text-amber-400 border border-amber-800' :
                            'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          }`}>
                            {o.status}
                          </span>
                        </td>
                        <td className="py-2 text-right">
                          {canCancel ? (
                            <button
                              onClick={() => handleCancelOrder(o.order_id)}
                              className="text-rose-400 hover:text-rose-300 hover:underline font-semibold"
                            >
                              Cancel
                            </button>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {orders.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
                        No orders recorded yet. Submit your first order above!
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Tab 2: Trades Table */}
          {activeTab === 'TRADES' && (
            <div className="overflow-x-auto flex-1 font-mono text-xs">
              <table className="w-full text-left">
                <thead className="text-[10px] text-slate-500 uppercase border-b border-slate-800 pb-1">
                  <tr>
                    <th className="py-2">Trade ID</th>
                    <th className="py-2">Instrument</th>
                    <th className="py-2">Price</th>
                    <th className="py-2">Quantity</th>
                    <th className="py-2">Notional</th>
                    <th className="py-2">Buyer</th>
                    <th className="py-2">Seller</th>
                    <th className="py-2">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {trades.map(t => (
                    <tr key={t.trade_id} className="hover:bg-slate-800/40">
                      <td className="py-2 text-blue-400 font-semibold">#{t.trade_id}</td>
                      <td className="py-2 font-bold text-white">{t.symbol}</td>
                      <td className="py-2 text-emerald-400 font-semibold">₹{parseFloat(t.price).toFixed(2)}</td>
                      <td className="py-2 text-slate-200">{t.quantity}</td>
                      <td className="py-2 text-slate-300">
                        ₹{(parseFloat(t.price) * parseInt(t.quantity, 10)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2 text-emerald-400">{t.buyer_username || 'Trader A'}</td>
                      <td className="py-2 text-rose-400">{t.seller_username || 'Trader B'}</td>
                      <td className="py-2 text-slate-500 text-[10px]">
                        {new Date(t.executed_at).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
                  {trades.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-500">
                        No trades executed yet. Cross the book to create matches!
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Tab 3: Positions & Mark-to-Market */}
          {activeTab === 'POSITIONS' && (
            <div className="overflow-x-auto flex-1 font-mono text-xs">
              <table className="w-full text-left">
                <thead className="text-[10px] text-slate-500 uppercase border-b border-slate-800 pb-1">
                  <tr>
                    <th className="py-2">Instrument</th>
                    <th className="py-2">Net Qty</th>
                    <th className="py-2">Avg Cost</th>
                    <th className="py-2">Market Price</th>
                    <th className="py-2">Market Value</th>
                    <th className="py-2">Unrealized P&L</th>
                    <th className="py-2">Realized P&L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {positions.map((p, idx) => {
                    const unPnl = parseFloat(p.unrealized_pnl || '0');
                    const rPnl = parseFloat(p.realized_pnl || '0');
                    return (
                      <tr key={idx} className="hover:bg-slate-800/40">
                        <td className="py-2 font-bold text-white">{p.symbol}</td>
                        <td className="py-2 font-semibold">
                          <span className={parseInt(p.net_qty, 10) >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                            {p.net_qty}
                          </span>
                        </td>
                        <td className="py-2 text-slate-300">₹{parseFloat(p.avg_cost).toFixed(2)}</td>
                        <td className="py-2 text-slate-200">₹{parseFloat(p.current_market_price).toFixed(2)}</td>
                        <td className="py-2 text-slate-200">
                          ₹{parseFloat(p.market_value).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className={`py-2 font-bold ${unPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {unPnl >= 0 ? '+' : ''}₹{unPnl.toFixed(2)}
                        </td>
                        <td className={`py-2 font-bold ${rPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {rPnl >= 0 ? '+' : ''}₹{rPnl.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                  {positions.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
                        No open positions. Execute trades to build your portfolio!
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
