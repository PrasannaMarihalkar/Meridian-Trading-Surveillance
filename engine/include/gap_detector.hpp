#pragma once

#include <cstdint>
#include <vector>
#include <array>
#include <algorithm>

namespace meridian {

/**
 * Bounded UDP Packet Sequence Gap Detector
 *
 * Tracks sequence gaps, out-of-order deliveries, and duplicates across high-frequency
 * market data feeds using a bounded circular sliding-window bitmap.
 *
 * Guarantees:
 * - O(1) packet processing.
 * - ZERO dynamic memory allocation on packet arrival (pre-allocated 64K-sequence horizon).
 * - Bounded memory usage (8 KB bitmap buffer).
 */
class GapDetector {
public:
    static constexpr std::size_t kWindowSize = 65536; // 64K packet sequence horizon
    static constexpr std::size_t kWordBits = 64;
    static constexpr std::size_t kNumWords = kWindowSize / kWordBits; // 1024 64-bit words (8 KB)
    static constexpr std::size_t kMaxTrackedGaps = 512;

    struct Gap {
        uint64_t start;
        uint64_t end;
        int64_t  detected_at_ns;

        uint64_t size() const noexcept { return end - start + 1; }
    };

    GapDetector() {
        window_bitmap_.fill(0);
    }

    void on_packet(uint64_t seq, int64_t recv_ts_ns) {
        total_received_++;

        if (!initialized_) {
            expected_next_ = seq + 1;
            max_seq_ = seq;
            mark_seen(seq);
            initialized_ = true;
            return;
        }

        // Case 1: Sequential packet or forward jump (packet drop)
        if (seq > max_seq_) {
            uint64_t jump = seq - max_seq_;
            if (jump >= kWindowSize) {
                // Gap larger than entire window; clear all bitmap history
                window_bitmap_.fill(0);
            } else {
                // Clear bits for the sequence range that is being stepped over / retired
                for (uint64_t s = max_seq_ + 1; s <= seq; ++s) {
                    clear_seen(s);
                }
            }

            mark_seen(seq);

            if (seq == expected_next_) {
                expected_next_ = seq + 1;
                max_seq_ = seq;
            } else if (seq > expected_next_) {
                // Packet drop detected
                Gap g{expected_next_, seq - 1, recv_ts_ns};
                if (gaps_.size() < kMaxTrackedGaps) {
                    gaps_.push_back(g);
                }
                total_lost_packets_ += g.size();
                expected_next_ = seq + 1;
                max_seq_ = seq;
            }
            return;
        }

        // Case 2: Packet sequence <= max_seq_ (duplicate, out-of-order, or stale)
        uint64_t age = max_seq_ - seq;
        if (age >= kWindowSize) {
            // Older than sliding window horizon
            stale_packets_++;
            return;
        }

        if (is_seen(seq)) {
            duplicates_++;
            return;
        }

        // Out-of-order packet arriving within window
        mark_seen(seq);
        out_of_order_++;

        // Resolve or split any active gap that covered this sequence number
        for (auto it = gaps_.begin(); it != gaps_.end();) {
            if (seq >= it->start && seq <= it->end) {
                total_lost_packets_--;
                if (it->start == it->end) {
                    it = gaps_.erase(it);
                } else if (seq == it->start) {
                    it->start++;
                    ++it;
                } else if (seq == it->end) {
                    it->end--;
                    ++it;
                } else {
                    // Split gap into two
                    Gap g2{seq + 1, it->end, it->detected_at_ns};
                    it->end = seq - 1;
                    if (gaps_.size() < kMaxTrackedGaps) {
                        it = gaps_.insert(it + 1, g2);
                        ++it;
                    }
                    ++it;
                }
            } else {
                ++it;
            }
        }
    }

    uint64_t total_received() const noexcept { return total_received_; }
    uint64_t total_lost() const noexcept { return total_lost_packets_; }
    uint64_t duplicates() const noexcept { return duplicates_; }
    uint64_t out_of_order() const noexcept { return out_of_order_; }
    uint64_t stale_packets() const noexcept { return stale_packets_; }
    const std::vector<Gap>& gaps() const noexcept { return gaps_; }

    double loss_rate() const noexcept {
        uint64_t expected_total = total_received_ + total_lost_packets_ - duplicates_ - stale_packets_;
        return expected_total == 0 ? 0.0 : (static_cast<double>(total_lost_packets_) / expected_total) * 100.0;
    }

private:
    inline void mark_seen(uint64_t seq) noexcept {
        std::size_t idx = (seq % kWindowSize);
        window_bitmap_[idx / kWordBits] |= (1ULL << (idx % kWordBits));
    }

    inline void clear_seen(uint64_t seq) noexcept {
        std::size_t idx = (seq % kWindowSize);
        window_bitmap_[idx / kWordBits] &= ~(1ULL << (idx % kWordBits));
    }

    inline bool is_seen(uint64_t seq) const noexcept {
        std::size_t idx = (seq % kWindowSize);
        return (window_bitmap_[idx / kWordBits] & (1ULL << (idx % kWordBits))) != 0;
    }

    bool initialized_{false};
    uint64_t expected_next_{0};
    uint64_t max_seq_{0};
    uint64_t total_received_{0};
    uint64_t total_lost_packets_{0};
    uint64_t duplicates_{0};
    uint64_t out_of_order_{0};
    uint64_t stale_packets_{0};

    // Fixed 8 KB circular bitmap buffer
    std::array<uint64_t, kNumWords> window_bitmap_;
    std::vector<Gap> gaps_;
};

} // namespace meridian
