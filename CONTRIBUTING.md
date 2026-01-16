# Contributing to Localazy Directus Extension

Thank you for your interest in contributing to the Localazy Directus Extension!

## Development Setup

### Prerequisites

- Node.js 18+
- npm 9+
- Docker (for development environment)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/localazy/directus-extension-localazy.git
   cd directus-extension-localazy
   ```

2. Install dependencies:
   ```bash
   npm install
   cd extensions/module && npm install
   cd ../sync-hook && npm install
   ```

3. Start the development environment:
   ```bash
   npm run dev
   ```

4. Access Directus at `http://localhost:8055/admin`
   - Username: admin@example.com
   - Password: d1r3ctu5

## Project Structure

```
directus-extension-localazy/
├── extensions/
│   ├── common/              # Shared code between extensions
│   │   ├── api/             # API clients
│   │   ├── interfaces/      # TypeScript interfaces
│   │   ├── models/          # Data models
│   │   ├── services/        # Business logic services
│   │   ├── types/           # Type definitions
│   │   ├── utilities/       # Utility functions
│   │   └── __tests__/       # Common tests
│   ├── module/              # Module extension (UI)
│   │   ├── src/
│   │   │   ├── components/  # Vue components
│   │   │   ├── composables/ # Vue composables
│   │   │   ├── stores/      # Pinia stores
│   │   │   └── views/       # Page views
│   │   └── README.md
│   └── sync-hook/           # Sync hook extension (automation)
│       ├── src/
│       │   ├── functions/   # Hook functions
│       │   └── services/    # Sync services
│       └── README.md
├── vitest.config.ts         # Test configuration
└── .eslintrc.cjs            # ESLint configuration
```

## Development Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development environment |
| `npm run build` | Build all extensions |
| `npm run test` | Run unit tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Fix ESLint issues |

## Code Style

We use ESLint with TypeScript and Vue plugins. Key rules:

- Use TypeScript with proper types (avoid `any`)
- Use `async/await` for asynchronous operations
- Use `for...of` instead of `forEach` with async callbacks
- Follow Vue 3 Composition API patterns
- Document public APIs with JSDoc comments

## Testing

We use Vitest for testing. Tests are located in `__tests__` directories.

```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Writing Tests

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MyService } from '../my-service';

describe('MyService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should do something', () => {
    const service = new MyService();
    expect(service.doSomething()).toBe('expected');
  });
});
```

## Language Mapping Feature

The extension supports custom language code mappings between Directus and Localazy.

Example mapping:
- Directus: `zh-Hans`
- Localazy: `zh-CN#Hans`

Configure mappings in Advanced Settings with JSON:
```json
[
  {"directusCode": "zh-Hans", "localazyCode": "zh-CN#Hans"},
  {"directusCode": "zh-Hant", "localazyCode": "zh-TW#Hant"}
]
```

## Error Handling

Use the `ErrorTrackingService` for consistent error handling:

```typescript
import { ErrorTrackingService } from '../services/error-tracking-service';

try {
  await someOperation();
} catch (error) {
  ErrorTrackingService.trackDirectusError(
    error instanceof Error ? error : new Error(String(error)),
    'operationType'
  );
}
```

## Pull Request Guidelines

1. Create a feature branch from `main`
2. Follow the code style guidelines
3. Add tests for new functionality
4. Update documentation as needed
5. Ensure all tests pass
6. Submit PR with clear description

## Questions or Issues?

- [Discussion Forum](https://discuss.localazy.com/)
- [GitHub Issues](https://github.com/localazy/directus-extension-localazy/issues)
- Email: team@localazy.com
