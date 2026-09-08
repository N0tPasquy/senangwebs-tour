import { createRequire } from 'module';
const req = createRequire(import.meta.url);
console.log('require "." ?', req.resolve('senangwebs-tour'));
try { console.log('require "./dist/swt.cjs" ?', req.resolve('senangwebs-tour/dist/swt.cjs')); } catch (e) { console.log('cjs ERR', e.message); }
try { const u = import.meta.resolve('senangwebs-tour'); console.log('esm "." ?', u); } catch (e) { console.log('esm ERR', e.message); }
