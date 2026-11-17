#include "../include/order_book.hpp"
#include "../include/spsc_queue.hpp"
#include "../include/gap_detector.hpp"
#include <iostream>
#include <cassert>
#include <thread>
#include <vector>

using namespace meridian;

void test_limit_order_matching() {
    std::cout << "[TEST] Running test_limit_order_matching..." << std::endl;
    OrderBook book(1, 500);

    // 1. Resting Sell Limit: 100 shares @ $1400.00
    Order sell1;
    sell1.order_id = 1001;
    sell1.account_id = 201;
    sell1.instrument_id = 1;
    sell1.side = Side::SELL;
    sell1.order_type = OrderType::LIMIT;
    sell1.price = double_to_price(1400.00);
    sell1.quantity = 100;

    auto trades1 = book.process_order(sell1);
    assert(trades1.empty());
    assert(book.best_ask() == double_to_price(1400.00));
    assert(book.total_ask_volume() == 100);

    // 2. Incoming Aggressive Buy Limit: 100 shares @ $1400.00
    Order buy1;
    buy1.order_id = 1002;
    buy1.account_id = 202;
    buy1.instrument_id = 1;
    buy1.side = Side::BUY;
    buy1.order_type = OrderType::LIMIT;
    buy1.price = double_to_price(1400.00);
    buy1.quantity = 100;

    auto trades2 = book.process_order(buy1);
    assert(trades2.size() == 1);
    assert(trades2[0].quantity == 100);
    assert(trades2[0].price == double_to_price(1400.00));
    assert(trades2[0].buy_order_id == 1002);
    assert(trades2[0].sell_order_id == 1001);
    assert(trades2[0].aggressor_side == Side::BUY);

    // Book should now be clean
    assert(book.best_ask() == 0);
    assert(book.total_ask_volume() == 0);
    std::cout << "  ✓ test_limit_order_matching passed" << std::endl;
}

void test_price_time_priority() {
    std::cout << "[TEST] Running test_price_time_priority..." << std::endl;
    OrderBook book(1, 500);

    // Place Sell A: 50 @ $1401.00
    Order s1{1, 10, 1, Side::SELL, OrderType::LIMIT, double_to_price(1401.00), 50, 0, OrderStatus::OPEN, 100};
    book.process_order(s1);

    // Place Sell B: 50 @ $1400.00 (Better price)
    Order s2{2, 11, 1, Side::SELL, OrderType::LIMIT, double_to_price(1400.00), 50, 0, OrderStatus::OPEN, 200};
    book.process_order(s2);

    // Place Sell C: 50 @ $1400.00 (Same price as B, but later time)
    Order s3{3, 12, 1, Side::SELL, OrderType::LIMIT, double_to_price(1400.00), 50, 0, OrderStatus::OPEN, 300};
    book.process_order(s3);

    // Incoming Buy: 80 shares @ $1401.00
    // Price Priority: Must match $1400.00 before $1401.00
    // Time Priority: Must match s2 (50 shares) before s3 (30 shares)
    Order buy{4, 20, 1, Side::BUY, OrderType::LIMIT, double_to_price(1401.00), 80, 0, OrderStatus::OPEN, 400};
    auto trades = book.process_order(buy);

    assert(trades.size() == 2);
    // Trade 1: matched with s2 for 50 shares @ 1400.00
    assert(trades[0].sell_order_id == 2);
    assert(trades[0].quantity == 50);
    assert(trades[0].price == double_to_price(1400.00));

    // Trade 2: matched with s3 for 30 shares @ 1400.00
    assert(trades[1].sell_order_id == 3);
    assert(trades[1].quantity == 30);
    assert(trades[1].price == double_to_price(1400.00));

    // Remaining in book: s3 has 20 shares left @ 1400.00; s1 has 50 shares @ 1401.00
    assert(book.best_ask() == double_to_price(1400.00));
    assert(book.total_ask_volume() == 70);

    std::cout << "  ✓ test_price_time_priority passed" << std::endl;
}

