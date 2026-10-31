# 🤖 Personal Companion Bot

<div align="center">

**Windows-First AI Companion + Legacy WhatsApp Bot**

[![Windows AI Companion](https://img.shields.io/badge/Windows%20AI%20Companion-Advanced-blue.svg)](companion/README.md)
[![Tests](https://img.shields.io/badge/tests-439%20passing-brightgreen.svg)](companion/README.md)
[![TypeScript](https://img.shields.io/badge/typescript-5.0-blue.svg)](companion/README.md)
[![Electron](https://img.shields.io/badge/electron-45.0.0-9BE349.svg)](companion/README.md)

**Built by Hassan - Software Engineer**

[Portfolio](#-portfolio) • [Contact](#-contact)

</div>

---

## 🎯 About This Repository

This repository contains two distinct projects showcasing my software engineering capabilities:

### 1. 🖥️ Windows AI Companion (`companion/`) ⭐ **RECOMMENDED**

A sophisticated desktop application with voice interaction, autonomous capabilities, and AI integration. This is my flagship project demonstrating full-stack development, AI/ML integration, security engineering, and enterprise-grade software architecture.

**Key Features:**
- 🎤 Voice-first interaction with Gemini AI
- 🤖 Autonomous goal pursuit (G7 approved)
- 💰 Financial management with safeguards (G6 approved)
- 📧 Gmail integration with smart categorization (G5 approved)
- 📱 WhatsApp integration with UI Automation (G3 approved)
- 🧠 Learning engine with pattern recognition
- 🔒 Enterprise security (SQLCipher, credential management)
- ⚡ Performance optimization (response caching)

**Tech Stack:** Electron, React, TypeScript, Node.js, SQLCipher, WinRT

[→ View Windows AI Companion Documentation](companion/README.md)

---

### 2. 🤖 Legacy WhatsApp Bot (`src/`)

A WhatsApp auto-reply bot that learns your writing style and replies to messages in your voice. Built with Node.js and the Baileys library.

**Key Features:**
- Style learning from your messages
- Auto-replies with human-like delays
- Freelance skill pitching
- Rate limiting to avoid bans

**Tech Stack:** Node.js, Baileys, Anthropic Claude

---

## 📊 Comparison

| Feature | Windows AI Companion | Legacy WhatsApp Bot |
|---------|---------------------|---------------------|
| **Platform** | Electron Desktop App | Node.js CLI |
| **Voice** | ✅ Yes (WinRT + Gemini) | ❌ No |
| **Autonomous Actions** | ✅ Yes (G6, G7) | ❌ No |
| **Financial Ops** | ✅ Yes (PayPal) | ❌ No |
| **Email Integration** | ✅ Yes (Gmail API) | ❌ No |
| **Learning Engine** | ✅ Advanced pattern recognition | ✅ Basic style learning |
| **Security** | ✅ Enterprise-grade (encrypted storage) | ⚠️ Basic |
| **UI** | ✅ Modern React UI | ❌ Terminal only |
| **Tests** | ✅ 439 tests passing | ⚠️ Limited |
| **Recommended For** | Full personal assistant | Simple auto-replies |

---

## 🚀 Quick Start

### Windows AI Companion (Recommended)

```bash
cd companion
npm install
npm start
```

Or download the installer from [Releases](https://github.com/hassan200503/personal-companion-bot/releases).

See [companion/README.md](companion/README.md) for full documentation.

### Legacy WhatsApp Bot

```bash
npm install
npm start
```

See the sections below for legacy bot setup.

---

## 🖥️ Windows AI Companion - Deep Dive

### What Makes It Special

This is not just another chatbot. It's a **next-generation personal computing interface** that demonstrates:

**🎯 Full-Stack Development**
- Electron desktop app with React frontend
- Node.js backend with TypeScript
- IPC communication layer
- Cross-platform build system

**🤖 AI/ML Integration**
- Real-time voice transcription with Gemini
- Context-aware conversation engine
- Provider router with automatic failover
- Speaker verification (degraded mode with ML upgrade path)

**🔒 Security Engineering**
- SQLCipher encrypted database
- Windows Credential Manager integration
- Risk-based rate limiting
- Emergency stop with global shortcut
- Lock/focus gating for privacy

**⚡ Performance**
- Response caching (2-3x faster repeated queries)
- Incremental database operations (O(n) not O(n²))
- Streaming responses
- Optimized builds with esbuild

**🧠 Learning Systems**
- Episode logging for pattern analysis
- Consolidation job for behavioral patterns
- Recipe learning for automation
- Weekly review UI for fact approval

**🤖 Autonomous Capabilities**
- Goal pursuit engine with risk assessment
- Financial safeguards with approval workflows
- Simulation mode for safe testing
- Audit logging for transparency

### Architecture Highlights

```
Renderer (React) ←→ Main (Node.js) ←→ Core (TypeScript)
    ↓                  ↓                ↓
Voice Dock        Voice Service    Conversation Engine
Settings Shell    Provider Router   Tool Executor
Memory Inbox      SQLCipher Storage  Learning Engine
```

### Metrics

- **15,000+ lines of TypeScript**
- **439 tests passing** across 61 test files
- **0 type errors** with strict TypeScript
- **Enterprise-grade security** with encrypted storage
- **Production-ready** with comprehensive documentation

---

## 🤖 Legacy WhatsApp Bot - Setup

### ⚠️ Important Limitations

1. **WhatsApp Terms of Service**: This uses WhatsApp Web's protocol (via Baileys), not the official Business API. This is against WhatsApp's Terms of Service. Use a secondary/business SIM rather than your main personal number.

2. **Always-On Requirement**: The bot needs to run on a computer that stays on.

3. **Learning from New Messages**: It learns from messages going forward, not your old chat history.

4. **Safety Limits**: It never sends on your behalf without limits.

### Installation

```bash
# Install Node.js 20+
node -v

# Install dependencies
npm install

# Configure settings
cp .env.example .env
# Edit .env with your ANTHROPIC_API_KEY

# Fill in your persona
# Edit data/persona-seed.md

# Run and pair with WhatsApp
npm start
# Scan QR code in terminal
```

### Using It

- **Toggle auto-replies**: Send `/awaytoggle` to any chat
- **Check what it said**: View `logs/auto-replies.log`
- **Protect specific people**: Add numbers to `IGNORE_NUMBERS` in `.env`

### Running Long-Term

```bash
npm install -g pm2 pm2-windows-startup
pm2-startup install
pm2 start ecosystem.config.cjs
pm2 save
```

---

## 📁 Project Structure

```
personal-companion-bot/
├── companion/                 # Windows AI Companion (Recommended)
│   ├── apps/desktop/          # Electron app
│   ├── packages/core/         # Core TypeScript packages
│   │   ├── conversation/      # Conversation engine
│   │   ├── autonomous/        # Autonomous capabilities
│   │   ├── learning/          # Learning engine
│   │   ├── security/          # Security infrastructure
│   │   ├── voice/             # Voice integration
│   │   └── ...               # More modules
│   ├── docs/                  # Documentation
│   └── README.md              # Full documentation
│
├── src/                      # Legacy WhatsApp Bot
│   ├── index.js              # Main bot logic
│   ├── persona.js            # Persona management
│   ├── replyEngine.js        # Reply generation
│   └── ...
│
├── data/                     # Legacy bot data
│   ├── persona-seed.md       # Persona configuration
│   └── style-log.jsonl       # Learning data
│
├── docs/                     # Shared documentation
│   ├── AGENT_BRIEF.md        # System specification
│   ├── PROJECT_STATE.md       # Implementation status
│   ├── GAPS.md               # Known issues
│   └── ...
│
└── README.md                 # This file
```

---

## 🧪 Testing

### Windows AI Companion

```bash
cd companion
npm test              # 439 tests passing
npm run typecheck     # 0 type errors
npm run verify        # Full verification
```

### Legacy WhatsApp Bot

```bash
npm run test-companion  # Legacy bot tests
```

---

## 📚 Documentation

### Windows AI Companion

- [Full README](companion/README.md) - Complete documentation
- [Secure Setup Guide](docs/SECURE_SETUP.md) - Credential configuration
- [Agent Brief](docs/AGENT_BRIEF.md) - System specification
- [Enterprise Ready](docs/ENTERPRISE_READY.md) - Production checklist
- [Project State](docs/PROJECT_STATE.md) - Implementation status
- [Gap List](docs/GAPS.md) - Known issues and improvements

### Legacy WhatsApp Bot

- See sections above for setup and usage

---

## 🎯 Portfolio - Why This Work?

This repository demonstrates my ability to:

### Full-Stack Development
- ✅ Build desktop applications with Electron
- ✅ Create modern React UIs with TypeScript
- ✅ Implement IPC communication between processes
- ✅ Design scalable architectures

### AI/ML Integration
- ✅ Integrate LLMs (Gemini, OpenRouter)
- ✅ Build voice-first interfaces
- ✅ Implement speaker verification
- ✅ Create autonomous systems with safety constraints

### Security Engineering
- ✅ Implement encrypted storage (SQLCipher)
- ✅ Use Windows Credential Manager
- ✅ Design rate limiting systems
- ✅ Build emergency stop mechanisms
- ✅ Handle sensitive data securely

### Performance Optimization
- ✅ Implement response caching
- ✅ Optimize database operations
- ✅ Use streaming for real-time responses
- ✅ Profile and optimize bottlenecks

### Testing & Quality
- ✅ Write comprehensive unit tests (439 tests)
- ✅ Achieve 100% type safety with TypeScript
- ✅ Build CI/CD-ready code
- ✅ Document thoroughly

### Learning Systems
- ✅ Build pattern recognition engines
- ✅ Implement behavioral analysis
- ✅ Create learning pipelines
- ✅ Design approval workflows

---

## 👤 About Me

**Hassan**

**Software Engineer specializing in:**
- 🖥️ Desktop Application Development (Electron, Node.js)
- 🤖 AI/ML Integration (LLMs, voice recognition, autonomous systems)
- 🔒 Security & Privacy (encryption, credential management, safe AI)
- ⚡ Performance Optimization (caching, streaming, database optimization)
- 🧠 Learning Systems (pattern recognition, behavioral analysis)

### Skills

**Languages:** TypeScript, JavaScript, Python, SQL

**Frameworks:** Electron, React, Node.js, Express

**Databases:** SQLite, SQLCipher, PostgreSQL

**AI/ML:** LLMs (Gemini, Claude, GPT), Voice Recognition, Pattern Recognition

**Tools:** Git, Docker, CI/CD, esbuild, Vite

**Security:** Encryption, Credential Management, Rate Limiting, Audit Logging

---

## 📞 Contact

**Looking for opportunities in:**
- Full-time software engineering roles
- Contract/freelance projects
- AI/ML engineering positions
- Desktop application development

**Get in touch:**
- **Email:** tech03082005082005@gmail.com
- **GitHub:** [@hassan200503](https://github.com/hassan200503)
- **LinkedIn:** [Connect with me](https://linkedin.com/in/your-profile)

---

## 🙏 Acknowledgments

- Electron Team - Amazing desktop framework
- Vercel - Vite and developer tools
- Google - Gemini API and WinRT
- Open Source Community - Incredible tools and libraries

---

<div align="center">

**Choose Your Adventure:**

[🖥️ Windows AI Companion (Recommended)](companion/README.md) | [🤖 Legacy WhatsApp Bot](#-legacy-whatsapp-bot---setup)

**Built with ❤️ to showcase professional software engineering**

</div>
