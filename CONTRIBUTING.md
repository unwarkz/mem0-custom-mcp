# Contributing to mem0-custom-mcp

Thank you for your interest in contributing to mem0-custom-mcp! This document provides guidelines and instructions for contributing.

## Code of Conduct

This project adheres to a Code of Conduct that all contributors are expected to follow. Please read [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) before contributing.

## How to Contribute

### Reporting Bugs

If you find a bug, please create an issue on GitHub with:
- A clear, descriptive title
- Steps to reproduce the issue
- Expected behavior vs actual behavior
- Your environment (OS, Node.js version, mem0-custom-mcp version)
- Any relevant logs or error messages

### Suggesting Features

Feature requests are welcome! Please create an issue with:
- A clear description of the feature
- The use case or problem it solves
- Any implementation ideas (optional)

### Pull Requests

1. **Fork the repository** and create a new branch from `main`
2. **Make your changes** following the coding standards below
3. **Test your changes** thoroughly
4. **Update documentation** if needed
5. **Commit your changes** with clear, descriptive commit messages
6. **Push to your fork** and submit a pull request

## Development Setup

### Prerequisites

- Node.js 18+
- npm or yarn
- TypeScript knowledge

### Getting Started

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/mem0-custom-mcp.git
cd mem0-custom-mcp

# Install dependencies
npm install

# Build the project
npm run build

# Test the build
node dist/index.js
```

### Project Structure

```
mem0-custom-mcp/
├── src/
│   └── index.ts          # Main MCP server implementation
├── dist/                 # Compiled JavaScript (generated)
├── package.json          # Dependencies and scripts
├── tsconfig.json         # TypeScript configuration
├── README.md            # Documentation
└── LICENSE              # MIT License
```

## Coding Standards

### TypeScript

- Use TypeScript strict mode
- Follow existing code style (tabs/spaces, naming conventions)
- Add type annotations for function parameters and return values
- Use `const` for immutable variables, `let` for mutable ones
- Avoid `any` types when possible

### Code Style

- Use 2 spaces for indentation
- Use semicolons
- Use double quotes for strings
- Keep lines under 100 characters when possible
- Add JSDoc comments for public functions

### Example

```typescript
/**
 * Adds a new memory to the Mem0 API
 * @param content - The memory content to store
 * @param user_id - Optional user ID (defaults to DEFAULT_USER_ID)
 * @returns Promise resolving to the API response
 */
async function addMemory(
  content: string,
  user_id?: string
): Promise<ApiResponse> {
  // Implementation
}
```

### Zod Schemas

- Use Zod for runtime input validation
- Add descriptive error messages
- Document schema fields with `.describe()`

```typescript
const MySchema = z.object({
  field: z.string().describe("Description of this field"),
  optional: z.number().optional().describe("Optional field"),
});
```

## Testing

Currently, this project doesn't have automated tests. Contributions adding tests are very welcome!

### Manual Testing

Before submitting a PR, test your changes:

1. **Build successfully:**
   ```bash
   npm run build
   ```

2. **Start the MCP server:**
   ```bash
   node dist/index.js
   ```

3. **Test with Claude Code:**
   - Configure Claude Code to use your local build
   - Test all affected tools
   - Verify error handling

## Commit Messages

Write clear, descriptive commit messages:

- Use present tense ("Add feature" not "Added feature")
- Use imperative mood ("Move file to..." not "Moves file to...")
- Limit first line to 72 characters
- Reference issues/PRs when applicable

### Examples

```
Add support for batch memory operations

- Implement add_memories_bulk tool
- Update README with batch examples
- Add validation for batch inputs

Fixes #123
```

## Pull Request Process

1. **Ensure all checks pass** (build, lint, tests if added)
2. **Update README.md** if you added features
3. **Update CHANGELOG.md** under "Unreleased" section
4. **Request review** from maintainers
5. **Address feedback** promptly
6. **Squash commits** if requested before merging

## Release Process

(For maintainers)

1. Update version in `package.json`
2. Move "Unreleased" section in CHANGELOG.md to new version
3. Create git tag: `git tag v1.x.x`
4. Push tag: `git push origin v1.x.x`
5. GitHub Actions will handle npm publish (if configured)

## Questions?

If you have questions about contributing:
- Check existing issues and discussions
- Create a new discussion on GitHub
- Reach out to maintainers

## License

By contributing to mem0-custom-mcp, you agree that your contributions will be licensed under the MIT License.

## Thank You!

Your contributions help make mem0-custom-mcp better for everyone. Thank you for taking the time to contribute!
