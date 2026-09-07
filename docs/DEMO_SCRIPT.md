# Portfolio Demo Script — People Assistant

Use this as a short recruiter/interviewer walkthrough.

## 5-minute demo

### 1. Start with policy-grounded RAG

Ask:

```text
Berapa jatah cuti tahunan berdasarkan kebijakan perusahaan?
```

Explain:

- The assistant routes a policy question to RAG.
- Gemini embeddings retrieve the relevant handbook chunks from pgvector.
- The policy document is the source for the answer.

### 2. Show personal employee context

Ask:

```text
Siapa saya dan apa jabatan saya?
```

Explain:

- Personal employee data comes from the transactional database.
- It is not inferred from the RAG document.
- Demo identity is server-scoped.

### 3. Show an agentic business action

Ask:

```text
Saya mau lembur tanggal 8 September 2026 dari jam 19:00 sampai 24:00
untuk final deployment.
```

Explain:

- Natural language is parsed into structured fields.
- The request is policy-validated.
- `24:00` is handled as the end of day, producing a five-hour duration.
- The assistant creates a draft first.
- Nothing is submitted until explicit confirmation.

### 4. Confirm and show human approval

Confirm the generated draft.

Then show the n8n workflow:

```text
Webhook
→ Normalize Data
→ Manager Approval
→ Manager Decision Callback
→ Optional Second Approval
→ Workflow Completed
→ Employee Notification
```

Explain:

- n8n is orchestrating the human workflow.
- Protected callbacks update the real transaction.
- AI does not approve its own request.

### 5. Show freshness

After the workflow is approved, ask:

```text
Cek status lembur saya.
```

Explain:

- The AI re-reads PostgreSQL.
- Old chat history is not treated as the final status.
- The production freshness regression explicitly tested stale-history resistance.

## 30-second elevator pitch

> People Assistant is an agentic HR copilot built with Next.js, Gemini, LangChain, Supabase PostgreSQL with pgvector, Prisma, and n8n. Unlike a normal HR chatbot, it combines RAG with real transactional workflows. The model can understand employee intent and prepare actions, but request ownership, deterministic validation, explicit confirmation, human approval, and current status remain controlled by the application and database.

## Interview talking points

### Why not let the LLM write directly to the database?

Because natural-language interpretation is probabilistic. The system creates a validated draft and requires explicit confirmation before mutating business state.

### Why both RAG and database tools?

RAG is appropriate for policy knowledge. A transactional database is appropriate for current employee/request state. Mixing them would create stale or incorrect answers.

### Why n8n?

It makes the human approval layer explicit, observable, and independently orchestrated while the Next.js app remains the system interface and transactional owner.

### What would you add for enterprise production?

- SSO / OIDC
- RBAC and fine-grained authorization
- National holiday service
- Enterprise audit retention
- Observability / tracing
- Rate limiting
- Queue/retry strategy
- Formal secrets management
- HRIS / payroll integrations
