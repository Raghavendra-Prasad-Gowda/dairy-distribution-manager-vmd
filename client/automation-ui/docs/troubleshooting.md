# 🛟 Troubleshooting

[⬅️ Suite README](../README.md)

---

```mermaid
flowchart TD
    F[❌ UI run failed] --> A{Landed on a Vercel login page?}
    A -- yes --> A1[VERCEL_BYPASS_SECRET missing/wrong]
    A -- no --> B{setup project failed at sign-in?}
    B -- yes --> B1[admin has MFA · password changed · account locked · 20/h limit]
    B -- no --> C{Timeout on first navigation?}
    C -- yes --> C1[Render cold start → rerun or raise UI_TIMEOUT_MS]
    C -- no --> D{Locator not found?}
    D -- yes --> D1[UI text/role changed → update the page object]
    D -- no --> E[open trace: npx playwright show-trace]
```

| Symptom | Cause | Fix |
|---|---|---|
| Passes in landscape, fails in portrait | Element hidden behind the hamburger menu | Open the menu in the page object when narrow |
| "Element is outside viewport" | Wide tables | `scrollIntoViewIfNeeded()` in the page object |
| Next click does nothing after save | Blocking Success/Error modal | `acknowledgeNotice(...)` |
| Leftover `E2E-…` routes | Run killed before fixture teardown | Delete in Route Setup; harmless |
| `test.only` error on CI | `forbidOnly` | Remove `.only` |
| Browser download blocked locally | No internet / sandbox | Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` |
| Admin locked out | Wrong-password test used the real username | Use an unknown username; unlock via superadmin |
