# Testing

This project includes comprehensive automated tests for both the Vue frontend and Rust backend.

## Running Tests

### Frontend Tests (Vitest)

```bash
# Run all tests once
npm test

# Run tests in watch mode (for development)
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Rust Tests (Cargo)

```bash
cd src-tauri

# Run all tests
cargo test

# Run tests with output
cargo test -- --nocapture

# Run specific test
cargo test test_name

# Check formatting
cargo fmt --check

# Run linter
cargo clippy
```

## Test Structure

```
src/
├── components/ui/Button.vue
├── components/ui/Button.test.ts     # Component tests
├── composables/useToast.ts
├── composables/useToast.test.ts     # Composable tests
├── stores/worktrees.ts
├── stores/worktrees.test.ts         # Store tests
└── test/
    ├── setup.ts                      # Test configuration
    └── mocks/
        └── tauri.ts                  # Tauri IPC mocks
```

## Writing Tests

See [docs/developers/testing.md](docs/developers/testing.md) for detailed guidance on writing tests.

## CI/CD

Tests run automatically on every pull request via GitHub Actions:
- Frontend unit tests
- Type checking
- Rust unit tests
- Rust formatting (rustfmt)
- Rust linting (clippy)
