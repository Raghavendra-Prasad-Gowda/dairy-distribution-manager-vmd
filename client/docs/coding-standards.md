# 📐 Client Coding Standards

[⬅️ Client README](../README.md) · Binding rules: [client/CLAUDE.md](../CLAUDE.md)

---

## 1. 🧱 Canonical page

```jsx
import { useMemo } from 'react';
import api from '../../api/axios';
import { useApiResource } from '../../hooks/useApiResource';
import { useMutation } from '../../hooks/useMutation';
import BrandedLoader, { TumblerSpinner } from '../../components/ui/BrandedLoader';
import { getIndiaDate } from '../../utils/dateUtils';
import { sortByLayout } from '../../utils/productLayout';

export default function ExamplePage() {
  const today = getIndiaDate();
  const { data: rows = [], loading, refetch } = useApiResource('/products', { params: { date: today } });
  const sorted = useMemo(() => sortByLayout(rows), [rows]);
  const { mutate: save, loading: saving } = useMutation(
    (body) => api.post('/products', body),
    { successMessage: 'Saved', onSuccess: refetch },
  );

  if (loading) return <BrandedLoader size="sm" />;
  return (
    <button onClick={() => save({ /* … */ })} disabled={saving}>
      {saving ? <TumblerSpinner size={14} /> : 'Save'}
    </button>
  );
}
```

## 2. ✅ / ❌ Quick reference

| ✅ Do | ❌ Don't |
|---|---|
| `import api from '../api/axios'` | `fetch`, `axios.create()`, `import axios` |
| `useApiResource` / `useMutation` | copy-paste loading/try/catch blocks |
| `getIndiaDate()` and friends | `new Date()` for a business date |
| `lazy()` pages in `App.jsx` | eager page imports |
| routes only in `App.jsx`, nav in `Layout.jsx` | routes elsewhere |
| `BrandedLoader` / `TumblerSpinner` | `Loader2`, ad-hoc spinners |
| `sortByLayout` for products | alphabetical product lists |
| `notify(msg, type)` | `alert()` |
| controlled inputs, validate before submit | mutate state directly |
| `twMerge(clsx(…))` | string concatenation of class names |

## 3. 🏷️ Naming

| Thing | Convention |
|---|---|
| Page / component | `PascalCase.jsx` |
| Test | `Same.test.jsx` beside the file |
| Hook | `useCamelCase.js` |
| Utility | `camelCase.js`, named exports |
| Print variant | `<Report>Print.jsx` |

## 4. 👀 Review checklist

- [ ] Data via hooks + shared axios
- [ ] IST dates
- [ ] Product lists sorted
- [ ] Loading/empty/error states present
- [ ] Role visibility matches the API rules
- [ ] Works on iPad portrait (hamburger) and phone (salesman)
- [ ] Vitest spec covers the five minimum cases
- [ ] Page objects in `automation-ui/` updated if labels/roles changed