void test_ioc_and_cancellation() {
    std::cout << "[TEST] Running test_ioc_and_cancellation..." << std::endl;
    OrderBook book(1, 500);

    // Rest 40 shares @ $1400.00
    Order s1{10, 10, 1, Side::SELL, OrderType::LIMIT, double_to_price(1400.00), 40, 0, OrderStatus::OPEN, 100};
    book.process_order(s1);

    // IOC Buy: 100 shares @ $1400.00
    // Should match 40 shares, and remaining 60 shares must NOT rest on book
    Order ioc_buy{11, 20, 1, Side::BUY, OrderType::IOC, double_to_price(1400.00), 100, 0, OrderStatus::OPEN, 200};
    auto trades = book.process_order(ioc_buy);

    assert(trades.size() == 1);
    assert(trades[0].quantity == 40);
    assert(book.best_bid() == 0); // IOC must not rest
    assert(book.total_bid_volume() == 0);

    // Test Cancellation
    Order s2{12, 10, 1, Side::SELL, OrderType::LIMIT, double_to_price(1405.00), 100, 0, OrderStatus::OPEN, 300};
    book.process_order(s2);
    assert(book.best_ask() == double_to_price(1405.00));
    assert(book.cancel_order(12) == true);
    assert(book.best_ask() == 0);
    assert(book.total_ask_volume() == 0);

    std::cout << "  ✓ test_ioc_and_cancellation passed" << std::endl;
}

void test_spsc_queue_concurrency() {
    std::cout << "[TEST] Running test_spsc_queue_concurrency..." << std::endl;
    constexpr std::size_t kQueueCap = 1024;
    constexpr uint64_t kNumItems = 100000;

    SPSCQueue<uint64_t, kQueueCap> queue;
    std::atomic<bool> start_flag{false};

    std::thread producer([&]() {
        while (!start_flag.load(std::memory_order_acquire)) {}
        for (uint64_t i = 1; i <= kNumItems; ++i) {
            while (!queue.try_push(i)) {
                std::this_thread::yield();
            }
        }
    });

    std::thread consumer([&]() {
        while (!start_flag.load(std::memory_order_acquire)) {}
        uint64_t expected = 1;
        while (expected <= kNumItems) {
            uint64_t val = 0;
            if (queue.try_pop(val)) {
                assert(val == expected);
                expected++;
            } else {
                std::this_thread::yield();
            }
        }
    });

    start_flag.store(true, std::memory_order_release);
    producer.join();
    consumer.join();

    std::cout << "  ✓ test_spsc_queue_concurrency passed (" << kNumItems << " items transferred lock-free)" << std::endl;
}

void test_gap_detector() {
    std::cout << "[TEST] Running test_gap_detector..." << std::endl;
    GapDetector detector;

    // Receive packets 1, 2, 3
    detector.on_packet(1, 1000);
    detector.on_packet(2, 2000);
    detector.on_packet(3, 3000);
    assert(detector.total_received() == 3);
    assert(detector.total_lost() == 0);

    // Skip packets 4, 5 and receive packet 6
    detector.on_packet(6, 6000);
    assert(detector.total_lost() == 2);
    assert(detector.gaps().size() == 1);
    assert(detector.gaps()[0].start == 4);
    assert(detector.gaps()[0].end == 5);

    // Out-of-order arrival of packet 4 (partial gap fill)
    detector.on_packet(4, 7000);
    assert(detector.total_lost() == 1);
    assert(detector.gaps()[0].start == 5);
    assert(detector.gaps()[0].end == 5);

    // Out-of-order arrival of packet 5 (gap completely resolved)
    detector.on_packet(5, 8000);
    assert(detector.total_lost() == 0);
    assert(detector.gaps().empty());

    std::cout << "  ✓ test_gap_detector passed" << std::endl;
}

int main() {
    std::cout << "=== MERIDIAN C++ SYSTEMS TEST HARNESS ===" << std::endl;
    test_limit_order_matching();
    test_price_time_priority();
    test_ioc_and_cancellation();
    test_spsc_queue_concurrency();
    test_gap_detector();
    std::cout << "\n[ALL TESTS PASSED] 5 out of 5 C++ test suites succeeded!" << std::endl;
    return 0;
}
