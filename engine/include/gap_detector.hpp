#pragma once

#include <cstdint>
#include <array>
#include <span>
#include <algorithm>

namespace meridian {

/**
 * Bounded UDP Packet Sequence Gap Detector
 *
 * Tracks sequence gaps, out-of-order deliveries, and duplicates across high-frequency
 * market data feeds using a bounded circular sliding-window bitmap and a fixed-capacity
 * gap table.
 *
 * Architectural & Performance Guarantees:
 * - ZERO dynamic memory allocation on packet arrival (pre-allocated 64K-sequence horizon and fixed gap array).
 * - Bounded contiguous memory footprint: Exactly 8 KB circular bitmap + 12 KB gap array + counters (~20.5 KB total).
 * - Worst-Case Time Complexity:
 *   - Sequential arrival (delta = 1): O(1) bit manipulation (~5-10 ns).
 *   - Forward jump (drop) of size Delta: O(min(ceil(Delta / 64), 1024)) word-level clears.
 *     Full window jump clears 1024 words (<= 1024 memory writes, ~100 ns).
 *   - Duplicate / Stale packet: O(1) bit lookup / age comparison.
 *   - Out-of-order resolution: O(G) where G <= kMaxTrackedGaps (512 contiguous POD structs in L1 cache).
 * - Failure Isolation: Gap capacity saturation increments `gaps_saturated_` counter without crashing,
 *   allocating heap memory, or throwing exceptions.
 */
class GapDetector {
public:
    static constexpr std::size_t kWindowSize = 65536; // 64K packet sequence horizon
    static constexpr std::size_t kWordBits = 64;
    static constexpr std::size_t kNumWords = kWindowSize / kWordBits; // 1024 64-bit words (8 KB)
    static constexpr std::size_t kMaxTrackedGaps = 512;

    struct Gap {
        uint64_t start{0};
        uint64_t end{0};
        int64_t  detected_at_ns{0};

        uint64_t size() const noexcept { return (end >= start) ? (end - start + 1) : 0; }
    };

    GapDetector() noexcept {
        window_bitmap_.fill(0);
        gaps_.fill(Gap{});
    }

    void on_packet(uint64_t seq, int64_t recv_ts_ns) noexcept {
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
                // Gap larger than or equal to window horizon; clear all bitmap history
                window_bitmap_.fill(0);
                // All prior gaps have expired outside the sliding window
                num_gaps_ = 0;
            } else {
                // Clear bits for sequence range [max_seq_ + 1, seq] using word-level batch clears
                clear_seq_range(max_seq_ + 1, seq);
                // Prune any tracked gaps that have now fallen behind the window horizon
                prune_expired_gaps(seq);
            }

            mark_seen(seq);

