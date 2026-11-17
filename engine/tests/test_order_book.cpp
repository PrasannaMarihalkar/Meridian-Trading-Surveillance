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

    // 1. Completely Unfilled IOC Order: No liquidity on book
    Order ioc_unfilled{10, 20, 1, Side::BUY, OrderType::IOC, double_to_price(1400.00), 50, 0, OrderStatus::OPEN, 100};
    auto trades0 = book.process_order(ioc_unfilled);
    assert(trades0.empty());
    assert(ioc_unfilled.filled_qty == 0);
    // REGRESSION ASSERTION: Unfilled IOC order MUST be marked CANCELLED
    assert(ioc_unfilled.status == OrderStatus::CANCELLED);
    assert(book.best_bid() == 0);
    assert(book.total_bid_volume() == 0);

    // 2. Partially Filled IOC Order: 40 shares resting, 100 requested
    Order s1{11, 10, 1, Side::SELL, OrderType::LIMIT, double_to_price(1400.00), 40, 0, OrderStatus::OPEN, 200};
    book.process_order(s1);
    assert(book.best_ask() == double_to_price(1400.00));
    assert(book.total_ask_volume() == 40);

    Order ioc_partial{12, 20, 1, Side::BUY, OrderType::IOC, double_to_price(1400.00), 100, 0, OrderStatus::OPEN, 300};
    auto trades1 = book.process_order(ioc_partial);
    assert(trades1.size() == 1);
    assert(trades1[0].quantity == 40);
    assert(ioc_partial.filled_qty == 40);
    // REGRESSION ASSERTION: Partially filled IOC remainder MUST be cancelled
    assert(ioc_partial.status == OrderStatus::CANCELLED);
    assert(book.best_bid() == 0); // IOC remainder must NOT rest
    assert(book.total_bid_volume() == 0);
    assert(book.best_ask() == 0); // Resting order was consumed

    // 3. Fully Filled IOC Order: 50 shares resting, 50 requested
    Order s2{13, 10, 1, Side::SELL, OrderType::LIMIT, double_to_price(1402.00), 50, 0, OrderStatus::OPEN, 400};
    book.process_order(s2);
    Order ioc_full{14, 20, 1, Side::BUY, OrderType::IOC, double_to_price(1402.00), 50, 0, OrderStatus::OPEN, 500};
    auto trades2 = book.process_order(ioc_full);
    assert(trades2.size() == 1);
    assert(trades2[0].quantity == 50);
    assert(ioc_full.filled_qty == 50);
    assert(ioc_full.status == OrderStatus::FILLED);

    // 4. Test Standard Limit Order Cancellation
    Order s3{15, 10, 1, Side::SELL, OrderType::LIMIT, double_to_price(1405.00), 100, 0, OrderStatus::OPEN, 600};
    book.process_order(s3);
    assert(book.best_ask() == double_to_price(1405.00));
    assert(book.cancel_order(15) == true);
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
    std::cout << "[TEST] Running exhaustive test_gap_detector..." << std::endl;
    GapDetector detector;

    // 1. Verify bounded memory footprint: 8 KB bitmap + 12 KB gap array + counters
    std::cout << "  [INFO] GapDetector sizeof: " << sizeof(GapDetector) << " bytes (bounded, contiguous, zero heap allocation)" << std::endl;
    assert(sizeof(GapDetector) <= 32768); // Strictly bounded under 32 KB
    assert(sizeof(GapDetector) >= 20480); // Contiguous buffer containing 512 gaps and 1024 words

    // 2. Sequential arrival of packets 1..100
    for (uint64_t seq = 1; seq <= 100; ++seq) {
        detector.on_packet(seq, seq * 1000);
    }
    assert(detector.total_received() == 100);
    assert(detector.total_lost() == 0);
    assert(detector.duplicates() == 0);
    assert(detector.out_of_order() == 0);
    assert(detector.stale_packets() == 0);
    assert(detector.gaps().empty());

    // 3. Duplicate packet arrivals
    detector.on_packet(50, 100500);
    detector.on_packet(100, 100600);
    assert(detector.total_received() == 102);
    assert(detector.duplicates() == 2);
    assert(detector.total_lost() == 0);

    // 4. Large forward jump within window (delta = 50,000 packets)
    // Advance from seq 100 to seq 50,101 -> gap [101, 50100]
    detector.on_packet(50101, 200000);
    assert(detector.total_received() == 103);
    assert(detector.total_lost() == 50000);
    assert(detector.gaps().size() == 1);
    assert(detector.gaps()[0].start == 101);
    assert(detector.gaps()[0].end == 50100);
    assert(detector.gaps()[0].size() == 50000);

    // 5. Out-of-order arrival: resolve head of gap (packet 101)
    detector.on_packet(101, 210000);
    assert(detector.total_lost() == 49999);
    assert(detector.out_of_order() == 1);
    assert(detector.gaps().size() == 1);
    assert(detector.gaps()[0].start == 102);
    assert(detector.gaps()[0].end == 50100);

    // 6. Out-of-order arrival: resolve tail of gap (packet 50100)
    detector.on_packet(50100, 220000);
    assert(detector.total_lost() == 49998);
    assert(detector.out_of_order() == 2);
    assert(detector.gaps().size() == 1);
    assert(detector.gaps()[0].start == 102);
    assert(detector.gaps()[0].end == 50099);

    // 7. Out-of-order arrival: middle of gap (packet 25,000) splits gap into two
    detector.on_packet(25000, 230000);
    assert(detector.total_lost() == 49997);
    assert(detector.out_of_order() == 3);
    assert(detector.gaps().size() == 2);
    assert(detector.gaps()[0].start == 102);
    assert(detector.gaps()[0].end == 24999);
    assert(detector.gaps()[1].start == 25001);
    assert(detector.gaps()[1].end == 50099);

    // 8. Duplicate of out-of-order packet (packet 25,000 arrives again)
    detector.on_packet(25000, 240000);
    assert(detector.duplicates() == 3);
    assert(detector.out_of_order() == 3);

    // 9. Stale packet arrival: packet 5 arrives when max_seq is 50101 + advance to 120,000
    // Advance max_seq to 120,000 (jump = 69,899 >= 65,536 window horizon)
    detector.on_packet(120000, 300000);
    assert(detector.total_lost() > 0);
    // Packet 10 is age 120000 - 10 = 119990 > 65536 -> stale
    uint64_t prev_stale = detector.stale_packets();
    detector.on_packet(10, 310000);
    assert(detector.stale_packets() == prev_stale + 1);

    // 10. Max tracked gaps saturation test (512 distinct gaps)
    GapDetector sat_detector;
    sat_detector.on_packet(1, 1000);
    // Create 512 discrete single-packet gaps by skipping odd sequence numbers
    // Packet 3 -> gap [2,2] (1 gap)
    // Packet 5 -> gap [4,4] (2 gaps)
    // Packet 2*k + 1 -> gap [2*k, 2*k]
    for (uint64_t k = 1; k <= 512; ++k) {
        sat_detector.on_packet(2 * k + 1, 1000 + k * 10);
    }
    assert(sat_detector.gaps().size() == GapDetector::kMaxTrackedGaps);
    assert(sat_detector.gaps_saturated() == 0);

    // Attempt to introduce the 513th gap (must saturate safely without overflow or allocation)
    sat_detector.on_packet(2 * 513 + 1, 10000);
    assert(sat_detector.gaps().size() == GapDetector::kMaxTrackedGaps);
    assert(sat_detector.gaps_saturated() == 1);

    // Resolve one existing gap (packet 2 arrives)
    sat_detector.on_packet(2, 10010);
    assert(sat_detector.gaps().size() == GapDetector::kMaxTrackedGaps - 1);
    assert(sat_detector.out_of_order() == 1);

    std::cout << "  ✓ test_gap_detector passed (exhaustive: sequential, large jumps, bit clearing, splits, stale, duplicates, saturation)" << std::endl;
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
