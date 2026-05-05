# ⚠️ READ THIS FIRST — EVERY TURN, BEFORE DOING ANYTHING ⚠️

**Auto-deploy is mandatory and unconditional.** After ANY code change in this turn, you MUST commit and push before ending the turn. No exceptions, no permission questions, no "do you want me to push?". The user has stated this is a hard rule with no exceptions. Re-read this section before responding if you're tempted to skip it.

If you finish editing files and have NOT yet `git add -A && git commit && git push`, you are NOT done. Push first, then respond.

---

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Auto-Deploy Is Mandatory — Commit Everything, Every Time

After ANY code change, without being asked:

1. From `web/`: `git add -A` (EVERYTHING — all modified + untracked, no cherry-picking)
2. `git commit -m "<msg>"`
3. `git push` — Vercel auto-deploys from master
4. Verify with `vercel ls --prod` until status is Ready
5. Report the production URL

Never ask "do you want me to deploy?" — the answer is always yes. Never leave WIP behind. Only skip if the user explicitly says "don't deploy". See `.cursor/rules/auto-deploy.mdc` for full rules.