            if (seq == expected_next_) {
                expected_next_ = seq + 1;
                max_seq_ = seq;
            } else if (seq > expected_next_) {
                // Packet drop detected: range [expected_next_, seq - 1]
                Gap g{expected_next_, seq - 1, recv_ts_ns};
                if (num_gaps_ < kMaxTrackedGaps) {
                    gaps_[num_gaps_++] = g;
                } else {
                    gaps_saturated_++;
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
        for (std::size_t i = 0; i < num_gaps_;) {
            if (seq >= gaps_[i].start && seq <= gaps_[i].end) {
                total_lost_packets_--;
                if (gaps_[i].start == gaps_[i].end) {
                    // Fully resolved single-packet gap: remove by shifting remaining gaps down
                    for (std::size_t j = i; j + 1 < num_gaps_; ++j) {
                        gaps_[j] = gaps_[j + 1];
                    }
                    num_gaps_--;
                    // Re-check current index i
                } else if (seq == gaps_[i].start) {
                    // Head of gap resolved
                    gaps_[i].start++;
                    ++i;
                } else if (seq == gaps_[i].end) {
                    // Tail of gap resolved
                    gaps_[i].end--;
                    ++i;
                } else {
                    // Middle of gap resolved: split [start, seq - 1] and [seq + 1, end]
                    Gap g2{seq + 1, gaps_[i].end, gaps_[i].detected_at_ns};
                    gaps_[i].end = seq - 1;
                    if (num_gaps_ < kMaxTrackedGaps) {
                        // Insert g2 right after index i
                        for (std::size_t j = num_gaps_; j > i + 1; --j) {
                            gaps_[j] = gaps_[j - 1];
                        }
                        gaps_[i + 1] = g2;
                        num_gaps_++;
                        i += 2;
                    } else {
                        // Saturation: cannot track split secondary gap
                        gaps_saturated_++;
                        ++i;
                    }
                }
            } else {
                ++i;
            }
        }
    }

    uint64_t total_received() const noexcept { return total_received_; }
    uint64_t total_lost() const noexcept { return total_lost_packets_; }
    uint64_t duplicates() const noexcept { return duplicates_; }
    uint64_t out_of_order() const noexcept { return out_of_order_; }
    uint64_t stale_packets() const noexcept { return stale_packets_; }
    uint64_t gaps_saturated() const noexcept { return gaps_saturated_; }

    // Zero-allocation span view of currently active gaps
    std::span<const Gap> gaps() const noexcept {
        return std::span<const Gap>(gaps_.data(), num_gaps_);
    }

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

    // Word-level bit clearing for sub-window ranges
    inline void clear_index_range(std::size_t start_idx, std::size_t end_idx) noexcept {
        std::size_t w_start = start_idx / kWordBits;
        std::size_t b_start = start_idx % kWordBits;
        std::size_t w_end = end_idx / kWordBits;
        std::size_t b_end = end_idx % kWordBits;

        if (w_start == w_end) {
            uint64_t mask = (b_end - b_start + 1 == 64) 
                ? ~0ULL 
                : (((1ULL << (b_end - b_start + 1)) - 1ULL) << b_start);
            window_bitmap_[w_start] &= ~mask;
        } else {
            // Clear trailing bits in w_start: bits [b_start, 63]
            uint64_t start_mask = (~0ULL) << b_start;
            window_bitmap_[w_start] &= ~start_mask;

            // Clear full words between w_start + 1 and w_end - 1
            for (std::size_t w = w_start + 1; w < w_end; ++w) {
                window_bitmap_[w] = 0;
            }

            // Clear leading bits in w_end: bits [0, b_end]
            uint64_t end_mask = (b_end == 63) ? ~0ULL : ((1ULL << (b_end + 1)) - 1ULL);
            window_bitmap_[w_end] &= ~end_mask;
        }
    }

    inline void clear_seq_range(uint64_t from_seq, uint64_t to_seq) noexcept {
        if (from_seq > to_seq) return;
        uint64_t count = to_seq - from_seq + 1;
        if (count >= kWindowSize) {
            window_bitmap_.fill(0);
            return;
        }
        std::size_t from_idx = from_seq % kWindowSize;
        std::size_t to_idx = to_seq % kWindowSize;
        if (from_idx <= to_idx) {
            clear_index_range(from_idx, to_idx);
        } else {
            clear_index_range(from_idx, kWindowSize - 1);
            clear_index_range(0, to_idx);
        }
    }

    inline void prune_expired_gaps(uint64_t current_max) noexcept {
        if (current_max < kWindowSize) return;
        uint64_t horizon = current_max - kWindowSize;
        for (std::size_t i = 0; i < num_gaps_;) {
            if (gaps_[i].end <= horizon) {
                // Gap has expired beyond sliding window horizon
                for (std::size_t j = i; j + 1 < num_gaps_; ++j) {
                    gaps_[j] = gaps_[j + 1];
                }
                num_gaps_--;
            } else {
                ++i;
            }
        }
    }

    bool initialized_{false};
    uint64_t expected_next_{0};
    uint64_t max_seq_{0};
    uint64_t total_received_{0};
    uint64_t total_lost_packets_{0};
    uint64_t duplicates_{0};
    uint64_t out_of_order_{0};
    uint64_t stale_packets_{0};
    uint64_t gaps_saturated_{0};

    // Fixed 8 KB circular bitmap buffer (1024 64-bit words)
    std::array<uint64_t, kNumWords> window_bitmap_;

    // Fixed pre-allocated gap tracking array (zero heap allocation)
    std::array<Gap, kMaxTrackedGaps> gaps_;
    std::size_t num_gaps_{0};
};

} // namespace meridian