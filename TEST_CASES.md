# QuoteCraft AI v0.6 parser test cases

1. `Замінити вентилятор на стелі. Пофарбувати стіни 100 square feet. Пофарбувати ще одну стіну 80 square feet.`
Expected:
- Replace exhaust fan — 1 each × $225
- Paint walls — 100 sq ft × $2.50
- Paint walls — 80 sq ft × $2.50
Total: $675

2. `Замінити кран на кухні, пофарбувати одну стіну, замінити вентилятор і покласти ламінат 35 square feet.`
Expected:
- Replace kitchen faucet — 1 each × $250
- Paint one wall — 1 each × $250
- Replace exhaust fan — 1 each × $225
- Install LVP / laminate flooring — 35 sq ft × $6
Total: $935

3. Repeated browser speech fragments should be deduplicated before parsing.
4. Numbers with sq ft must never become counts for fans, faucets, toilets, or vanities.
5. Unrecognized work receives $0 and a visible warning instead of silently guessing.
