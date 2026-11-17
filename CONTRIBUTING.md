# Contributing to MERIDIAN

Thank you for your interest in contributing to MERIDIAN.

## Development Workflow

1. **Branching**: Create a feature branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. **C++ Standards**:
   - Follow modern C++20 conventions.
   - Use RAII, explicit ownership semantics, and `alignas(64)` for cacheline-isolated atomic variables in concurrent data structures.
   - Validate with AddressSanitizer and ThreadSanitizer before submitting.
3. **Database Migrations**:
   - All relations must conform to Boyce-Codd Normal Form (BCNF).
   - Ensure foreign keys and check constraints are explicitly defined.
   - Run `npx tsx scripts/verify_disposable_db.ts` to ensure clean execution.
4. **Testing**:
   - Run the integration test suite: `npm test`
   - Run the C++ bridge test: `npx tsx tests/cpp_bridge.test.ts`
   - Verify 0 audit vulnerabilities: `npm audit`
5. **Pull Requests**:
   - Submit PRs against `main`.
   - Provide clear descriptions of architectural changes, test commands, and reproducible outputs.
