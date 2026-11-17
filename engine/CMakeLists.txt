cmake_minimum_required(VERSION 3.16)
project(meridian_engine LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(MSVC)
    add_compile_options(/W4 /O2)
else()
    add_compile_options(-Wall -Wextra -Wpedantic -O3 -pthread)
endif()

include_directories(include)

# Core engine library
add_library(engine_core STATIC src/order_book.cpp)

# Standalone interactive engine executable
add_executable(meridian_engine src/main.cpp)
target_link_libraries(meridian_engine PRIVATE engine_core)

# Test executable
add_executable(test_order_book tests/test_order_book.cpp)
target_link_libraries(test_order_book PRIVATE engine_core)

# Benchmark executable
add_executable(benchmark_engine benchmarks/benchmark_engine.cpp)
target_link_libraries(benchmark_engine PRIVATE engine_core)

enable_testing()
add_test(NAME OrderBookTests COMMAND test_order_book)
