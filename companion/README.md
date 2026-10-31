# 📚 Companion AI - Developer Documentation

This directory contains the Windows AI Companion desktop application. For the main project README with installation instructions, features, and screenshots, see the [repository root README](../README.md).

## 📁 Project Structure

```
companion/
├── apps/desktop/          # Electron desktop application
│   ├── src/main/         # Main process (Node.js)
│   ├── src/renderer/     # Renderer process (React)
│   ├── src/preload/      # Preload script (IPC bridge)
│   ├── resources/        # Icons, assets
│   └── package.json      # Desktop app config
├── packages/core/        # Core TypeScript packages
│   ├── conversation/     # Conversation engine
│   ├── autonomous/       # Autonomous capabilities
│   ├── learning/         # Learning engine
│   ├── security/         # Security infrastructure
│   ├── voice/            # Voice integration
│   └── ...              # More modules
└── docs/                 # Shared documentation
```

## 🚀 Quick Start

```bash
# From repository root
cd companion

# Install dependencies
npm install

# Run in development mode
npm start

# Build for production
npm run build

# Package as Windows installer
npm run package
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Type checking
npm run typecheck

# Full verification
npm run verify
```

## 📖 Documentation

- [Main README](../README.md) - Complete project documentation
- [Agent Brief](../docs/AGENT_BRIEF.md) - System specification
- [Project State](../docs/PROJECT_STATE.md) - Implementation status
- [Secure Setup](../docs/SECURE_SETUP.md) - Credential configuration
- [Enterprise Ready](../docs/ENTERPRISE_READY.md) - Production checklist

## 🔧 Development

The companion is built as a monorepo with workspaces:

- **@companion/desktop** - Electron desktop app
- **@companion/core** - Core TypeScript packages

All packages are linked together via npm workspaces.

## 📦 Release

To create a new release:

1. Update version in `apps/desktop/package.json`
2. Run `npm run package` to build the installer
3. Upload `apps/desktop/release/Companion-0.1.0-x64.exe` to GitHub Releases
4. Update version badges in README

---

For the complete user guide, installation instructions, and feature documentation, see the [main repository README](../README.md).
