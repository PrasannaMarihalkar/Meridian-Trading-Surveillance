#include "../include/order_book.hpp"
#include <iostream>
#include <string>
#include <sstream>
#include <map>

using namespace meridian;

int main() {
    std::ios_base::sync_with_stdio(false);
    std::cin.tie(NULL);

    std::map<InstrumentId, OrderBook> books;
    for (InstrumentId id = 1; id <= 5; ++id) {
        books.emplace(id, OrderBook(id, 500));
    }

    std::cerr << "[MERIDIAN_ENGINE] C++ Price-Time Matching Engine initialized for 5 instruments." << std::endl;

    std::string line;
    // Command protocol:
    // ORDER <order_id> <account_id> <instrument_id> <side:BUY|SELL> <type:LIMIT|MARKET|IOC> <price_double> <qty>
    // CANCEL <order_id> <instrument_id>
    // SNAPSHOT <instrument_id>
    while (std::getline(std::cin, line)) {
        if (line.empty() || line[0] == '#') continue;

        std::stringstream ss(line);
        std::string cmd;
        ss >> cmd;

        if (cmd == "ORDER") {
            OrderId oid;
            AccountId aid;
            InstrumentId iid;
            std::string side_str, type_str;
            double price_dbl;
            Quantity qty;

            if (ss >> oid >> aid >> iid >> side_str >> type_str >> price_dbl >> qty) {
                auto book_it = books.find(iid);
                if (book_it == books.end()) {
                    std::cout << "REJECT " << oid << " UNKNOWN_INSTRUMENT" << std::endl;
                    continue;
                }

                Order o;
                o.order_id = oid;
                o.account_id = aid;
                o.instrument_id = iid;
                o.side = (side_str == "BUY") ? Side::BUY : Side::SELL;
                o.order_type = (type_str == "MARKET") ? OrderType::MARKET :
                               (type_str == "IOC") ? OrderType::IOC : OrderType::LIMIT;
                o.price = double_to_price(price_dbl);
                o.quantity = qty;

                auto trades = book_it->second.process_order(o);
                std::cout << "ACK " << oid << " " << order_status_to_string(o.status)
                          << " " << o.filled_qty << " " << trades.size() << std::endl;

                for (const auto& t : trades) {
                    std::cout << "TRADE " << t.engine_seq << " " << t.instrument_id << " "
                              << t.buy_order_id << " " << t.sell_order_id << " "
                              << t.buyer_account_id << " " << t.seller_account_id << " "
                              << price_to_double(t.price) << " " << t.quantity << " "
                              << side_to_string(t.aggressor_side) << std::endl;
                }
            }
        } else if (cmd == "CANCEL") {
            OrderId oid;
            InstrumentId iid;
            if (ss >> oid >> iid) {
                auto book_it = books.find(iid);
                if (book_it != books.end() && book_it->second.cancel_order(oid)) {
                    std::cout << "CANCELLED " << oid << std::endl;
                } else {
                    std::cout << "CANCEL_REJECTED " << oid << std::endl;
                }
            }
        } else if (cmd == "SNAPSHOT") {
            InstrumentId iid;
            if (ss >> iid) {
                auto book_it = books.find(iid);
                if (book_it != books.end()) {
                    auto snap = book_it->second.get_snapshot(5);
                    std::cout << "SNAPSHOT " << iid << " BIDS:" << snap.bids.size() << " ASKS:" << snap.asks.size() << std::endl;
                    for (const auto& b : snap.bids) {
                        std::cout << "  BID " << price_to_double(b.price) << " " << b.total_qty << " (" << b.order_count << ")" << std::endl;
                    }
                    for (const auto& a : snap.asks) {
                        std::cout << "  ASK " << price_to_double(a.price) << " " << a.total_qty << " (" << a.order_count << ")" << std::endl;
                    }
                }
            }
        } else if (cmd == "QUIT" || cmd == "EXIT") {
            break;
        }
    }

    return 0;
}
