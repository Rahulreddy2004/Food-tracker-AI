import { z } from "zod";

// No `new Function` JIT: the CSP in firebase.json has no 'unsafe-eval', and zod's eval probe
// would otherwise log a violation on every page with a form.
z.config({ jitless: true });

export { z };
