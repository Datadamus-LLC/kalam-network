# Supplementary Task Documents

This directory contains foundational task documents that all developers should read before working on the Hedera Social Platform.

## Files in This Directory

### S05-env-validation-docker.md (1,568 lines)

**Purpose:** Production-ready environment validation, Docker containerization, and local development infrastructure.

**Key Sections:**
- Environment Validation Architecture using Zod
- Backend Environment Setup (NestJS ConfigModule integration)
- Frontend Environment Setup (Next.js Zod validation)
- Docker Infrastructure (development and production)
- Verification checklist with 14 items
- Complete working code for:
  - env.validation.ts (250 lines) — Zod schema with all env variables
  - configuration.ts (20 lines) — NestJS config factory
  - app.module.ts (80 lines) — Full module setup with DB/Redis
  - main.ts (60 lines) — Bootstrap with validation
  - exception.filter.ts (45 lines) — Global error handler
  - Dockerfile (API and web) — Multi-stage production builds
  - docker-compose.yml (120 lines) — Development environment
  - docker-compose.prod.yml (140 lines) — Production environment
  - Makefile (120 lines) — Developer commands

**Deliverables:** 16 files, ~1,100 lines of production-ready code

**Use This When:**
- Setting up a new development environment
- Deploying to production
- Troubleshooting environment/Docker issues

---

### S06-developer-guidelines.md (1,816 lines)

**Purpose:** Mandatory reference document for all developers. Defines standards, conventions, and best practices.

**Key Sections:**
1. **Project Structure** — Where every file type belongs
2. **Naming Conventions** — Files, classes, functions, variables, git branches
3. **Code Patterns & Standards** — 10 complete working examples
   - Backend: Service DI, DTOs, exceptions, Hedera transactions, DB transactions
   - Frontend: Client components, custom hooks, Zustand stores, prop typing, semantic HTML
4. **Git Workflow** — Step-by-step branch/commit/PR process
5. **Hedera-Specific Rules** — Cost awareness, HCS best practices, account security
6. **Task Completion Protocol** — How to read tasks, implement, verify
7. **Common Mistakes to Avoid** — 15 detailed explanations with WRONG/CORRECT examples
8. **Security Checklist** — 60+ items covering secrets, validation, auth, data protection
9. **Code Review Process** — Guidelines for authors and reviewers

**Use This As:**
- First document to read before writing any code
- Reference throughout development
- Training material for new team members
- Code review checklist template

---

## How to Use These Documents

### For New Developers

1. Read S06 completely (1 hour) — Understand standards and conventions
2. Read S05 completely (1 hour) — Understand development environment
3. Bookmark both for reference throughout development
4. Before each task, re-read the specific task document

### For Code Reviews

1. Use security checklist from S06 (15 min)
2. Use naming conventions from S06 to check file/function names
3. Use code patterns from S06 to evaluate architecture
4. Use git workflow from S06 to verify commit quality

### For Project Leads

- Use S06 "Code Review Process" section as review template
- Use S06 "Task Completion Protocol" to explain how developers should work
- Reference S06 "Common Mistakes" when training team members
- Reference S05 Troubleshooting when developers have environment issues

---

## Statistics

| Document | Lines | Files | Code Examples | Tables |
|----------|-------|-------|---|---|
| S05 | 1,568 | 16 | 8 complete files | 4 verification tables |
| S06 | 1,816 | 0 | 50+ code examples | 15+ reference tables |
| **Total** | **3,384** | **16** | **58** | **19** |

---

## Key Principles Across Both Documents

### S05 (Infrastructure)
- All env variables validated at startup (fail fast principle)
- Docker multi-stage builds for production
- Health checks for all services
- Clear troubleshooting section

### S06 (Standards)
- Naming conventions for everything (kebab-case files, PascalCase classes)
- Hedera-specific rules (retry logic, cost awareness, encryption)
- Security first (15-item checklist minimum)
- Complete working code examples for every pattern

---

## Before You Start Coding

✓ Read S06 Overview section
✓ Read S06 Project Structure
✓ Read S06 Naming Conventions
✓ Read S06 Common Mistakes to Avoid
✓ Read the specific task document
✓ Check task's "Depends On" section
✓ Understand "Definition of Done" checklist
✓ Set up development environment using S05

---

## Quick Reference Links

**Naming Conventions:** S06 → Naming Conventions section
**Code Patterns:** S06 → Code Patterns & Standards section
**Hedera Rules:** S06 → Hedera-Specific Rules section
**Security:** S06 → Security Checklist section
**Docker:** S05 → Docker Infrastructure section
**Troubleshooting:** S05 → Troubleshooting section
**Git Workflow:** S06 → Git Workflow section
**Code Review:** S06 → Code Review Process section

---

## Next Steps

1. **All developers:** Read S06 (mandatory)
2. **Backend developers:** Follow S05 for environment setup
3. **Before any PR:** Use S06 security checklist
4. **During development:** Reference S06 for naming/patterns
5. **On merge:** Use S06 code review process
