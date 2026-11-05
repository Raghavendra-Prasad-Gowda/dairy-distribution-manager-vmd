# 🗺️ UI Automation Roadmap

[⬅️ Suite README](../README.md)

---

Journeys ranked by business risk. API behaviour behind each is already covered by `server/automation`; these add the
browser layer.

```mermaid
quadrantChart
    title Priority of journeys to automate
    x-axis Low usage --> High usage
    y-axis Low impact --> High impact
    quadrant-1 Automate next
    quadrant-2 Automate soon
    quadrant-3 Later
    quadrant-4 Nice to have
    Salesman stock entry: [0.9, 0.9]
    Dispatch sheet lock: [0.8, 0.8]
    Stock receipt: [0.85, 0.75]
    Collections: [0.75, 0.7]
    Bill generate and print: [0.5, 0.75]
    Salesman prices: [0.4, 0.7]
    Reports render: [0.6, 0.4]
    Admin users and MFA: [0.2, 0.6]
```

| # | Journey | Device | Needs |
|---|---|---|---|
| 1 | 🛵 Salesman enters and submits today's stock | phone | run-scoped salesman fixture + dispatch cleanup |
| 2 | 📋 Dispatcher locks/unlocks an entry | iPad | dispatcher session (second `setup` project) |
| 3 | 📦 Admin saves a stock receipt on a throwaway brand | iPad | brand/product fixtures |
| 4 | 💰 Admin records a collection and sees the balance change | iPad | salesperson fixture |
| 5 | 🧾 Admin generates and opens a bill | iPad | dispatch data fixture |
| 6 | 🏷️ Admin edits a salesperson price | iPad | salesperson + product fixtures |
| 7 | 📊 Reports render for a date range | iPad | read-only |
| 8 | 👑 Superadmin manages an admin user | iPad | superadmin session |
