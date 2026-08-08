// Run both built-in test modules in one process. This keeps the suite dependency-free and
// works in restricted environments where node --test cannot spawn isolated workers.
import './carousel-engine.test.js';
import './company-engine.test.js';
import './hook-engine.test.js';
