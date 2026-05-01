<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Auto-Deploy Is Mandatory

After ANY code change, without being asked:

1. `cd web && git add -A && git commit -m "<msg>" && git push`
2. `vercel --prod` from `web/`
3. Report the production URL.

Never ask "do you want me to deploy?" — the answer is always yes. Only skip if the user explicitly says "don't deploy". See `.cursor/rules/auto-deploy.mdc` for full rules.
