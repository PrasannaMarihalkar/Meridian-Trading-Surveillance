#pragma once

#include "types.hpp"
#include <map>
#include <list>
#include <unordered_map>
#include <vector>
#include <functional>

namespace meridian {

class OrderBook {
public:
    explicit OrderBook(InstrumentId instrument_id, Price tick_size = 500); // 500 = 0.0500 in fixed-point

    // Process incoming order: match or rest on book. Returns generated trade executions.
    std::vector<Trade> process_order(Order order);

    // Cancel a resting order
    bool cancel_order(OrderId order_id);

    // Order lookup
    const Order* find_order(OrderId order_id) const;

    // Book state queries
    Price best_bid() const noexcept;
    Price best_ask() const noexcept;
    Price spread() const noexcept;
    Price mid_price() const noexcept;
    Quantity total_bid_volume() const noexcept;
    Quantity total_ask_volume() const noexcept;

    // Snapshot generation for WebSocket streaming and surveillance feature extraction
    BookSnapshot get_snapshot(std::size_t max_depth = 10) const;

    InstrumentId instrument_id() const noexcept { return instrument_id_; }
    SeqNum current_seq() const noexcept { return next_seq_ - 1; }

private:
    struct OrderLocation {
        Side side;
        Price price;
        std::list<Order>::iterator iter;
    };

    InstrumentId instrument_id_;
    Price tick_size_;
    SeqNum next_seq_{1};

    // Bids sorted in descending order: highest price first
    std::map<Price, std::list<Order>, std::greater<Price>> bids_;

    // Asks sorted in ascending order: lowest price first
    std::map<Price, std::list<Order>, std::less<Price>> asks_;

    // Hash map for O(1) order location by OrderId
    std::unordered_map<OrderId, OrderLocation> order_map_;

    Quantity total_bid_vol_{0};
    Quantity total_ask_vol_{0};

    std::vector<Trade> match_limit_buy(Order& order);
    std::vector<Trade> match_limit_sell(Order& order);
    std::vector<Trade> match_market_buy(Order& order);
    std::vector<Trade> match_market_sell(Order& order);
};

} // namespace meridian
