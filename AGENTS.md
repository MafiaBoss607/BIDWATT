<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Marketplace reads/writes go through the browser data client with row-level security as the authority; why: keeps the first slices small while the database enforces ownership.
- Money and request-limit validation lives in src/lib/pricing.ts with tests, mirroring database checks; why: brief requires tests for money paths.
