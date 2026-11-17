#pragma once

#include <atomic>
#include <cstddef>
#include <cstdint>
#include <new>
#include <type_traits>

namespace meridian {

#if defined(__cpp_lib_hardware_interference_size)
inline constexpr std::size_t kCacheLineSize = std::hardware_destructive_interference_size;
#else
inline constexpr std::size_t kCacheLineSize = 64;
#endif

template <typename T, std::size_t Capacity>
class SPSCQueue {
    static_assert(Capacity >= 2, "Capacity must be at least 2");
    static_assert((Capacity & (Capacity - 1)) == 0, "Capacity must be a power of two");
    static_assert(std::is_nothrow_move_constructible_v<T> || std::is_nothrow_copy_constructible_v<T>,
                  "T must be nothrow movable or copyable");

public:
    SPSCQueue() : buffer_(static_cast<T*>(::operator new[](sizeof(T) * Capacity, std::align_val_t(alignof(T))))) {}

    ~SPSCQueue() {
        while (try_pop_destroy()) {}
        ::operator delete[](buffer_, std::align_val_t(alignof(T)));
    }

    SPSCQueue(const SPSCQueue&) = delete;
    SPSCQueue& operator=(const SPSCQueue&) = delete;

    template <typename... Args>
    bool try_emplace(Args&&... args) noexcept {
        const std::size_t head = head_.load(std::memory_order_relaxed);
        if ((head - cached_tail_) == Capacity) {
            cached_tail_ = tail_.load(std::memory_order_acquire);
            if ((head - cached_tail_) == Capacity) {
                return false; // Queue full
            }
        }

        new (&buffer_[head & mask_]) T(std::forward<Args>(args)...);
        head_.store(head + 1, std::memory_order_release);
        return true;
    }

    bool try_push(const T& item) noexcept {
        return try_emplace(item);
    }

    bool try_push(T&& item) noexcept {
        return try_emplace(std::move(item));
    }

    bool try_pop(T& value) noexcept {
        const std::size_t tail = tail_.load(std::memory_order_relaxed);
        if (tail == cached_head_) {
            cached_head_ = head_.load(std::memory_order_acquire);
            if (tail == cached_head_) {
                return false; // Queue empty
            }
        }

        T* slot = &buffer_[tail & mask_];
        value = std::move(*slot);
        slot->~T();
        tail_.store(tail + 1, std::memory_order_release);
        return true;
    }

    bool empty() const noexcept {
        return tail_.load(std::memory_order_relaxed) == head_.load(std::memory_order_relaxed);
    }

    std::size_t size() const noexcept {
        const std::size_t head = head_.load(std::memory_order_relaxed);
        const std::size_t tail = tail_.load(std::memory_order_relaxed);
        return head >= tail ? head - tail : Capacity - (tail - head);
    }

    static constexpr std::size_t capacity() noexcept {
        return Capacity;
    }

private:
    bool try_pop_destroy() noexcept {
        const std::size_t tail = tail_.load(std::memory_order_relaxed);
        if (tail == head_.load(std::memory_order_relaxed)) {
            return false;
        }
        buffer_[tail & mask_].~T();
        tail_.store(tail + 1, std::memory_order_relaxed);
        return true;
    }

    static constexpr std::size_t mask_ = Capacity - 1;
    T* const buffer_;

    alignas(kCacheLineSize) std::atomic<std::size_t> head_{0};
    alignas(kCacheLineSize) std::size_t cached_tail_{0};

    alignas(kCacheLineSize) std::atomic<std::size_t> tail_{0};
    alignas(kCacheLineSize) std::size_t cached_head_{0};
};

} // namespace meridian
