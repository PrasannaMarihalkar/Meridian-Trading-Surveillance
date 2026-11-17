#include "../include/order_book.hpp"
#include <iostream>
#include <chrono>
#include <vector>
#include <algorithm>
#include <numeric>
#include <iomanip>

using namespace meridian;

int main() {
    std::cout << "=== MERIDIAN MATCHING ENGINE BENCHMARK ===" << std::endl;
    constexpr std::size_t kWarmupOrders = 10000;
    constexpr std::size_t kBenchmarkOrders = 100000;

    OrderBook book(1, 500);

    // Warmup
    for (std::size_t i = 0; i < kWarmupOrders; ++i) {
        Order o;
        o.order_id = i + 1;
        o.account_id = (i % 2 == 0) ? 101 : 102;
        o.instrument_id = 1;
        o.side = (i % 2 == 0) ? Side::BUY : Side::SELL;
        o.order_type = OrderType::LIMIT;
        o.price = double_to_price(1400.00 + (i % 50) * 0.05);
        o.quantity = 10;
        book.process_order(o);
    }

    // Benchmark Run
    std::vector<int64_t> latencies_ns;
    latencies_ns.reserve(kBenchmarkOrders);

    auto start_time = std::chrono::high_resolution_clock::now();

    for (std::size_t i = 0; i < kBenchmarkOrders; ++i) {
        Order o;
        o.order_id = kWarmupOrders + i + 1;
        o.account_id = (i % 2 == 0) ? 101 : 102;
        o.instrument_id = 1;
        o.side = (i % 2 == 0) ? Side::BUY : Side::SELL;
        o.order_type = OrderType::LIMIT;
        o.price = double_to_price(1400.00 + (i % 20) * 0.05);
        o.quantity = 10;

        auto t0 = std::chrono::high_resolution_clock::now();
        book.process_order(o);
        auto t1 = std::chrono::high_resolution_clock::now();

        latencies_ns.push_back(std::chrono::duration_cast<std::chrono::nanoseconds>(t1 - t0).count());
    }

    auto end_time = std::chrono::high_resolution_clock::now();
    double total_ms = std::chrono::duration_cast<std::chrono::duration<double, std::milli>>(end_time - start_time).count();
    double ops_per_sec = (static_cast<double>(kBenchmarkOrders) / total_ms) * 1000.0;

    std::sort(latencies_ns.begin(), latencies_ns.end());
    int64_t p50 = latencies_ns[kBenchmarkOrders * 50 / 100];
    int64_t p90 = latencies_ns[kBenchmarkOrders * 90 / 100];
    int64_t p99 = latencies_ns[kBenchmarkOrders * 99 / 100];
    int64_t p999 = latencies_ns[kBenchmarkOrders * 999 / 1000];
    int64_t max_lat = latencies_ns.back();

    std::cout << "\nBenchmark Results (" << kBenchmarkOrders << " orders):" << std::endl;
    std::cout << "  Total Duration: " << std::fixed << std::setprecision(2) << total_ms << " ms" << std::endl;
    std::cout << "  Throughput:     " << static_cast<uint64_t>(ops_per_sec) << " orders/sec" << std::endl;
    std::cout << "  Latency p50:    " << p50 << " ns (" << std::setprecision(3) << p50 / 1000.0 << " us)" << std::endl;
    std::cout << "  Latency p90:    " << p90 << " ns (" << std::setprecision(3) << p90 / 1000.0 << " us)" << std::endl;
    std::cout << "  Latency p99:    " << p99 << " ns (" << std::setprecision(3) << p99 / 1000.0 << " us)" << std::endl;
    std::cout << "  Latency p99.9:  " << p999 << " ns (" << std::setprecision(3) << p999 / 1000.0 << " us)" << std::endl;
    std::cout << "  Max Latency:    " << max_lat << " ns (" << std::setprecision(3) << max_lat / 1000.0 << " us)" << std::endl;

    return 0;
}
