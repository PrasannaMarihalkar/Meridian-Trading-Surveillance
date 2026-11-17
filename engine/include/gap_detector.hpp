#pragma once

#include <cstdint>
#include <vector>
#include <unordered_set>
#include <algorithm>

namespace meridian {

class GapDetector {
public:
    struct Gap {
        uint64_t start;
        uint64_t end;
        int64_t  detected_at_ns;

        uint64_t size() const { return end - start + 1; }
    };

    GapDetector() = default;

    void on_packet(uint64_t seq, int64_t recv_ts_ns) {
        total_received_++;

        if (seen_.count(seq)) {
            duplicates_++;
            return;
        }
        seen_.insert(seq);

        if (!initialized_) {
            expected_next_ = seq + 1;
            max_seq_ = seq;
            initialized_ = true;
            return;
        }

        if (seq == expected_next_) {
            expected_next_ = seq + 1;
            max_seq_ = std::max(max_seq_, seq);
        } else if (seq > expected_next_) {
            // Dropped packets detected!
            Gap g{expected_next_, seq - 1, recv_ts_ns};
            gaps_.push_back(g);
            total_lost_packets_ += g.size();
            expected_next_ = seq + 1;
            max_seq_ = seq;
        } else {
            // seq < expected_next_: packet arrived out of order (filled previously recorded gap)
            out_of_order_++;
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
                        // Split gap
                        Gap g2{seq + 1, it->end, it->detected_at_ns};
                        it->end = seq - 1;
                        it = gaps_.insert(it + 1, g2);
                        ++it;
                    }
                } else {
                    ++it;
                }
            }
        }
    }

    uint64_t total_received() const noexcept { return total_received_; }
    uint64_t total_lost() const noexcept { return total_lost_packets_; }
    uint64_t duplicates() const noexcept { return duplicates_; }
    uint64_t out_of_order() const noexcept { return out_of_order_; }
    const std::vector<Gap>& gaps() const noexcept { return gaps_; }

    double loss_rate() const noexcept {
        uint64_t expected_total = total_received_ + total_lost_packets_ - duplicates_;
        return expected_total == 0 ? 0.0 : (static_cast<double>(total_lost_packets_) / expected_total) * 100.0;
    }

private:
    bool initialized_{false};
    uint64_t expected_next_{0};
    uint64_t max_seq_{0};
    uint64_t total_received_{0};
    uint64_t total_lost_packets_{0};
    uint64_t duplicates_{0};
    uint64_t out_of_order_{0};
    std::unordered_set<uint64_t> seen_;
    std::vector<Gap> gaps_;
};

} // namespace meridian
