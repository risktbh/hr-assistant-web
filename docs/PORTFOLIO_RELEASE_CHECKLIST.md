# 9G Portfolio-Ready Release Checklist

## 9G.1 Repository story
- [ ] Replace default README with portfolio README.
- [ ] Verify live-demo URL.
- [ ] Confirm repository description and GitHub topics.

## 9G.2 Visual evidence
Capture clean screenshots:
- [ ] AI chat + handbook RAG answer
- [ ] Leave page
- [ ] Overtime request / approval status
- [ ] Reimbursement page
- [ ] Employee directory
- [ ] n8n approval workflow
- [ ] Optional mobile view

Recommended location:

```text
docs/screenshots/
```

Suggested names:

```text
01-ai-rag.png
02-leave.png
03-overtime.png
04-reimbursement.png
05-directory.png
06-n8n-workflow.png
07-mobile.png
```

## 9G.3 Portfolio narrative
- [ ] Architecture notes committed.
- [ ] Demo script committed.
- [ ] Explain RAG vs transactional-state separation.
- [ ] Explain draft/confirmation boundary.
- [ ] Explain human-in-the-loop approvals.
- [ ] Explain freshness protection.

## 9G.4 Validation evidence
- [x] Full production regression executed.
- [x] 71 PASS.
- [x] 0 FAIL.
- [ ] Decide whether to commit a sanitized regression summary.

Do not commit artifacts that contain secrets, private employee data, or sensitive workflow payloads.

## 9G.5 Security closure
Current project can be presented as a portfolio deployment, but final security closure is still pending:

- [ ] 9E.4 rotate Supabase database credentials.
- [ ] 9E.5 delete secret-bearing `.bak` files and temporary security helpers.
- [ ] Re-run short DB smoke test afterward.

Do not label the deployment as security-final or enterprise-production-ready until those items are complete.

## 9G.6 Repository hygiene
Before release:

```powershell
git status --short
git diff --check
git diff --cached --check
npm run build
```

Expected:

```text
clean worktree
build successful
```

## 9G.7 Suggested release naming

While 9E.4 / 9E.5 remain deferred:

```text
v0.9.0-portfolio
```

After security closure:

```text
v1.0.0
```

## 9G.8 Suggested GitHub description

```text
Agentic HR copilot with Gemini, RAG, pgvector, Prisma, and n8n human-in-the-loop workflows for leave, overtime, and reimbursement.
```

Suggested GitHub topics:

```text
ai-engineer
agentic-ai
rag
gemini
langchain
nextjs
typescript
pgvector
supabase
prisma
n8n
workflow-automation
human-in-the-loop
```
