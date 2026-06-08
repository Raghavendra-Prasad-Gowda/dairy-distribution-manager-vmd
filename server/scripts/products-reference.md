# Products Reference — Code to App Name Mapping

## Jersey

| Code | App Name | Cost Price | Selling Price | Notes |
|------|----------|-----------|--------------|-------|
| HM | HTM 500ml | ₹23.15 | ₹25 | ✅ confirmed |
| U | HTM 225ml | ₹9.90 | ₹14 | ✅ confirmed |
| FCM | HFCM 500ml | ₹30.75 | ₹35 | ✅ confirmed |
| Gold | STM 500ml | ₹26.50 | ₹30 | ✅ confirmed |
| BM | Butter Milk | ₹5.00 | ₹10 | ✅ confirmed (no size set — piece) |
| BC | DTM Curd 1000g | ₹47.49 | ₹60 | ✅ confirmed |
| BC | DTM Curd 450g | ₹24.70 | ₹30 | in app, not in price sheet |
| SC | DTM Curd 140g | ₹7.40 | ₹10 | ✅ confirmed |

> Also active in app but not in price sheet: HTM 1000ml (₹46.30 / ₹50) · STM 1000ml (₹53 / ₹60) · HFCM 1000ml (₹60.80 / ₹70)

---

## Gowardhan

| Code | App Name | Cost Price | Selling Price | Notes |
|------|----------|-----------|--------------|-------|
| M | TM 450ml | ₹21.04 | ₹25 | ✅ confirmed |
| Q (QTR) | TM 225ml | ₹11.30 | ₹14 | ✅ confirmed |
| BC | DTM Curd 500g | ₹22.88 | ₹30 | ✅ confirmed |
| SC | DTM Curd 200g | ₹9.77 | ₹14 | ✅ confirmed |
| Gold | GOLD Milk 1000ml | ₹50.80 | ₹60 | ✅ confirmed |

> Also active in app but not in price sheet: TM 1000ml (₹42.15 / ₹50) · TEA Special 1000ml (₹56 / ₹60)

---

## Nandini

| Code | App Name | Cost Price | Selling Price | Notes |
|------|----------|-----------|--------------|-------|
| HM | Homoginsed Milk 500ml | ₹22.45 | ₹24 | ✅ confirmed |
| TM | Toned Milk 1000ml | ₹43.00 | ₹46 | ✅ confirmed |
| Q | Homoginsed Milk 250ml | ₹13.13 | ₹14 | ✅ confirmed (Q = quarter size) |
| HCM | Homogensed Cow Milk 500ml | ₹24.35 | ₹26 | ✅ confirmed |
| Red | Shubam Milk 500ml | ₹25.30 | ₹27 | ✅ confirmed |
| N1000 | Nandini Special Milk 1000ml | ₹48.30 | ₹52 | ✅ confirmed |
| N500 | Nandini Special Milk 500ml | ₹25.15 | ₹27 | ✅ confirmed |
| N250 | Nandini Special Milk 250ml | ₹13.83 | ₹15 | ✅ confirmed |
| B1000 | Curd 1000g | ₹48.84 | ₹54 | ✅ confirmed |
| B500 | Curd 500g | ₹25.34 | ₹28 | ✅ confirmed |
| Q200 | Curd 200g | ₹11.79 | ₹13 | ✅ confirmed |

---

## Data quality issue to fix

| Brand | Issue |
|-------|-------|
| Gowardhan | DTM Curd 500g and DTM Curd 200g have `unitType = piece` with no gram size set — should be `unitType = gram` like Jersey's DTM curds |
