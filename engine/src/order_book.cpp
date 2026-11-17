#include "../include/order_book.hpp"
#include <algorithm>
#include <chrono>

namespace meridian {

inline uint64_t now_ns() {
    return std::chrono::duration_cast<std::chrono::nanoseconds>(
        std::chrono::high_resolution_clock::now().time_since_epoch()
    ).count();
}

OrderBook::OrderBook(InstrumentId instrument_id, Price tick_size)
    : instrument_id_(instrument_id), tick_size_(tick_size) {}

Price OrderBook::best_bid() const noexcept {
    return bids_.empty() ? 0 : bids_.begin()->first;
}

Price OrderBook::best_ask() const noexcept {
    return asks_.empty() ? 0 : asks_.begin()->first;
}

Price OrderBook::spread() const noexcept {
    if (bids_.empty() || asks_.empty()) return 0;
    return best_ask() - best_bid();
}

Price OrderBook::mid_price() const noexcept {
    if (bids_.empty() || asks_.empty()) return 0;
    return (best_ask() + best_bid()) / 2;
}

Quantity OrderBook::total_bid_volume() const noexcept {
    return total_bid_vol_;
}

Quantity OrderBook::total_ask_volume() const noexcept {
    return total_ask_vol_;
}

const Order* OrderBook::find_order(OrderId order_id) const {
    auto it = order_map_.find(order_id);
    if (it == order_map_.end()) return nullptr;
    return &(*(it->second.iter));
}

bool OrderBook::cancel_order(OrderId order_id) {
    auto it = order_map_.find(order_id);
    if (it == order_map_.end()) return false;

    const OrderLocation& loc = it->second;
    if (loc.side == Side::BUY) {
        auto level_it = bids_.find(loc.price);
        if (level_it != bids_.end()) {
            total_bid_vol_ -= loc.iter->leaves_qty();
            level_it->second.erase(loc.iter);
            if (level_it->second.empty()) {
                bids_.erase(level_it);
            }
        }
    } else {
        auto level_it = asks_.find(loc.price);
        if (level_it != asks_.end()) {
            total_ask_vol_ -= loc.iter->leaves_qty();
            level_it->second.erase(loc.iter);
            if (level_it->second.empty()) {
                asks_.erase(level_it);
            }
        }
    }

    order_map_.erase(it);
    return true;
}

std::vector<Trade> OrderBook::process_order(Order order) {
    if (order.timestamp_ns == 0) {
        order.timestamp_ns = now_ns();
    }

    std::vector<Trade> trades;

    if (order.order_type == OrderType::MARKET) {
        if (order.side == Side::BUY) {
            trades = match_market_buy(order);
        } else {
            trades = match_market_sell(order);
        }
        return trades;
    }

    if (order.side == Side::BUY) {
        trades = match_limit_buy(order);
    } else {
        trades = match_limit_sell(order);
    }

    // If order has unfulfilled balance and is standard LIMIT (not IOC), rest it on the book
    if (order.leaves_qty() > 0 && order.order_type == OrderType::LIMIT) {
        order.status = (order.filled_qty > 0) ? OrderStatus::PARTIALLY_FILLED : OrderStatus::OPEN;
        if (order.side == Side::BUY) {
            auto& level = bids_[order.price];
            level.push_back(order);
            auto iter = --level.end();
            order_map_[order.order_id] = {Side::BUY, order.price, iter};
            total_bid_vol_ += order.leaves_qty();
        } else {
            auto& level = asks_[order.price];
            level.push_back(order);
            auto iter = --level.end();
            order_map_[order.order_id] = {Side::SELL, order.price, iter};
            total_ask_vol_ += order.leaves_qty();
        }
    }

    return trades;
}

std::vector<Trade> OrderBook::match_limit_buy(Order& order) {
    std::vector<Trade> trades;

    while (order.leaves_qty() > 0 && !asks_.empty()) {
        auto best_ask_it = asks_.begin();
        if (best_ask_it->first > order.price) {
            break; // Limit price below best ask; cannot cross
        }

        auto& resting_orders = best_ask_it->second;
        while (order.leaves_qty() > 0 && !resting_orders.empty()) {
            Order& resting = resting_orders.front();
            Quantity fill_qty = std::min(order.leaves_qty(), resting.leaves_qty());
            Price trade_price = resting.price; // Passive order determines execution price

            order.filled_qty += fill_qty;
            resting.filled_qty += fill_qty;
            total_ask_vol_ -= fill_qty;

            Trade t;
            t.engine_seq = next_seq_++;
            t.instrument_id = instrument_id_;
            t.buy_order_id = order.order_id;
            t.sell_order_id = resting.order_id;
            t.buyer_account_id = order.account_id;
            t.seller_account_id = resting.account_id;
            t.price = trade_price;
            t.quantity = fill_qty;
            t.aggressor_side = Side::BUY;
            t.executed_at_ns = now_ns();
            trades.push_back(t);

            if (resting.leaves_qty() == 0) {
                resting.status = OrderStatus::FILLED;
                order_map_.erase(resting.order_id);
                resting_orders.pop_front();
            } else {
                resting.status = OrderStatus::PARTIALLY_FILLED;
            }
        }

        if (resting_orders.empty()) {
            asks_.erase(best_ask_it);
        }
    }

    order.status = (order.leaves_qty() == 0) ? OrderStatus::FILLED :
                   (order.filled_qty > 0) ? OrderStatus::PARTIALLY_FILLED : OrderStatus::OPEN;
    return trades;
}

std::vector<Trade> OrderBook::match_limit_sell(Order& order) {
    std::vector<Trade> trades;

    while (order.leaves_qty() > 0 && !bids_.empty()) {
        auto best_bid_it = bids_.begin();
        if (best_bid_it->first < order.price) {
            break; // Limit price above best bid; cannot cross
        }

        auto& resting_orders = best_bid_it->second;
        while (order.leaves_qty() > 0 && !resting_orders.empty()) {
            Order& resting = resting_orders.front();
            Quantity fill_qty = std::min(order.leaves_qty(), resting.leaves_qty());
            Price trade_price = resting.price; // Passive order determines execution price

            order.filled_qty += fill_qty;
            resting.filled_qty += fill_qty;
            total_bid_vol_ -= fill_qty;

            Trade t;
            t.engine_seq = next_seq_++;
            t.instrument_id = instrument_id_;
            t.buy_order_id = resting.order_id;
            t.sell_order_id = order.order_id;
            t.buyer_account_id = resting.account_id;
            t.seller_account_id = order.account_id;
            t.price = trade_price;
            t.quantity = fill_qty;
            t.aggressor_side = Side::SELL;
            t.executed_at_ns = now_ns();
            trades.push_back(t);

            if (resting.leaves_qty() == 0) {
                resting.status = OrderStatus::FILLED;
                order_map_.erase(resting.order_id);
                resting_orders.pop_front();
            } else {
                resting.status = OrderStatus::PARTIALLY_FILLED;
            }
        }

        if (resting_orders.empty()) {
            bids_.erase(best_bid_it);
        }
    }

    order.status = (order.leaves_qty() == 0) ? OrderStatus::FILLED :
                   (order.filled_qty > 0) ? OrderStatus::PARTIALLY_FILLED : OrderStatus::OPEN;
    return trades;
}

std::vector<Trade> OrderBook::match_market_buy(Order& order) {
    std::vector<Trade> trades;

    while (order.leaves_qty() > 0 && !asks_.empty()) {
        auto best_ask_it = asks_.begin();
        auto& resting_orders = best_ask_it->second;

        while (order.leaves_qty() > 0 && !resting_orders.empty()) {
            Order& resting = resting_orders.front();
            Quantity fill_qty = std::min(order.leaves_qty(), resting.leaves_qty());
            Price trade_price = resting.price;

            order.filled_qty += fill_qty;
            resting.filled_qty += fill_qty;
            total_ask_vol_ -= fill_qty;

            Trade t;
            t.engine_seq = next_seq_++;
            t.instrument_id = instrument_id_;
            t.buy_order_id = order.order_id;
            t.sell_order_id = resting.order_id;
            t.buyer_account_id = order.account_id;
            t.seller_account_id = resting.account_id;
            t.price = trade_price;
            t.quantity = fill_qty;
            t.aggressor_side = Side::BUY;
            t.executed_at_ns = now_ns();
            trades.push_back(t);

            if (resting.leaves_qty() == 0) {
                resting.status = OrderStatus::FILLED;
                order_map_.erase(resting.order_id);
                resting_orders.pop_front();
            } else {
                resting.status = OrderStatus::PARTIALLY_FILLED;
            }
        }

        if (resting_orders.empty()) {
            asks_.erase(best_ask_it);
        }
    }

    order.status = (order.leaves_qty() == 0) ? OrderStatus::FILLED :
                   (order.filled_qty > 0) ? OrderStatus::PARTIALLY_FILLED : OrderStatus::CANCELLED;
    return trades;
}

std::vector<Trade> OrderBook::match_market_sell(Order& order) {
    std::vector<Trade> trades;

    while (order.leaves_qty() > 0 && !bids_.empty()) {
        auto best_bid_it = bids_.begin();
        auto& resting_orders = best_bid_it->second;

        while (order.leaves_qty() > 0 && !resting_orders.empty()) {
            Order& resting = resting_orders.front();
            Quantity fill_qty = std::min(order.leaves_qty(), resting.leaves_qty());
            Price trade_price = resting.price;

            order.filled_qty += fill_qty;
            resting.filled_qty += fill_qty;
            total_bid_vol_ -= fill_qty;

            Trade t;
            t.engine_seq = next_seq_++;
            t.instrument_id = instrument_id_;
            t.buy_order_id = resting.order_id;
            t.sell_order_id = order.order_id;
            t.buyer_account_id = resting.account_id;
            t.seller_account_id = order.account_id;
            t.price = trade_price;
            t.quantity = fill_qty;
            t.aggressor_side = Side::SELL;
            t.executed_at_ns = now_ns();
            trades.push_back(t);

            if (resting.leaves_qty() == 0) {
                resting.status = OrderStatus::FILLED;
                order_map_.erase(resting.order_id);
                resting_orders.pop_front();
            } else {
                resting.status = OrderStatus::PARTIALLY_FILLED;
            }
        }

        if (resting_orders.empty()) {
            bids_.erase(best_bid_it);
        }
    }

    order.status = (order.leaves_qty() == 0) ? OrderStatus::FILLED :
                   (order.filled_qty > 0) ? OrderStatus::PARTIALLY_FILLED : OrderStatus::CANCELLED;
    return trades;
}

BookSnapshot OrderBook::get_snapshot(std::size_t max_depth) const {
    BookSnapshot snap;
    snap.instrument_id = instrument_id_;
    snap.timestamp_ns = now_ns();

    std::size_t count = 0;
    for (const auto& [price, orders] : bids_) {
        if (++count > max_depth) break;
        Quantity total_qty = 0;
        for (const auto& o : orders) {
            total_qty += o.leaves_qty();
        }
        snap.bids.push_back({price, total_qty, static_cast<uint32_t>(orders.size())});
    }

    count = 0;
    for (const auto& [price, orders] : asks_) {
        if (++count > max_depth) break;
        Quantity total_qty = 0;
        for (const auto& o : orders) {
            total_qty += o.leaves_qty();
        }
        snap.asks.push_back({price, total_qty, static_cast<uint32_t>(orders.size())});
    }

    return snap;
}

} // namespace meridian
