#pragma once

#include <cstdint>
#include <string>
#include <vector>
#include <chrono>

namespace meridian {

using OrderId = uint64_t;
using AccountId = uint64_t;
using InstrumentId = uint16_t;
using Price = int64_t;       // Stored as fixed-point decimal (price * 10000) e.g., $1400.50 -> 14005000
using Quantity = uint64_t;
using SeqNum = uint64_t;

inline constexpr int64_t kPriceScale = 10000;

inline double price_to_double(Price p) {
    return static_cast<double>(p) / static_cast<double>(kPriceScale);
}

inline Price double_to_price(double d) {
    return static_cast<Price>(d * static_cast<double>(kPriceScale) + 0.5);
}

enum class Side : uint8_t {
    BUY = 0,
    SELL = 1
};

inline const char* side_to_string(Side s) {
    return s == Side::BUY ? "BUY" : "SELL";
}

enum class OrderType : uint8_t {
    LIMIT = 0,
    MARKET = 1,
    IOC = 2     // Immediate-or-Cancel
};

inline const char* order_type_to_string(OrderType t) {
    switch (t) {
        case OrderType::LIMIT: return "LIMIT";
        case OrderType::MARKET: return "MARKET";
        case OrderType::IOC: return "IOC";
        default: return "UNKNOWN";
    }
}

enum class OrderStatus : uint8_t {
    OPEN = 0,
    PARTIALLY_FILLED = 1,
    FILLED = 2,
    CANCELLED = 3,
    REJECTED = 4
};

inline const char* order_status_to_string(OrderStatus s) {
    switch (s) {
        case OrderStatus::OPEN: return "OPEN";
        case OrderStatus::PARTIALLY_FILLED: return "PARTIALLY_FILLED";
        case OrderStatus::FILLED: return "FILLED";
        case OrderStatus::CANCELLED: return "CANCELLED";
        case OrderStatus::REJECTED: return "REJECTED";
        default: return "UNKNOWN";
    }
}

struct Order {
    OrderId order_id{0};
    AccountId account_id{0};
    InstrumentId instrument_id{0};
    Side side{Side::BUY};
    OrderType order_type{OrderType::LIMIT};
    Price price{0};
    Quantity quantity{0};
    Quantity filled_qty{0};
    OrderStatus status{OrderStatus::OPEN};
    uint64_t timestamp_ns{0};

    Quantity leaves_qty() const {
        return quantity > filled_qty ? quantity - filled_qty : 0;
    }
};

struct Trade {
    SeqNum engine_seq{0};
    InstrumentId instrument_id{0};
    OrderId buy_order_id{0};
    OrderId sell_order_id{0};
    AccountId buyer_account_id{0};
    AccountId seller_account_id{0};
    Price price{0};
    Quantity quantity{0};
    Side aggressor_side{Side::BUY};
    uint64_t executed_at_ns{0};
};

struct BookLevel {
    Price price{0};
    Quantity total_qty{0};
    uint32_t order_count{0};
};

struct BookSnapshot {
    InstrumentId instrument_id{0};
    uint64_t timestamp_ns{0};
    std::vector<BookLevel> bids; // Highest price first
    std::vector<BookLevel> asks; // Lowest price first
};

} // namespace meridian
